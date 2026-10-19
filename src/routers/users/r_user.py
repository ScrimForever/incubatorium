from dataclasses import dataclass

from fastapi import Depends, FastAPI
from sqlalchemy.ext.asyncio import AsyncSession
from src.auth.backend import (
    auth_backend,
    current_active_user,
    fastapi_users,
)
from src.domain.models.usuario import User
from src.domain.schemas.user_schema import UserCreate, UserRead, UserUpdate
from src.infra.db import get_async_session
from src.logger import logger
from src.repository.questionario import QuestionarioRepository
from src.repository.usuarios import UsuariosRepository
from src.services.email.setup import EmailSetup
from src.services.usuarios.ativacao_service import AtivacaoService
from starlette.responses import JSONResponse, RedirectResponse


@dataclass
class UserRouter:
    app: FastAPI

    async def start_router(self):

        self.app.include_router(
            fastapi_users.get_auth_router(auth_backend),
            prefix="/auth/jwt",
            tags=["auth"],
        )
        self.app.include_router(
            fastapi_users.get_register_router(UserRead, UserCreate),
            prefix="/auth",
            tags=["auth"],
        )
        self.app.include_router(
            fastapi_users.get_reset_password_router(),
            prefix="/auth",
            tags=["auth"],
        )
        self.app.include_router(
            fastapi_users.get_verify_router(UserRead),
            prefix="/auth",
            tags=["auth"],
        )
        self.app.include_router(
            fastapi_users.get_users_router(UserRead, UserUpdate),
            prefix="/users",
            tags=["users"],
        )

        @self.app.get("/authenticated-route")
        async def authenticated_route(user: User = Depends(current_active_user)):
            return {"message": f"Hello {user.email}!"}

        @self.app.get("/validar_email/{email}/{code}")
        async def ativar_email(
            email: str, code: str, db: AsyncSession = Depends(get_async_session)
        ):
            ativacao = await AtivacaoService(
                UsuariosRepository(db), QuestionarioRepository(db), EmailSetup()
            ).ativar(email, code)
            if ativacao:
                logger.success(f"Usuário: {email}. Ativado com sucesso.")
                return RedirectResponse(url="http://localhost:3000/conta-ativada")
            else:
                logger.warning(f"UsuÃ¡rio: {email}. NÃ£o pode ser ativado.")
                return RedirectResponse(url="http://localhost:3000/nao-encontrado")

        @self.app.post("/reenviar_codigo/{email}")
        async def reenviar_codigo(
            email: str, db: AsyncSession = Depends(get_async_session)
        ):
            codigo = await AtivacaoService(
                UsuariosRepository(db), QuestionarioRepository(db), EmailSetup()
            ).reenviar_codigo(email)
            if not codigo:
                return JSONResponse(
                    status_code=403, content={"mensagem": "Email ou Código Inválido."}
                )
            else:
                return JSONResponse(
                    status_code=200, content={"mensagem": "Email enviado com sucesso."}
                )
