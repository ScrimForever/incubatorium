import enum
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
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


class QuestionarioHistorico(Base):
    __tablename__ = "questionario_historico"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    questionario_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("questionario.id"), nullable=False, index=True
    )
    usuario_email: Mapped[str] = mapped_column(String(255), nullable=False)
    json_questionario: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=True)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
