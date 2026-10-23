import uuid

from fastapi import Depends, Request
from fastapi_users import FastAPIUsers, models
from fastapi_users.authentication import (
    AuthenticationBackend,
    BearerTransport,
    JWTStrategy,
)

from src.auth.usuario_manager import SECRET, get_user_manager
from src.domain.models.usuario import User

bearer_transport = BearerTransport(tokenUrl="auth/jwt/login")


def get_jwt_strategy() -> JWTStrategy[models.UP, models.ID]:
    return JWTStrategy(secret=SECRET, lifetime_seconds=3600)


auth_backend = AuthenticationBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)

fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])

_usuario_ativo = fastapi_users.current_user(active=True)


async def current_active_user(
    request: Request, user: User = Depends(_usuario_ativo)
) -> User:
    """Usuário logado da requisição; fica em `request.state` para o log de requisição."""
    request.state.usuario_email = user.email
    return user
