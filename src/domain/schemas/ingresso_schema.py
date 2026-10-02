from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator
from src.domain.models.questionarios.questionario import StatusEnum


class PedidoOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    usuario_email: str
    status_questionario: StatusEnum
    criado_em: datetime | None = None
    atualizado_em: datetime | None = None
    decidido_por: str | None = None
    decidido_em: datetime | None = None
    motivo_decisao: str | None = None


class HistoricoQuestionarioOutput(BaseModel):
    """Questionário rejeitado e arquivado (chave `<email>_<ordem>`)."""

    model_config = ConfigDict(from_attributes=True)

    chave: str
    ordem: int
    status_questionario: StatusEnum
    json_questionario: dict | None = None
    criado_em: datetime | None = None
    decidido_por: str | None = None
    decidido_em: datetime | None = None
    motivo_decisao: str | None = None


class RejeitarInput(BaseModel):
    motivo: str

    @field_validator("motivo")
    @classmethod
    def motivo_nao_vazio(cls, valor: str) -> str:
        valor = valor.strip()
        if not valor:
            raise ValueError("O motivo é obrigatório na rejeição.")
        return valor


class EtapaOutput(BaseModel):
    id: int
    titulo: str
    ordem: int
    avaliavel: bool = True
