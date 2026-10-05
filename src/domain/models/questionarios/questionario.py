import enum
from typing import Any

from sqlalchemy import Enum, String
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

    usuario_email: Mapped[str] = mapped_column(
        String(255), primary_key=True, nullable=False
    )
    status_questionario: Mapped[str] = mapped_column(Enum(StatusEnum), nullable=False)
    json_questionario: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=True)
