import enum
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Enum, String, Text, Integer
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from src.domain.models.base_models import Base
from src.domain.models.mixin_model import MixinDate


class StatusEnum(str, enum.Enum):
    __tablename__ = "status_questionario"

    iniciado = "iniciado"
    pendente = "pendente"
    aguardando_aprovacao = "aguardando_aprovacao"
    aprovado = "aprovado"
    rejeitado = "rejeitado"


class Questionario(Base, MixinDate):
    __tablename__ = "questionario"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, nullable=False, autoincrement=True)
    usuario_email: Mapped[str] = mapped_column(
        String(255), nullable=False
    )
    status_questionario: Mapped[str] = mapped_column(Enum(StatusEnum), nullable=False)
    json_questionario: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=True)
    decidido_por: Mapped[str | None] = mapped_column(String(255), nullable=True)
    decidido_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    motivo_decisao: Mapped[str | None] = mapped_column(Text, nullable=True)
    ultima_avaliacao_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
