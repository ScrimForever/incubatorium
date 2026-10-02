from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession
from src.domain.models.questionarios.arquivos import preservar_arquivos
from src.domain.models.questionarios.notas import zerar_notas
from src.domain.models.questionarios.questionario import Questionario
from src.domain.schemas.questionario_schema import QuestionarioInputSchema
from src.infra.db import User
from src.logger import logger
from src.repository.questionario.questionario_rep import QuestionarioRepository
from src.shared.exceptions import ConflitoError
from src.shared.validacao_arquivos import rejeitar_anexos_embutidos


class QuestionarioService:
    def __init__(
        self,
        user: User,
        db: AsyncSession,
        repository: QuestionarioRepository | None = None,
    ):
        self.user = user
        self.repository = repository or QuestionarioRepository(user, db)

    async def buscar(self) -> Questionario | Literal[False]:
        return await self.repository.buscar_questionario()

    async def criar(self, entrada: QuestionarioInputSchema) -> Questionario:
        """Grava o primeiro questionário do usuário (409 se ele já existir).

        Anexos entram só pelo endpoint de arquivos (422 se vierem embutidos no JSON),
        e notas e referências de anexos são do servidor: o incubado não as define.
        """
        rejeitar_anexos_embutidos(entrada.json_questionario)
        if entrada.json_questionario:
            entrada = entrada.model_copy(
                update={
                    "json_questionario": preservar_arquivos(
                        zerar_notas(entrada.json_questionario), None
                    )
                }
            )
        questionario = await self.repository.gravar_questionario(entrada)
        if not questionario:
            logger.warning(f"Questionário existe para usuário: {self.user.email}")
            raise ConflitoError(
                "Questionario já existe. Não é possível criar um novo questionario."
            )
        return questionario
