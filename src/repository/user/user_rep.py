from typing import Any, Literal

from loguru import logger
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from src.infra.db import User, gerar_codigo_ativacao


class UserRepository:
    def __init__(self, db: AsyncSession):

        self.db = db

    async def _commit_or_rollback(self) -> bool:
        try:
            await self.db.commit()
            return True
        except SQLAlchemyError as e:
            logger.error(e)
            await self.db.rollback()
            return False

    async def verificar_codigo_usuario(self, email: str) -> str | Literal[False]:
        logger.info("Buscando código gerado para o usuário.")
        query = select(User).where(User.email == email)
        result = await self.db.execute(query)
        user = result.scalar_one_or_none()
        if user is None:
            return False
        else:
            return user.codigo_ativacao

    async def ativar_usuario_por_codigo_gerado(self, email: str, codigo: str) -> bool:
        logger.info("Buscando usuário no banco.")
        query = select(User).where(User.email == email)
        result = await self.db.execute(query)
        user = result.scalar_one_or_none()

        if user is None:
            return False
        if user.codigo_ativacao != codigo:
            return False

        user.is_active = True
        user.codigo_ativacao = None
        return await self._commit_or_rollback()

    async def verificar_email(self, email: str) -> Any | bool:
        logger.info("Buscando email.")
        query = select(User).where(User.email == email)
        result = await self.db.execute(query)
        user = result.scalar_one_or_none()
        if user is None:
            return False
        return user

    async def reativar_codigo(self, usuario) -> bool:
        logger.info("Buscando email.")
        codigo = gerar_codigo_ativacao()
        usuario.codigo_ativacao = codigo
        return await self._commit_or_rollback()
