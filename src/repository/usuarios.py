from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from src.domain.models.enums import SituacaoIncubacao
from src.domain.models.questionario import Questionario
from src.domain.models.usuario import User, gerar_codigo_ativacao
from src.logger import logger
from src.repository.base import Repositorio


class UsuariosRepository(Repositorio):
    async def buscar_por_email(self, email: str) -> User | None:
        resultado = await self.db.execute(select(User).where(User.email == email))
        return resultado.scalar_one_or_none()

    async def buscar_por_id(self, user_id) -> User | None:
        return await self.db.get(User, user_id)

    async def buscar_codigo_ativacao(self, email: str) -> str | None:
        usuario = await self.buscar_por_email(email)
        return None if usuario is None else usuario.codigo_ativacao

    async def ativar_por_codigo(self, email: str, codigo: str) -> bool:
        """Ativa a conta se o código confere. Falha no commit é logada e vira `False`."""
        usuario = await self.buscar_por_email(email)
        if usuario is None or usuario.codigo_ativacao != codigo:
            return False
        usuario.is_active = True
        usuario.codigo_ativacao = None
        try:
            await self.salvar()
        except SQLAlchemyError as e:
            logger.error(e)
            return False
        return True

    async def gerar_novo_codigo(self, usuario: User) -> None:
        usuario.codigo_ativacao = gerar_codigo_ativacao()
        await self.salvar()

    async def painel_incubados(
        self, situacao: SituacaoIncubacao | None = None
    ) -> list[dict]:
        """Uma única consulta: situação e estado do plano."""
        consulta = (
            select(
                User.email,
                User.situacao_incubacao,
                Questionario.status_questionario,
            )
            .join(Questionario, Questionario.usuario_email == User.email)
            .where(User.is_incubado.is_(True), User.situacao_incubacao.is_not(None))
            .order_by(User.email)
        )
        if situacao is not None:
            consulta = consulta.where(User.situacao_incubacao == situacao)
        linhas = (await self.db.execute(consulta)).all()
        return [
            {
                "email": email,
                "situacao": sit,
                "status_questionario": status.value,
            }
            for email, sit, status in linhas
        ]

    async def emails_incubados_ativos(self) -> list[str]:
        """Contas ativas de incubados em incubação (destinatários dos avisos de agenda)."""
        resultado = await self.db.execute(
            select(User.email)
            .where(
                User.is_incubado.is_(True),
                User.is_active.is_(True),
                User.situacao_incubacao == SituacaoIncubacao.ativo,
            )
            .order_by(User.email)
        )
        return list(resultado.scalars().all())

    async def alterar_situacao(
        self, usuario: User, situacao: SituacaoIncubacao, autor: str
    ) -> User:
        usuario.situacao_incubacao = situacao
        usuario.situacao_alterada_em = datetime.now(UTC)
        usuario.situacao_alterada_por = autor
        await self.salvar()
        return usuario
