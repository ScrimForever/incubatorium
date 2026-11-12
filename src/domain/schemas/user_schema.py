import uuid
from datetime import datetime

from fastapi_users import schemas
from pydantic import BaseModel, ConfigDict, field_validator, model_validator
from src.domain.models.enums import SituacaoIncubacao


class UserRead(schemas.BaseUser[uuid.UUID]):
    is_incubado: bool | None = None
    is_admin: bool | None = None
    is_consultor: bool | None = None
    is_colaborador: bool | None = None
    nome: str | None = None
    sobrenome: str | None = None
    telefone: str | None = None


class UsuarioAdminRead(UserRead):
    """Visão completa da conta para o admin. Senha e código de ativação ficam de fora."""

    situacao_incubacao: SituacaoIncubacao | None = None
    situacao_alterada_em: datetime | None = None
    situacao_alterada_por: str | None = None


class UsuarioCriar(schemas.BaseUserCreate):
    """Cadastro feito por um admin.

    Com senha, a conta já nasce ativa. Sem senha (ausente ou vazia), recebe uma senha
    aleatória e nasce inativa: o usuário ativa pelo código enviado por e-mail.
    """

    password: str = ""
    nome: str
    sobrenome: str
    telefone: str
    is_admin: bool = False
    is_colaborador: bool = False
    is_consultor: bool = False
    is_incubado: bool = False

    @model_validator(mode="after")
    def exatamente_um_perfil(self):
        perfis = (
            self.is_admin,
            self.is_colaborador,
            self.is_consultor,
            self.is_incubado,
        )
        if sum(perfis) != 1:
            raise ValueError("Informe exatamente um perfil verdadeiro.")
        return self


class UsuarioEditar(BaseModel):
    """Edição parcial feita por um admin: só os campos enviados mudam.

    E-mail fica fora porque identifica o usuário em questionários e agendas.
    Perfis enviados devem ter exatamente um verdadeiro; os não enviados viram falso.
    """

    model_config = ConfigDict(extra="forbid")

    nome: str | None = None
    sobrenome: str | None = None
    telefone: str | None = None
    password: str | None = None
    is_active: bool | None = None
    is_admin: bool | None = None
    is_colaborador: bool | None = None
    is_consultor: bool | None = None
    is_incubado: bool | None = None

    @property
    def perfis_enviados(self) -> dict[str, bool]:
        campos = ("is_admin", "is_colaborador", "is_consultor", "is_incubado")
        return {c: getattr(self, c) for c in campos if c in self.model_fields_set}

    @model_validator(mode="after")
    def perfis_consistentes(self):
        perfis = self.perfis_enviados
        if any(v is None for v in perfis.values()):
            raise ValueError("Perfis não aceitam nulo.")
        if perfis and sum(perfis.values()) != 1:
            raise ValueError("Informe exatamente um perfil verdadeiro.")
        if "is_active" in self.model_fields_set and self.is_active is None:
            raise ValueError("is_active não aceita nulo.")
        if "password" in self.model_fields_set and not self.password:
            raise ValueError("A senha não pode ser vazia.")
        return self


class UserCreate(schemas.BaseUserCreate):
    model_config = ConfigDict(extra="ignore")
    is_incubado: bool | None = True
    nome: str | None = None
    sobrenome: str | None = None
    telefone: str | None = None

    @field_validator("is_incubado", mode="before")
    @classmethod
    def forcar_incubado(cls, data):
        return True


class UserUpdate(schemas.BaseUserUpdate):
    pass
