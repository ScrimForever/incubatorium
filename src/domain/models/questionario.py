import enum
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    false,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from src.domain.models.base import Base
from src.domain.models.mixin import MixinDate


class StatusEnum(str, enum.Enum):
    __tablename__ = "status_questionario"

    iniciado = "iniciado"
    pendente = "pendente"
    aguardando_aprovacao = "aguardando_aprovacao"
    aprovado = "aprovado"
    rejeitado = "rejeitado"


class Questionario(Base, MixinDate):
    __tablename__ = "questionario"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, nullable=False, autoincrement=True
    )
    usuario_email: Mapped[str] = mapped_column(String(255), nullable=False)
    status_questionario: Mapped[str] = mapped_column(Enum(StatusEnum), nullable=False)
    json_questionario: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=True)
    decidido_por: Mapped[str | None] = mapped_column(String(255), nullable=True)
    decidido_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    motivo_decisao: Mapped[str | None] = mapped_column(Text, nullable=True)
    avaliado_admin: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )


class QuestionarioHistorico(Base):
    __tablename__ = "questionario_historico"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    questionario_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("questionario.id"), nullable=False, index=True
    )
    usuario_email: Mapped[str] = mapped_column(String(255), nullable=False)
    json_questionario: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=True)
    status_questionario: Mapped[str] = mapped_column(Enum(StatusEnum), nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class QuestionarioAvaliador(Base, MixinDate):
    """Avaliadores (consultores) selecionados para um questionário."""

    __tablename__ = "questionario_avaliador"
    __table_args__ = (
        UniqueConstraint(
            "questionario_id", "avaliador_email", name="uq_questionario_avaliador"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    questionario_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("questionario.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    avaliador_email: Mapped[str] = mapped_column(
        String(255), nullable=False, index=True
    )
