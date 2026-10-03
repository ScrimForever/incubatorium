import pytest
from pydantic import ValidationError

from domain.models.questionarios.questionario import Questionario, StatusEnum
from domain.schemas.questionario_schema import QuestionarioInputSchema
from services.questionario.questionario_service import QuestionarioService
from shared.exceptions import ConflitoError


@pytest.fixture
async def user_with_email(criar_usuario, sample_email):
    return await criar_usuario("incubado", sample_email)


class TestCriar:
    @pytest.mark.asyncio
    async def test_grava_o_json_como_enviado(self, async_db, user_with_email):
        json = {"2": {"business_canvas": "x", "nota": {"valor": 5}, "arquivos": []}}
        entrada = QuestionarioInputSchema(
            status_questionario=StatusEnum.pendente, json_questionario=json
        )

        questionario = await QuestionarioService(user_with_email, async_db).criar(
            entrada
        )

        assert questionario.json_questionario == json

    @pytest.mark.asyncio
    async def test_questionario_existente_da_conflito(
        self, async_db, user_with_email, sample_email
    ):
        async_db.add(
            Questionario(
                usuario_email=sample_email,
                status_questionario=StatusEnum.iniciado,
                json_questionario={},
                criado_por=sample_email,
            )
        )
        await async_db.commit()

        with pytest.raises(ConflitoError):
            await QuestionarioService(user_with_email, async_db).criar(
                QuestionarioInputSchema(status_questionario=StatusEnum.pendente)
            )


class TestBuscar:
    @pytest.mark.asyncio
    async def test_devolve_o_questionario_do_usuario(
        self, async_db, user_with_email, sample_email
    ):
        async_db.add(
            Questionario(
                usuario_email=sample_email,
                status_questionario=StatusEnum.iniciado,
                json_questionario={},
                criado_por=sample_email,
            )
        )
        await async_db.commit()

        encontrado = await QuestionarioService(user_with_email, async_db).buscar()

        assert encontrado.usuario_email == sample_email

    @pytest.mark.asyncio
    async def test_sem_questionario_devolve_false(self, async_db, user_with_email):
        assert await QuestionarioService(user_with_email, async_db).buscar() is False


class TestNotas:
    @pytest.mark.parametrize(
        "nota", [0, 6, -1, 2.5, "3", True, {"valor": 9}, {"valor": "x"}]
    )
    def test_nota_fora_de_1_a_5_e_recusada(self, nota):
        with pytest.raises(ValidationError):
            QuestionarioInputSchema(
                status_questionario=StatusEnum.pendente,
                json_questionario={"2": {"dados": [{"nota": nota}]}},
            )

    @pytest.mark.parametrize("nota", [None, 1, 5, {"valor": None}, {"valor": 3}])
    def test_nota_valida_ou_nula_e_aceita(self, nota):
        entrada = QuestionarioInputSchema(
            status_questionario=StatusEnum.pendente,
            json_questionario={"2": {"nota": nota}},
        )

        assert entrada.json_questionario["2"]["nota"] == nota
