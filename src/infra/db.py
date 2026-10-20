from collections.abc import AsyncGenerator

from fastapi import Depends, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from src.domain.models.usuario import User
from src.infra.config import settings
from src.logger import logger
from src.shared.exceptions import NegocioError

engine: AsyncEngine = create_async_engine(str(settings.pg_dsn))
async_session_maker = async_sessionmaker(engine, expire_on_commit=False)


async def get_async_session() -> AsyncGenerator[AsyncSession]:
    async with async_session_maker() as session:
        try:
            yield session
        except (NegocioError, HTTPException, RequestValidationError) as e:
            # falha esperada (negócio, permissão ou corpo inválido): não é erro do sistema
            logger.warning(f"Operação recusada: {e}")
            await session.rollback()
            raise
        except Exception as e:
            logger.error(e)
            await session.rollback()
            raise


async def get_user_db(session: AsyncSession = Depends(get_async_session)):
    yield SQLAlchemyUserDatabase(session, User)
