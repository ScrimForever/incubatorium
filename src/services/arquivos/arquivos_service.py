from sqlalchemy.ext.asyncio import AsyncSession
from src.domain.models.questionarios.questionario import Questionario, StatusEnum
from src.repository.arquivos.arquivos_rep import ArquivosRepository
from src.shared.exceptions import ConflitoError, NaoEncontradoError

STATUS_EDITAVEIS = (StatusEnum.iniciado, StatusEnum.pendente, StatusEnum.aprovado)


class ArquivosService:
    """Regra de edição dos anexos: o questionário existe e está em estado editável."""

    def __init__(self, db: AsyncSession, repository: ArquivosRepository | None = None):
        self.db = db
        self.repository = repository or ArquivosRepository(db)

    @staticmethod
    def _checar_edicao(questionario: Questionario | None) -> Questionario:
        if questionario is None:
            raise NaoEncontradoError("Questionário não encontrado.")
        if questionario.status_questionario not in STATUS_EDITAVEIS:
            raise ConflitoError(
                "Não é possível alterar anexos no estado "
                f"'{questionario.status_questionario.value}'."
            )
        return questionario

    async def verificar_edicao(self, email: str) -> Questionario:
        """Antes de gravar/apagar arquivos: questionário existe e é editável."""
        return self._checar_edicao(await self.repository.buscar(email))
