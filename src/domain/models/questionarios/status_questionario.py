import enum

from sqlalchemy import Enum, String
from sqlalchemy.orm import Mapped, mapped_column
from src.domain.models.base_models import Base, MixinDate


class StatusEnum(str, enum.Enum):
    __tablename__ = "status_questionario"

    iniciado = "iniciado"
    pendente = "pendente"
    finalizado = "finalizado"
    aguardando_aprovacao = "aguardando_aprovacao"
    aprovado = "aprovado"
    rejeitado = "rejeitado"


class Questionario(Base, MixinDate):
    __tablename__ = "questionario"
    usuario_email: Mapped[str] = mapped_column(String, primary_key=True, nullable=False)
    status_questionario: Mapped[str] = mapped_column(Enum(StatusEnum), nullable=False)
