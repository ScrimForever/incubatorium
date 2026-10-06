import uuid

from fastapi_users import schemas
from pydantic import ConfigDict, field_validator


class UserRead(schemas.BaseUser[uuid.UUID]):
    is_incubado: bool | None = None
    is_admin: bool | None = None
    is_consultor: bool | None = None
    is_colaborador: bool | None = None


class UserCreate(schemas.BaseUserCreate):
    model_config = ConfigDict(extra="ignore")
    is_incubado: bool | None = True

    @field_validator("is_incubado", mode="before")
    @classmethod
    def forcar_incubado(cls, data):
        return True


class UserUpdate(schemas.BaseUserUpdate):
    pass
