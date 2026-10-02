import re
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from src.domain.models.enums import SituacaoIncubacao
from src.domain.models.questionarios.arquivos import reescrever_caminhos
from src.domain.models.questionarios.notas import zerar_notas
from src.domain.models.questionarios.questionario import Questionario, StatusEnum
from src.infra.db import User
from src.logger import logger
from src.shared.armazenamento import sanitizar_email
from src.shared.exceptions import ConflitoError


def chave_arquivada(email: str, ordem: int) -> str:
    return f"{email}_{ordem}"


def _ordem_arquivada(email: str, chave: str) -> int | None:
    casado = re.fullmatch(rf"{re.escape(email)}_([0-9]+)", chave)
    return int(casado.group(1)) if casado else None


class IngressoRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def buscar_questionario(self, email: str) -> Questionario | None:
        resultado = await self.db.execute(
            select(Questionario).where(Questionario.usuario_email == email)
        )
        return resultado.scalar_one_or_none()

    async def buscar_para_atualizar(self, email: str) -> Questionario | None:
        """Como `buscar_questionario`, mas bloqueia a linha até o fim da transação.

        Evita que o `PUT` do incubado sobrescreva uma nota gravada no mesmo instante
        pelo consultor (que também lê com `FOR UPDATE`).
        """
        resultado = await self.db.execute(
            select(Questionario)
            .where(Questionario.usuario_email == email)
            .with_for_update()
        )
        return resultado.scalar_one_or_none()

    async def buscar_usuario(self, email: str) -> User | None:
        resultado = await self.db.execute(select(User).where(User.email == email))
        return resultado.scalar_one_or_none()

    async def listar_pedidos(self, status: StatusEnum | None = None):
        """Questionários vigentes (os arquivados não têm usuário com a mesma chave)."""
        consulta = select(Questionario).join(
            User, User.email == Questionario.usuario_email
        )
        if status is not None:
            consulta = consulta.where(Questionario.status_questionario == status)
        consulta = consulta.order_by(Questionario.criado_em, Questionario.usuario_email)
        resultado = await self.db.execute(consulta)
        return list(resultado.scalars().all())

    async def listar_historico(self, email: str) -> list[tuple[int, Questionario]]:
        """Questionários arquivados do usuário, em ordem de envio."""
        padrao = (
            email.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "\\_%"
        )
        resultado = await self.db.execute(
            select(Questionario).where(
                Questionario.usuario_email.like(padrao, escape="\\")
            )
        )
        itens = []
        for questionario in resultado.scalars().all():
            ordem = _ordem_arquivada(email, questionario.usuario_email)
            if ordem is not None:
                itens.append((ordem, questionario))
        return sorted(itens, key=lambda item: item[0])

    async def salvar(self) -> None:
        try:
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise

    async def gravar_decisao(
        self,
        questionario: Questionario,
        status: StatusEnum,
        decisor_email: str,
        motivo: str | None = None,
    ) -> Questionario:
        """Grava aprovação/rejeição; na aprovação o usuário passa a incubado `ativo`."""
        agora = datetime.now(UTC)
        questionario.status_questionario = status
        questionario.decidido_por = decisor_email
        questionario.decidido_em = agora
        questionario.motivo_decisao = motivo
        questionario.atualizado_por = decisor_email
        questionario.atualizado_em = agora
        if status == StatusEnum.aprovado:
            usuario = await self.buscar_usuario(questionario.usuario_email)
            if usuario is not None:
                usuario.situacao_incubacao = SituacaoIncubacao.ativo
                usuario.situacao_alterada_em = agora
                usuario.situacao_alterada_por = decisor_email
        try:
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise
        return questionario

    async def arquivar_e_criar_novo(self, email: str) -> tuple[int, Questionario]:
        """Arquiva o questionário rejeitado e cria o novo vigente, numa transação.

        O rejeitado tem a chave trocada para `<email>_<n>` (n = ordem do questionário:
        arquivados + 1) e o novo nasce com a chave `<email>`, status `pendente` e as
        respostas copiadas do rejeitado.
        """
        rejeitado = await self.buscar_questionario(email)
        if rejeitado is None or rejeitado.status_questionario != StatusEnum.rejeitado:
            raise ConflitoError("Não há questionário rejeitado para arquivar.")

        ordem = len(await self.listar_historico(email)) + 1
        # o novo questionário parte das respostas anteriores, mas sem as notas dadas
        json_copiado = zerar_notas(rejeitado.json_questionario)
        # as referências do arquivado passam a apontar para a pasta arquivada
        json_arquivado = reescrever_caminhos(
            rejeitado.json_questionario,
            sanitizar_email(email),
            sanitizar_email(chave_arquivada(email, ordem)),
        )
        # a linha rejeitada muda de chave: sai da sessão para não colidir com a nova
        self.db.expunge(rejeitado)
        try:
            await self.db.execute(
                update(Questionario)
                .where(Questionario.usuario_email == email)
                .values(
                    usuario_email=chave_arquivada(email, ordem),
                    json_questionario=json_arquivado,
                )
            )
            novo = Questionario(
                usuario_email=email,
                criado_por=email,
                status_questionario=StatusEnum.pendente,
                json_questionario=json_copiado,
            )
            self.db.add(novo)
            await self.db.commit()
        except SQLAlchemyError as e:
            await self.db.rollback()
            logger.error(f"Falha ao arquivar o questionário de {email}: {e}")
            raise
        return ordem, novo
