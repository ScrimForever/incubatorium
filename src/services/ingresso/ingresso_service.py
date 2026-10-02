import asyncio
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession
from src.domain.models.questionarios.arquivos import preservar_arquivos
from src.domain.models.questionarios.etapas import ETAPAS, etapa_respondida
from src.domain.models.questionarios.notas import mesclar_preservando_notas
from src.domain.models.questionarios.questionario import Questionario, StatusEnum
from src.domain.schemas.questionario_schema import QuestionarioInputSchema
from src.infra.db import User
from src.logger import logger
from src.repository.ingresso.ingresso_rep import IngressoRepository, chave_arquivada
from src.services.email.setup import EmailSetup
from src.shared.armazenamento import arquivar_pasta
from src.shared.exceptions import (
    ConflitoError,
    MotivoObrigatorioError,
    NaoEncontradoError,
    PedidoJaDecididoError,
    SemPermissaoError,
    ValidacaoNegocioError,
)
from src.shared.validacao_arquivos import rejeitar_anexos_embutidos

STATUS_EDITAVEIS = (StatusEnum.iniciado, StatusEnum.pendente)


class IngressoService:
    def __init__(
        self,
        db: AsyncSession,
        email_service: EmailSetup | None = None,
        repository: IngressoRepository | None = None,
    ):
        self.db = db
        self.repository = repository or IngressoRepository(db)
        self.email_service = email_service or EmailSetup()

    async def _questionario_ou_erro(
        self, email: str, para_atualizar: bool = False
    ) -> Questionario:
        buscar = (
            self.repository.buscar_para_atualizar
            if para_atualizar
            else self.repository.buscar_questionario
        )
        questionario = await buscar(email)
        if questionario is None:
            raise NaoEncontradoError("Questionário não encontrado.")
        return questionario

    async def _notificar(self, email: str, aprovado: bool, motivo: str | None) -> None:
        try:
            await self.email_service.enviar_email_decisao_ingresso(
                email, aprovado, motivo
            )
        except Exception as e:  # noqa: BLE001 - a decisão já foi gravada; o e-mail não a derruba
            logger.error(f"Falha ao notificar a decisão para {email}: {e}")

    async def enviar(self, user: User) -> Questionario:
        """Envia o questionário para análise (`pendente|iniciado` → `aguardando_aprovacao`)."""
        questionario = await self._questionario_ou_erro(user.email)
        if questionario.status_questionario not in STATUS_EDITAVEIS:
            raise ConflitoError(
                "O questionário não pode ser enviado no estado "
                f"'{questionario.status_questionario.value}'."
            )
        if not any(
            etapa_respondida(questionario.json_questionario, e.id) for e in ETAPAS
        ):
            raise ValidacaoNegocioError(
                "Preencha o questionário antes de enviá-lo para análise."
            )
        questionario.status_questionario = StatusEnum.aguardando_aprovacao
        questionario.atualizado_por = user.email
        await self.repository.salvar()
        logger.info(f"Questionário de {user.email} enviado para análise.")
        return questionario

    async def atualizar_plano(
        self, user: User, entrada: QuestionarioInputSchema
    ) -> Questionario:
        """Grava as respostas do questionário respeitando o estado do pedido.

        - `iniciado|pendente`: aceita `iniciado`, `pendente` e `aguardando_aprovacao`
          (este equivale a enviar para análise); `aprovado|rejeitado` não podem ser
          definidos pelo próprio incubado.
        - `aprovado`: atualiza o plano vigente sem mudar o status.
        - `aguardando_aprovacao|rejeitado`: bloqueado (rejeitado exige reiniciar).
        """
        questionario = await self._questionario_ou_erro(user.email, para_atualizar=True)
        atual = questionario.status_questionario
        novo = entrada.status_questionario

        if atual in (StatusEnum.aguardando_aprovacao, StatusEnum.rejeitado):
            raise ConflitoError(
                f"O questionário não pode ser editado no estado '{atual.value}'."
            )
        if atual == StatusEnum.aprovado:
            if novo != StatusEnum.aprovado:
                raise ConflitoError("O status de um plano aprovado não pode mudar.")
        elif novo in (StatusEnum.aprovado, StatusEnum.rejeitado):
            raise SemPermissaoError("A decisão sobre o pedido é da incubadora.")

        # anexos entram só pelo endpoint de arquivos (422 se vierem embutidos no JSON)
        if "json_questionario" in entrada.model_fields_set:
            rejeitar_anexos_embutidos(entrada.json_questionario)
        # notas e referências de anexos são do servidor: valem as já gravadas
        json_final = (
            preservar_arquivos(
                mesclar_preservando_notas(
                    entrada.json_questionario, questionario.json_questionario
                ),
                questionario.json_questionario,
            )
            if "json_questionario" in entrada.model_fields_set
            else questionario.json_questionario
        )
        enviando = (
            atual != StatusEnum.aprovado and novo == StatusEnum.aguardando_aprovacao
        )
        if enviando and not any(etapa_respondida(json_final, e.id) for e in ETAPAS):
            raise ValidacaoNegocioError(
                "Preencha o questionário antes de enviá-lo para análise."
            )

        questionario.json_questionario = json_final
        if atual != StatusEnum.aprovado:
            questionario.status_questionario = novo
        questionario.atualizado_por = user.email
        questionario.atualizado_em = datetime.now(UTC)
        await self.repository.salvar()
        return questionario

    async def reiniciar(self, user: User) -> Questionario:
        """Arquiva o questionário rejeitado e devolve o novo, copiado dele."""
        questionario = await self._questionario_ou_erro(user.email)
        if questionario.status_questionario != StatusEnum.rejeitado:
            raise ConflitoError("Só é possível reiniciar um questionário rejeitado.")
        ordem, novo = await self.repository.arquivar_e_criar_novo(user.email)
        try:
            await asyncio.to_thread(arquivar_pasta, user.email, ordem)
        except OSError as e:
            logger.error(
                f"Anexos de {chave_arquivada(user.email, ordem)} não foram arquivados: {e}"
            )
        logger.info(f"Questionário de {user.email} arquivado como ordem {ordem}.")
        return novo

    async def aprovar(self, decisor: User, email: str) -> Questionario:
        questionario = await self._questionario_ou_erro(email)
        if questionario.status_questionario != StatusEnum.aguardando_aprovacao:
            raise PedidoJaDecididoError()
        await self.repository.gravar_decisao(
            questionario, StatusEnum.aprovado, decisor.email
        )
        logger.success(f"Ingresso de {email} aprovado por {decisor.email}.")
        await self._notificar(email, True, None)
        return questionario

    async def rejeitar(self, decisor: User, email: str, motivo: str) -> Questionario:
        motivo = (motivo or "").strip()
        if not motivo:
            raise MotivoObrigatorioError()
        questionario = await self._questionario_ou_erro(email)
        if questionario.status_questionario != StatusEnum.aguardando_aprovacao:
            raise PedidoJaDecididoError()
        await self.repository.gravar_decisao(
            questionario, StatusEnum.rejeitado, decisor.email, motivo
        )
        logger.warning(f"Ingresso de {email} rejeitado por {decisor.email}.")
        await self._notificar(email, False, motivo)
        return questionario

    async def listar_pedidos(self, status: StatusEnum | None = None):
        return await self.repository.listar_pedidos(status)

    async def historico(self, solicitante: User, email: str):
        if solicitante.email != email and not solicitante.is_colaborador:
            raise SemPermissaoError()
        itens = await self.repository.listar_historico(email)
        return [
            {
                "chave": q.usuario_email,
                "ordem": ordem,
                "status_questionario": q.status_questionario,
                "json_questionario": q.json_questionario,
                "criado_em": q.criado_em,
                "decidido_por": q.decidido_por,
                "decidido_em": q.decidido_em,
                "motivo_decisao": q.motivo_decisao,
            }
            for ordem, q in itens
        ]
