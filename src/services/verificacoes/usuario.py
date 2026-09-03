from typing import Any

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession
from src.domain.models.user_model import User
from src.repository.user.user_rep import UserRepository
from src.services.email.setup import EmailSetup


class UserService:
    def __init__(self, db: AsyncSession):

        self.db = db
        self.repository = UserRepository(self.db)

    async def ativar_usuario_com_codigo_verificacao(
        self, email: str, codigo: str
    ) -> bool:
        logger.info(f"Ativando código para usuário: {email}")
        return await self.repository.ativar_usuario_por_codigo_gerado(email, codigo)

    async def verificar_usuario(self, email: str) -> Any | bool:
        usuario = await self.repository.verificar_email(email)
        if usuario:
            return usuario
        return False

    async def reativar_codigo(self, usuario: User) -> bool:
        logger.info(f"Reativando código: {usuario.email}")
        persiste_codigo = await self.repository.reativar_codigo(usuario)
        logger.debug(f"codigo = {persiste_codigo}")
        if persiste_codigo:
            envio_email = await EmailSetup().enviar_email_cadastro(usuario.email)
            return envio_email
        return False

    async def reenviar_codigo_para_email(self, email: str) -> bool:
        logger.info(f"Reenviando código para email: {email}")
        usuario = await self.verificar_usuario(email)
        logger.debug(f"usuario = {usuario}")
        if not usuario:
            return False
        else:
            return await self.reativar_codigo(usuario)
