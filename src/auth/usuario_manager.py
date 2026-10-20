import uuid

from fastapi import Depends, Request
from fastapi_users import BaseUserManager, UUIDIDMixin
from fastapi_users.db import SQLAlchemyUserDatabase

from src.domain.models.usuario import User
from src.infra.config import settings
from src.infra.db import get_user_db
from src.logger import logger
from src.services.email.setup import EmailSetup

SECRET = settings.secret_key


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = SECRET
    verification_token_secret = SECRET

    async def on_after_register(self, user: User, request: Request | None = None):
        logger.info(f"User {user.id} has registered.")
        logger.info(f"Enviando email para ativaçãoativaÃ§Ã£o de conta: {user.email}")
        email_service = EmailSetup()
        await email_service.enviar_email_cadastro(user.email)

    async def on_after_forgot_password(
        self, user: User, token: str, request: Request | None = None
    ):
        email_service = EmailSetup()
        await email_service.enviar_email_nova_senha(user.email, token)

    async def on_after_request_verify(
        self, user: User, token: str, request: Request | None = None
    ):
        logger.info(f"Verificação de e-mail solicitada para o usuário {user.id}.")


async def get_user_manager(user_db: SQLAlchemyUserDatabase = Depends(get_user_db)):
    yield UserManager(user_db)
