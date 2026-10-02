from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class AvaliacaoInput(BaseModel):
    nota: int = Field(ge=1, le=5)
    parecer: str

    @field_validator("parecer")
    @classmethod
    def parecer_nao_vazio(cls, valor: str) -> str:
        valor = valor.strip()
        if not valor:
            raise ValueError("O parecer é obrigatório.")
        return valor


class AvaliacaoOutput(BaseModel):
    etapa_id: int
    titulo: str
    nota: int | None
    parecer: str
    avaliador: str | None
    avaliado_em: datetime | None = None
