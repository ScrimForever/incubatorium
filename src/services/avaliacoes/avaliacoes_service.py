from sqlalchemy.ext.asyncio import AsyncSession
from src.domain.models.enums import SituacaoIncubacao
from src.domain.models.questionarios.etapas import (
    etapa_avaliavel,
    etapa_existe,
    etapa_respondida,
    obter_etapa,
)
from src.domain.models.questionarios.questionario import StatusEnum
from src.domain.schemas.avaliacao_schema import AvaliacaoInput
from src.infra.db import User
from src.logger import logger
from src.repository.avaliacao.avaliacao_rep import AvaliacaoRepository
from src.repository.ingresso.ingresso_rep import IngressoRepository
from src.services.email.setup import EmailSetup
from src.shared.datas import agora
from src.shared.exceptions import (
    ConflitoError,
    EtapaInvalidaError,
    EtapaNaoAvaliavelError,
    EtapaSemRespostaError,
    NaoEncontradoError,
    SemPermissaoError,
    ValidacaoNegocioError,
)
from src.shared.permissoes import pode_acessar_incubado

STATUS_AVALIAVEIS = (StatusEnum.aguardando_aprovacao, StatusEnum.aprovado)
SITUACOES_ENCERRADAS = (SituacaoIncubacao.concluido, SituacaoIncubacao.desistente)


class AvaliacoesService:
    def __init__(
        self,
        db: AsyncSession,
        email_service: EmailSetup | None = None,
        repository: AvaliacaoRepository | None = None,
    ):
        self.db = db
        self.repository = repository or AvaliacaoRepository(db)
        self.email_service = email_service or EmailSetup()

    async def avaliar(
        self, consultor: User, email: str, etapa_id: int, dados: AvaliacaoInput
    ) -> dict:
        """Grava a nota da etapa em `json_questionario[etapa].nota` (substitui a anterior)."""
        if not consultor.is_consultor:
            raise SemPermissaoError("Só consultores avaliam incubados.")
        if not etapa_existe(etapa_id):
            raise EtapaInvalidaError(etapa_id)
        if not etapa_avaliavel(etapa_id):
            raise EtapaNaoAvaliavelError(etapa_id)
        if not 1 <= dados.nota <= 5:
            raise ValidacaoNegocioError("A nota deve ser um inteiro de 1 a 5.")
        if not dados.parecer.strip():
            raise ValidacaoNegocioError("O parecer é obrigatório.")

        incubado = await IngressoRepository(self.db).buscar_usuario(email)
        if incubado is None or not incubado.is_incubado:
            raise NaoEncontradoError("Incubado não encontrado.")
        if incubado.situacao_incubacao in SITUACOES_ENCERRADAS:
            raise ConflitoError("O incubado já encerrou a incubação.")

        questionario = await self.repository.buscar_questionario(
            email, para_atualizar=True
        )
        if questionario is None:
            raise NaoEncontradoError("O incubado ainda não possui questionário.")
        if questionario.status_questionario not in STATUS_AVALIAVEIS:
            raise ConflitoError(
                "Só é possível avaliar pedidos em análise ou aprovados "
                f"(estado atual: '{questionario.status_questionario.value}')."
            )
        if not etapa_respondida(questionario.json_questionario, etapa_id):
            raise EtapaSemRespostaError(etapa_id)

        nota = await self.repository.gravar_nota(
            questionario,
            etapa_id,
            dados.nota,
            dados.parecer.strip(),
            consultor.email,
            agora(),
        )
        logger.info(f"Etapa {etapa_id} de {email} avaliada por {consultor.email}.")
        try:
            await self.email_service.enviar_email_nova_avaliacao(
                email, obter_etapa(etapa_id).titulo, dados.nota, nota["texto"]
            )
        except Exception as e:  # noqa: BLE001 - a nota já foi gravada; o e-mail não a derruba
            logger.error(f"Falha ao notificar a avaliação para {email}: {e}")
        return self._saida(etapa_id, nota)

    async def listar(self, solicitante: User, email: str) -> list[dict]:
        if not await pode_acessar_incubado(self.db, solicitante, email):
            raise SemPermissaoError()
        questionario = await self.repository.buscar_questionario(email)
        if questionario is None:
            return []
        return [
            self._saida(etapa_id, nota)
            for etapa_id, nota in self.repository.listar_notas(questionario)
        ]

    @staticmethod
    def _saida(etapa_id: int, nota: dict) -> dict:
        return {
            "etapa_id": etapa_id,
            "titulo": obter_etapa(etapa_id).titulo,
            "nota": nota.get("valor"),
            "parecer": nota.get("texto") or "",
            "avaliador": nota.get("avaliador"),
            "avaliado_em": nota.get("avaliado_em"),
        }
