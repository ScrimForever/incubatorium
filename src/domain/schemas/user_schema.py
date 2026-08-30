import uuid

from fastapi_users import schemas
from pydantic import ConfigDict, field_validator


class UserRead(schemas.BaseUser[uuid.UUID]):
    pass


class UserCreate(schemas.BaseUserCreate):
    model_config = ConfigDict(extra="ignore")
    is_incubado: bool = True

    @field_validator("is_incubado", mode="before")
    @classmethod
    def forcar_incubado(cls, data):
        return True


class UserUpdate(schemas.BaseUserUpdate):
    pass
