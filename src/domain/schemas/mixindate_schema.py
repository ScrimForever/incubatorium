from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MixinDateSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    criado_por: str | None = None
    criado_em: datetime | None = None
    atualizado_em: datetime | None = None
    atualizado_por: str | None = None


class MixinCriadoSchema(BaseModel):
    criado_por: str | None = None
    criado_em: datetime | None = None


class MixinAtualizadoSchema(BaseModel):
    atualizado_em: datetime | None = None
    atualizado_por: str | None = None
