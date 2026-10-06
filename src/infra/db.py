import random
from collections.abc import AsyncGenerator
from datetime import datetime

from fastapi import Depends, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi_users.db import SQLAlchemyBaseUserTableUUID, SQLAlchemyUserDatabase
from sqlalchemy import Boolean, DateTime, Enum, String, event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import Mapped, mapped_column
from src.domain.models.base_models import Base
from src.domain.models.enums import SituacaoIncubacao
from src.infra.config import settings
from src.logger import logger
from src.shared.exceptions import NegocioError


def gerar_codigo_ativacao() -> str:
    return str(random.randint(0, 999999)).zfill(6)


class User(SQLAlchemyBaseUserTableUUID, Base):
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)
    is_consultor: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)
    is_incubado: Mapped[bool] = mapped_column(Boolean, default=True, nullable=True)
    is_colaborador: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)
    codigo_ativacao: Mapped[str] = mapped_column(String(6), nullable=True)
    situacao_incubacao: Mapped[SituacaoIncubacao | None] = mapped_column(
        Enum(SituacaoIncubacao), nullable=True
    )
    situacao_alterada_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    situacao_alterada_por: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )


@event.listens_for(User, "before_insert")
def force_codigo_ativacao(mapper, connection, target):
    if not target.codigo_ativacao:
        target.codigo_ativacao = gerar_codigo_ativacao()
    target.is_active = False


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
