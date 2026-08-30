from collections.abc import AsyncGenerator

from fastapi import Depends
from fastapi_users.db import SQLAlchemyBaseUserTableUUID, SQLAlchemyUserDatabase
from sqlalchemy import Boolean
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from .config import settings


class Base(DeclarativeBase):
    pass


class User(SQLAlchemyBaseUserTableUUID, Base):
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_consultor: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_incubado: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_colaborador: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


engine: AsyncEngine = create_async_engine(str(settings.pg_dsn))
async_session_maker = async_sessionmaker(engine, expire_on_commit=False)


async def create_db_and_tables():
    # noinspection PyTypeChecker
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_async_session() -> AsyncGenerator[AsyncSession]:
    async with async_session_maker() as session:
        yield session


async def get_user_db(session: AsyncSession = Depends(get_async_session)):
    yield SQLAlchemyUserDatabase(session, User)
