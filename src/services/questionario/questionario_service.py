from datetime import UTC, datetime
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession
from src.domain.models.questionarios.questionario import Questionario
from src.domain.schemas.questionario_schema import QuestionarioInputSchema
from src.infra.db import User
from src.logger import logger
from src.repository.questionario.questionario_rep import QuestionarioRepository
from src.shared.exceptions import ConflitoError, NaoEncontradoError


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
        """Grava o primeiro questionário do usuário (409 se ele já existir)."""
        questionario = await self.repository.gravar_questionario(entrada)
        if not questionario:
            logger.warning(f"Questionário existe para usuário: {self.user.email}")
            raise ConflitoError(
                "Questionario já existe. Não é possível criar um novo questionario."
            )
        return questionario

    async def atualizar(self, entrada: QuestionarioInputSchema) -> Questionario:
        """Grava o questionário como enviado (o JSON é do cliente)."""
        questionario = await self.repository.buscar_para_atualizar()
        if questionario is None:
            raise NaoEncontradoError("Questionário não encontrado.")
        if "json_questionario" in entrada.model_fields_set:
            questionario.json_questionario = entrada.json_questionario
        questionario.atualizado_por = self.user.email
        questionario.atualizado_em = datetime.now(UTC)
        await self.repository.salvar()
        return questionario
