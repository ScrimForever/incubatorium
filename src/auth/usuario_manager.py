import uuid
from typing import Any

from fastapi import Depends, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_users import BaseUserManager, UUIDIDMixin
from fastapi_users.db import SQLAlchemyUserDatabase

from src.domain.models.auditoria import EventoAcesso, MotivoAcesso
from src.domain.models.usuario import User
from src.infra.config import settings
from src.infra.db import get_user_db
from src.logger import logger
from src.repository.auditoria import AuditoriaRepository
from src.services.email.setup import EmailSetup
from src.shared.requisicao import origem_da_requisicao

SECRET = settings.secret_key


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = SECRET
    verification_token_secret = SECRET

    def __init__(self, user_db, request: Request | None = None, **kwargs):
        super().__init__(user_db, **kwargs)
        # `authenticate` não recebe a requisição do fastapi-users; o IP da falha vem daqui.
        self.request = request

    async def on_after_register(self, user: User, request: Request | None = None):
        logger.info(f"User {user.id} has registered.")
        logger.info(f"Enviando email para ativação de conta: {user.email}")
        email_service = EmailSetup()
        await email_service.enviar_email_cadastro(user.email, user.codigo_ativacao)

    async def on_after_login(
        self,
        user: User,
        request: Request | None = None,
        response: Response | None = None,
    ):
        if request is not None:
            request.state.usuario_email = user.email
        await self._auditar(EventoAcesso.login_sucesso, user.email, request, user)

    async def authenticate(self, credentials: OAuth2PasswordRequestForm) -> User | None:
        """Como o do fastapi-users, mas registra as tentativas recusadas.

        Conta inativa passa aqui com senha válida e é recusada pela rota de login, então
        também conta como falha.
        """
        user = await super().authenticate(credentials)
        if user is None or not user.is_active:
            motivo = (
                MotivoAcesso.credenciais_invalidas
                if user is None
                else MotivoAcesso.conta_inativa
            )
            await self._auditar(
                EventoAcesso.login_falha,
                credentials.username,
                self.request,
                user,
                motivo=motivo,
            )
        return user

    async def on_after_update(
        self,
        user: User,
        update_dict: dict[str, Any],
        request: Request | None = None,
    ) -> None:
        """PATCH /users/me e /users/{id}: só a troca de senha entra no histórico."""
        if update_dict.get("password") is None:
            return
        autor = getattr(request.state, "usuario_email", None) if request else None
        await self._auditar(
            EventoAcesso.senha_alterada,
            user.email,
            request,
            user,
            motivo=(
                MotivoAcesso.propria
                if autor == user.email
                else MotivoAcesso.administrador
            ),
            autor_email=autor,
        )

    async def on_after_reset_password(
        self, user: User, request: Request | None = None
    ) -> None:
        await self._auditar(
            EventoAcesso.senha_alterada,
            user.email,
            request,
            user,
            motivo=MotivoAcesso.recuperacao,
            autor_email=user.email,
        )

    async def _auditar(
        self,
        evento: EventoAcesso,
        email: str,
        request: Request | None,
        user: User | None,
        motivo: MotivoAcesso | None = None,
        autor_email: str | None = None,
    ) -> None:
        auditoria = AuditoriaRepository(self.user_db.session)
        auditoria.registrar(
            evento,
            email,
            origem_da_requisicao(request),
            usuario=user,
            motivo=motivo,
            autor_email=autor_email,
        )
        await auditoria.salvar()

    async def on_after_forgot_password(
        self, user: User, token: str, request: Request | None = None
    ):
        email_service = EmailSetup()
        await email_service.enviar_email_nova_senha(user.email, token)

    async def on_after_request_verify(
        self, user: User, token: str, request: Request | None = None
    ):
        logger.info(f"Verificação de e-mail solicitada para o usuário {user.id}.")


async def get_user_manager(
    request: Request, user_db: SQLAlchemyUserDatabase = Depends(get_user_db)
):
    yield UserManager(user_db, request)
