from pydantic import BaseModel
from src.domain.models.questionarios.questionario import StatusEnum
from src.domain.schemas.mixindate_schema import MixinCriadoSchema


class QuestionarioBaseSchema(BaseModel):
    status_questionario: StatusEnum


class QuestionarioInputSchema(QuestionarioBaseSchema):
    json_questionario: dict | None = None


class QuestionarioOutputSchema(QuestionarioBaseSchema, MixinCriadoSchema):
    json_questionario: dict | None = None
