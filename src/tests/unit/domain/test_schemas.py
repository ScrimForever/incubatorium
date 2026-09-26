import pytest

from domain.models.questionarios.questionario import StatusEnum
from domain.schemas.questionario_schema import (
    QuestionarioInputSchema,
)
from domain.schemas.user_schema import UserCreate


class TestUserCreate:
    def test_create_user_with_valid_data(self, sample_email, sample_password):
        user_data = {
            "email": sample_email,
            "password": sample_password,
            "is_incubado": False,
        }
        user = UserCreate(**user_data)

        assert user.email == sample_email
        assert user.password == sample_password
        assert user.is_incubado is True

    def test_is_incubado_validator_forces_true(self, sample_email, sample_password):
        """Verifica que o validador força is_incubado para True"""
        user_data = {
            "email": sample_email,
            "password": sample_password,
            "is_incubado": False,
        }
        user = UserCreate(**user_data)

        assert user.is_incubado is True

    def test_create_user_without_is_incubado(self, sample_email, sample_password):
        user_data = {
            "email": sample_email,
            "password": sample_password,
        }
        user = UserCreate(**user_data)

        assert user.is_incubado is True


class TestQuestionarioInputSchema:
    def test_create_questionario_with_valid_data(self, sample_email):
        questionario_data = {
            "status_questionario": StatusEnum.iniciado,
            "json_questionario": {"pergunta_1": "resposta_1"},
        }
        questionario = QuestionarioInputSchema(**questionario_data)

        assert questionario.status_questionario == StatusEnum.iniciado
        assert questionario.json_questionario == {"pergunta_1": "resposta_1"}

    def test_create_questionario_without_json(self):
        questionario_data = {
            "status_questionario": StatusEnum.iniciado,
        }
        questionario = QuestionarioInputSchema(**questionario_data)

        assert questionario.status_questionario == StatusEnum.iniciado
        assert questionario.json_questionario is None

    def test_create_questionario_with_invalid_status(self):
        questionario_data = {
            "status_questionario": "invalid_status",
            "json_questionario": {},
        }
        with pytest.raises(ValueError):
            QuestionarioInputSchema(**questionario_data)

    @pytest.mark.parametrize(
        "status",
        [
            StatusEnum.iniciado,
            StatusEnum.pendente,
            StatusEnum.aguardando_aprovacao,
            StatusEnum.aprovado,
            StatusEnum.rejeitado,
        ],
    )
    def test_all_valid_status_values(self, status):
        questionario_data = {
            "status_questionario": status,
        }
        questionario = QuestionarioInputSchema(**questionario_data)

        assert questionario.status_questionario == status
