import uuid

from fastapi_users import schemas
from pydantic import field_validator


class UserRead(schemas.BaseUser[uuid.UUID]):
    pass


class UserCreate(schemas.BaseUserCreate):
    is_admin: bool = False
    is_consultor: bool = False
    is_incubado: bool = True
    is_colaborador: bool = False

    @field_validator("is_admin", mode="before")
    @classmethod
    def cancelar_admin(cls, data):
        return False

    @field_validator("is_consultor", mode="before")
    @classmethod
    def cancelar_consultor(cls, data):
        return False

    @field_validator("is_incubado", mode="before")
    @classmethod
    def forcar_incubado(cls, data):
        return True

    @field_validator("is_colaborador", mode="before")
    @classmethod
    def cancelar_colaborador(cls, data):
        return False


class UserUpdate(schemas.BaseUserUpdate):
    pass
