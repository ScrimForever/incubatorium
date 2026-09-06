import random
from collections.abc import AsyncGenerator

from fastapi import Depends
from fastapi_users.db import SQLAlchemyBaseUserTableUUID, SQLAlchemyUserDatabase
from loguru import logger
from sqlalchemy import Boolean, String, event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import Mapped, mapped_column
from src.domain.models.base_models import Base
from src.infra.config import settings


def gerar_codigo_ativacao() -> str:
    return str(random.randint(0, 999999)).zfill(6)


class User(SQLAlchemyBaseUserTableUUID, Base):
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)
    is_consultor: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)
    is_incubado: Mapped[bool] = mapped_column(Boolean, default=True, nullable=True)
    is_colaborador: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)
    codigo_ativacao: Mapped[str] = mapped_column(String(6), nullable=True)


@event.listens_for(User, "before_insert")
def force_codigo_ativacao(mapper, connection, target):
    target.codigo_ativacao = gerar_codigo_ativacao()
    target.is_active = False


engine: AsyncEngine = create_async_engine(str(settings.pg_dsn))
async_session_maker = async_sessionmaker(engine, expire_on_commit=False)


async def create_db_and_tables():
    # noinspection PyTypeChecker
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_async_session() -> AsyncGenerator[AsyncSession]:
    async with async_session_maker() as session:
        try:
            yield session
        except Exception as e:
            logger.error(e)
            await session.rollback()
            raise


async def get_user_db(session: AsyncSession = Depends(get_async_session)):
    yield SQLAlchemyUserDatabase(session, User)
