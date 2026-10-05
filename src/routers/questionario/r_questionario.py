from fastapi import APIRouter, Depends, FastAPI
from sqlalchemy.ext.asyncio import AsyncSession
from src.domain.models.user_model import current_active_user
from src.domain.schemas.questionario_schema import (
    QuestionarioInputSchema,
    QuestionarioOutputSchema,
)
from src.infra.db import User, get_async_session
from src.logger import logger
from src.services.questionario.questionario_service import QuestionarioService
from src.shared.exceptions import NegocioError
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
            logger.info(f"Gravando novo questionário para usuário: {user.email}")
            try:
                gravacao_questionario = await QuestionarioService(user, db).criar(
                    questionario
                )
            except NegocioError as erro:
                logger.warning(f"Gravação recusada para {user.email}: {erro}")
                return JSONResponse(
                    status_code=erro.status_code, content={"mensagem": erro.mensagem}
                )
            logger.success(
                f"Questionario gravado com sucesso para usuário: {user.email}"
            )
            return gravacao_questionario

        @self.router.get("")
        async def buscar_questionario(
            user: User = Depends(current_active_user),
            db: AsyncSession = Depends(get_async_session),
        ):
            questionario = await QuestionarioService(user, db).buscar()
            return questionario

        @self.router.put("", response_model=QuestionarioOutputSchema)
        async def atualizar_questionario(
            questionario: QuestionarioInputSchema,
            user: User = Depends(current_active_user),
            db: AsyncSession = Depends(get_async_session),
        ):
            try:
                return await QuestionarioService(user, db).atualizar(questionario)
            except NegocioError as erro:
                logger.warning(f"Atualização recusada para {user.email}: {erro}")
                return JSONResponse(
                    status_code=erro.status_code, content={"mensagem": erro.mensagem}
                )

        @self.router.get("/todos")
        async def buscar_questionario(
                user: User = Depends(current_active_user),
                db: AsyncSession = Depends(get_async_session),
        ):
            questionario = await QuestionarioService(user, db).buscar_todos()
            return questionario