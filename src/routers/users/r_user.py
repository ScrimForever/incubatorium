from dataclasses import dataclass

from fastapi import Depends, FastAPI
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession
from src.domain.models.user_model import (
    auth_backend,
    current_active_user,
    fastapi_users,
)
from src.domain.schemas.user_schema import UserCreate, UserRead, UserUpdate
from src.infra.db import User, get_async_session
from src.services.verificacoes.usuario import UserService
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
            ativacao = await UserService(db=db).ativar_usuario_com_codigo_verificacao(
                email, code
            )
            if ativacao:
                logger.success(f"Usuário: {email}. Ativado com sucesso.")
                return RedirectResponse(url="http://localhost:3000/conta-ativada")
            else:
                logger.warning(f"Usuário: {email}. Não pode ser ativado.")
                return RedirectResponse(url="http://localhost:3000/nao-encontrado")

        @self.app.post("/reenviar_codigo/{email}")
        async def reenviar_codigo(
            email: str, db: AsyncSession = Depends(get_async_session)
        ):
            codigo = await UserService(db).reenviar_codigo_para_email(email)
            if not codigo:
                return JSONResponse(
                    status_code=403, content={"mensagem": "Email ou código inválido."}
                )
            else:
                return JSONResponse(
                    status_code=200, content={"mensagem": "Email enviado com sucesso."}
                )
