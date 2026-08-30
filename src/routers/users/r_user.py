from dataclasses import dataclass

from fastapi import Depends, FastAPI
from src.domain.models.user_model import (
    auth_backend,
    current_active_user,
    fastapi_users,
)
from src.domain.schemas.user_schema import UserCreate, UserRead, UserUpdate
from src.infra.db import User


@dataclass
class UserRouter:
    app: FastAPI

    def start_router(self):

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
