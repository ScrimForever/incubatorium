import uuid
from dataclasses import dataclass
from datetime import datetime

from pydantic import BaseModel, ConfigDict
from src.domain.models.auditoria import EventoAcesso, MotivoAcesso


@dataclass(frozen=True)
class OrigemRequisicao:
    """De onde veio a requisição que gerou o evento."""

    ip: str | None = None
    user_agent: str | None = None


class RegistroAcessoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    evento: EventoAcesso
    motivo: MotivoAcesso | None = None
    email: str
    usuario_id: uuid.UUID | None = None
    autor_email: str | None = None
    ip: str | None = None
    user_agent: str | None = None
    criado_em: datetime
