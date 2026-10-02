from datetime import datetime

from pydantic import BaseModel
from src.domain.models.enums import SituacaoIncubacao


class IncubadoResumo(BaseModel):
    """Linha do painel do colaborador: situação e data da última avaliação."""

    email: str
    situacao: SituacaoIncubacao
    status_questionario: str
    ultima_avaliacao_em: datetime | None = None


class SituacaoUpdate(BaseModel):
    situacao: SituacaoIncubacao


class SituacaoAlteradaOutput(BaseModel):
    email: str
    situacao: SituacaoIncubacao
    alterada_em: datetime | None = None
    alterada_por: str | None = None
