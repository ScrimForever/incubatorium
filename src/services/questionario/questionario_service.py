from datetime import UTC, datetime

from src.domain.models.questionario import (
    Questionario,
    QuestionarioHistorico,
)
from src.domain.models.usuario import User
from src.domain.schemas.questionario_schema import QuestionarioInputSchema
from src.logger import logger
from src.repository.questionario import QuestionarioRepository
from src.shared.exceptions import ConflitoError, NaoEncontradoError


class QuestionarioService:
    def __init__(self, repository: QuestionarioRepository):
        self.repository = repository

    async def buscar(self, user: User) -> Questionario | None:
        return await self.repository.buscar(user.email)

    async def listar_todos(self) -> list[Questionario]:
        return await self.repository.listar_todos()

    async def criar(self, user: User, entrada: QuestionarioInputSchema) -> Questionario:
        """Grava o primeiro questionário do usuário (409 se ele já existir)."""
        if await self.repository.buscar(user.email) is not None:
            logger.warning(f"Questionário existe para usuário: {user.email}")
            raise ConflitoError(
                "Questionario já existe. Não é possível criar um novo questionario."
            )
        return await self.repository.criar(
            Questionario(
                **entrada.model_dump(),
                usuario_email=user.email,
                criado_por=user.email,
            )
        )

    async def atualizar(
        self, user: User, entrada: QuestionarioInputSchema
    ) -> Questionario:
        """Grava o questionário como enviado (o JSON é do cliente)."""
        questionario = await self.repository.buscar_para_atualizar(user.email)
        return await self._gravar(questionario, user, entrada)

    async def atualizar_por_id(
        self, autor: User, questionario_id: int, entrada: QuestionarioInputSchema
    ) -> Questionario:
        """Edição pelo consultor: o questionário é de outro usuário, localizado pelo id."""
        questionario = await self.repository.buscar_por_id_para_atualizar(
            questionario_id
        )
        return await self._gravar(questionario, autor, entrada)

    async def _gravar(
        self,
        questionario: Questionario | None,
        autor: User,
        entrada: QuestionarioInputSchema,
    ) -> Questionario:
        """Só `json_questionario`, `status_questionario` e a assinatura da atualização
        mudam; `usuario_email`, `criado_por` e `criado_em` nunca são tocados."""
        if questionario is None:
            raise NaoEncontradoError("Questionário não encontrado.")
        if "json_questionario" in entrada.model_fields_set:
            questionario.json_questionario = entrada.json_questionario
            self.repository.adicionar_historico(
                QuestionarioHistorico(
                    questionario_id=questionario.id,
                    usuario_email=questionario.usuario_email,
                    json_questionario=entrada.json_questionario,
                    status_questionario=entrada.status_questionario,
                )
            )
        questionario.status_questionario = entrada.status_questionario
        questionario.atualizado_por = autor.email
        questionario.atualizado_em = datetime.now(UTC)
        await self.repository.salvar()
        return questionario
