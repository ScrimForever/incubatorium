import uuid

from fastapi_users import schemas
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator, model_validator


class UserRead(schemas.BaseUser[uuid.UUID]):
    is_incubado: bool | None = None
    is_admin: bool | None = None
    is_consultor: bool | None = None
    is_colaborador: bool | None = None


class UsuarioCriar(BaseModel):
    """Cadastro feito por um admin: a conta já nasce ativa, sem código de ativação."""

    email: EmailStr
    password: str
    is_admin: bool = False
    is_colaborador: bool = False
    is_consultor: bool = False
    is_incubado: bool = False

    @model_validator(mode="after")
    def exatamente_um_perfil(self):
        perfis = (self.is_admin, self.is_colaborador, self.is_consultor, self.is_incubado)
        if sum(perfis) != 1:
            raise ValueError("Informe exatamente um perfil verdadeiro.")
        return self


class UserCreate(schemas.BaseUserCreate):
    model_config = ConfigDict(extra="ignore")
    is_incubado: bool | None = True

    @field_validator("is_incubado", mode="before")
    @classmethod
    def forcar_incubado(cls, data):
        return True


class UserUpdate(schemas.BaseUserUpdate):
    pass
