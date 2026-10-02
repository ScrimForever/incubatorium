from sqlalchemy.ext.asyncio import AsyncSession
from src.domain.models.questionarios.arquivos import (
    adicionar_referencias,
    remover_referencias,
)
from src.domain.models.questionarios.etapas import etapa_existe
from src.domain.models.questionarios.questionario import Questionario, StatusEnum
from src.logger import logger
from src.repository.arquivos.arquivos_rep import ArquivosRepository
from src.shared.exceptions import (
    ConflitoError,
    EtapaInvalidaError,
    NaoEncontradoError,
)

STATUS_EDITAVEIS = (StatusEnum.iniciado, StatusEnum.pendente, StatusEnum.aprovado)


class ArquivosService:
    """Mantém no questionário a referência de cada arquivo enviado ou removido."""

    def __init__(self, db: AsyncSession, repository: ArquivosRepository | None = None):
        self.db = db
        self.repository = repository or ArquivosRepository(db)

    @staticmethod
    def _checar_edicao(questionario: Questionario | None, aba: int) -> Questionario:
        if not etapa_existe(aba):
            raise EtapaInvalidaError(aba)
        if questionario is None:
            raise NaoEncontradoError("Questionário não encontrado.")
        if questionario.status_questionario not in STATUS_EDITAVEIS:
            raise ConflitoError(
                "Não é possível alterar anexos no estado "
                f"'{questionario.status_questionario.value}'."
            )
        return questionario

    async def verificar_edicao(self, email: str, aba: int) -> Questionario:
        """Antes de gravar/apagar arquivos: etapa válida, questionário existe e é editável."""
        return self._checar_edicao(await self.repository.buscar(email), aba)

    async def registrar(self, email: str, aba: int, referencias: list[dict]) -> dict:
        """Inclui as referências na etapa (o mesmo `caminho` substitui, sem duplicar)."""
        questionario = self._checar_edicao(
            await self.repository.buscar_para_atualizar(email), aba
        )
        novo = adicionar_referencias(questionario.json_questionario, aba, referencias)
        await self.repository.gravar_json(questionario, novo, email)
        logger.info(
            f"{len(referencias)} anexo(s) referenciado(s) na etapa {aba} de {email}."
        )
        return novo

    async def remover(self, email: str, aba: int, nomes: list[str]) -> dict:
        """Remove da etapa as referências dos arquivos `nomes`."""
        questionario = self._checar_edicao(
            await self.repository.buscar_para_atualizar(email), aba
        )
        novo = remover_referencias(questionario.json_questionario, aba, nomes)
        await self.repository.gravar_json(questionario, novo, email)
        return novo
