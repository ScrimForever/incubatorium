from fastapi import APIRouter, Depends, FastAPI
from sqlalchemy.ext.asyncio import AsyncSession
from src.domain.models.user_model import current_active_user
from src.domain.schemas.questionario_schema import (
    QuestionarioInputSchema,
    QuestionarioOutputSchema,
)
from src.infra.db import User, get_async_session
from src.repository.questionario.questionario_rep import QuestionarioRepository
from starlette.responses import JSONResponse


class QuestionarioRouter:
    def __init__(self, app):
        self.app: FastAPI = app
        self.router = APIRouter(prefix="/questionario", tags=["questionario"])
        self.app.include_router(self.router)

    async def iniciar(self):

        @self.router.post("", response_model=QuestionarioOutputSchema)
        async def inserir_questionario(
            questionario: QuestionarioInputSchema,
            user: User = Depends(current_active_user),
            db: AsyncSession = Depends(get_async_session),
        ):
            gravacao_questionario = await QuestionarioRepository(
                user, db
            ).gravar_questionario(questionario)
            if not gravacao_questionario:
                return JSONResponse(
                    status_code=409,
                    content={
                        "mensagem": "Questionario já existe. Não é possível criar um novo questionario."
                    },
                )
            return gravacao_questionario

        @self.router.get("")
        async def buscar_questionario(
            user: User = Depends(current_active_user),
            db: AsyncSession = Depends(get_async_session),
        ):
            questionario = await QuestionarioRepository(user, db).buscar_questionario()
            return questionario

        @self.router.put("", response_model=QuestionarioOutputSchema)
        async def atualizar_questionario(
            questionario: QuestionarioInputSchema,
            user: User = Depends(current_active_user),
            db: AsyncSession = Depends(get_async_session),
        ):
            atualizacao_questionario = await QuestionarioRepository(
                user, db
            ).atualizar_questionario(questionario)
            return atualizacao_questionario
