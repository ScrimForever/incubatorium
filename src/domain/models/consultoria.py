from datetime import date, datetime, time

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from src.domain.models.base import Base
from src.domain.models.mixin import MixinDate


class ConsultoriaJanela(Base, MixinDate):
    """Bloco contínuo de atendimento de um consultor em um dia (ex.: 11h às 13h)."""

    __tablename__ = "consultoria_janela"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    consultor_email: Mapped[str] = mapped_column(
        String(255), nullable=False, index=True
    )
    data: Mapped[date] = mapped_column(Date, nullable=False)
    hora_inicio: Mapped[time] = mapped_column(Time, nullable=False)
    hora_fim: Mapped[time] = mapped_column(Time, nullable=False)
    duracao_minutos: Mapped[int] = mapped_column(Integer, nullable=False)

    horarios: Mapped[list["ConsultoriaHorario"]] = relationship(
        back_populates="janela",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="ConsultoriaHorario.inicio",
    )


class ConsultoriaHorario(Base):
    """Fatia reservável de uma janela. `incubado_email` nulo = livre."""

    __tablename__ = "consultoria_horario"
    __table_args__ = (UniqueConstraint("consultor_email", "inicio"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    janela_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("consultoria_janela.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    consultor_email: Mapped[str] = mapped_column(
        String(255), nullable=False, index=True
    )
    inicio: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    fim: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    incubado_email: Mapped[str | None] = mapped_column(
        String(255), nullable=True, index=True
    )
    reservado_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    janela: Mapped[ConsultoriaJanela] = relationship(
        back_populates="horarios", lazy="joined"
    )
