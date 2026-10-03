from pydantic import BaseModel, field_validator
from src.domain.models.questionarios.questionario import StatusEnum
from src.domain.schemas.mixindate_schema import MixinCriadoSchema


def validar_notas(valor: object) -> None:
    """Toda chave "nota" do JSON (em qualquer nível) deve valer 1 a 5 ou ser nula.

    A nota pode ser o próprio inteiro ou um objeto `{valor, ...}`.
    """
    if isinstance(valor, dict):
        for chave, item in valor.items():
            if chave == "nota":
                nota = item.get("valor") if isinstance(item, dict) else item
                if nota is not None and (
                    isinstance(nota, bool)
                    or not isinstance(nota, int)
                    or not 1 <= nota <= 5
                ):
                    raise ValueError("A nota deve ser um inteiro de 1 a 5.")
            validar_notas(item)
    elif isinstance(valor, list):
        for item in valor:
            validar_notas(item)


class QuestionarioBaseSchema(BaseModel):
    status_questionario: StatusEnum


class QuestionarioInputSchema(QuestionarioBaseSchema):
    json_questionario: dict | None = None

    @field_validator("json_questionario")
    @classmethod
    def _notas_de_1_a_5(cls, valor: dict | None) -> dict | None:
        validar_notas(valor)
        return valor


class QuestionarioOutputSchema(QuestionarioBaseSchema, MixinCriadoSchema):
    json_questionario: dict | None = None
