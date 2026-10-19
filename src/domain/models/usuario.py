import random
from datetime import datetime

from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from sqlalchemy import Boolean, DateTime, Enum, String, event
from sqlalchemy.orm import Mapped, mapped_column
from src.domain.models.base import Base
from src.domain.models.enums import SituacaoIncubacao


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
