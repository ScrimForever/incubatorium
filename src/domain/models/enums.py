import enum


class SituacaoIncubacao(str, enum.Enum):
    ativo = "ativo"
    concluido = "concluido"
    desistente = "desistente"
