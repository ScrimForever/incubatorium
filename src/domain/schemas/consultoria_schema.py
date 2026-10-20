from datetime import date, datetime, time
from itertools import pairwise

from pydantic import BaseModel, ConfigDict, Field, model_validator


class BlocoInput(BaseModel):
    """Um intervalo contínuo de atendimento, fatiado em horários de `duracao_minutos`."""

    hora_inicio: time
    hora_fim: time
    duracao_minutos: int = Field(gt=0, le=24 * 60)

    @model_validator(mode="after")
    def _intervalo_valido(self):
        minutos = (self.hora_fim.hour - self.hora_inicio.hour) * 60 + (
            self.hora_fim.minute - self.hora_inicio.minute
        )
        if minutos <= 0:
            raise ValueError("hora_fim deve ser maior que hora_inicio.")
        if self.duracao_minutos > minutos:
            raise ValueError("A duração não cabe no intervalo informado.")
        return self


class AgendaInput(BaseModel):
    datas: list[date] = Field(min_length=1)
    blocos: list[BlocoInput] = Field(min_length=1)

    @model_validator(mode="after")
    def _sem_repeticao_nem_sobreposicao(self):
        if len(set(self.datas)) != len(self.datas):
            raise ValueError("Há datas repetidas.")
        ordenados = sorted(self.blocos, key=lambda b: b.hora_inicio)
        for anterior, atual in pairwise(ordenados):
            if atual.hora_inicio < anterior.hora_fim:
                raise ValueError("Os blocos de horário não podem se sobrepor.")
        return self


class JanelaUpdate(BaseModel):
    hora_inicio: time | None = None
    hora_fim: time | None = None
    duracao_minutos: int | None = Field(default=None, gt=0, le=24 * 60)


class CancelarDiasInput(BaseModel):
    datas: list[date] = Field(min_length=1)


class HorarioUpdate(BaseModel):
    hora_inicio: time
    hora_fim: time


class HorarioOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    janela_id: int
    consultor_email: str
    inicio: datetime
    fim: datetime
    incubado_email: str | None = None
    reservado_em: datetime | None = None


class JanelaOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    consultor_email: str
    data: date
    hora_inicio: time
    hora_fim: time
    duracao_minutos: int
    horarios: list[HorarioOutput]


class CancelamentoOutput(BaseModel):
    janelas_canceladas: int
    reservas_canceladas: int
