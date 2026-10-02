from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PlanoOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    usuario_email: str
    status_questionario: str
    json_questionario: dict | None = None
    criado_em: datetime | None = None
    atualizado_em: datetime | None = None
    atualizado_por: str | None = None
    decidido_por: str | None = None
    decidido_em: datetime | None = None
    motivo_decisao: str | None = None
