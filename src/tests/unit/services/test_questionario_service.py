import pytest

from domain.models.questionarios.questionario import Questionario, StatusEnum
from domain.schemas.questionario_schema import QuestionarioInputSchema
from services.questionario.questionario_service import QuestionarioService
from shared.exceptions import ConflitoError, ValidacaoNegocioError


@pytest.fixture
async def user_with_email(criar_usuario, sample_email):
    return await criar_usuario("incubado", sample_email)


class TestCriar:
    @pytest.mark.asyncio
    async def test_descarta_notas_vindas_do_incubado(self, async_db, user_with_email):
        entrada = QuestionarioInputSchema(
            status_questionario=StatusEnum.pendente,
            json_questionario={
                "2": {"business_canvas": "x", "nota": {"valor": 5, "texto": "forjada"}}
            },
        )

        questionario = await QuestionarioService(user_with_email, async_db).criar(
            entrada
        )

        nota = questionario.json_questionario["2"]["nota"]
        assert nota["valor"] is None
        assert nota["texto"] == ""

    @pytest.mark.asyncio
    async def test_descarta_referencias_de_anexos_do_cliente(
        self, async_db, user_with_email
    ):
        entrada = QuestionarioInputSchema(
            status_questionario=StatusEnum.pendente,
            json_questionario={
                "6": {"arquivos": [{"nome": "x.pdf", "caminho": "outro/6/x.pdf"}]}
            },
        )

        questionario = await QuestionarioService(user_with_email, async_db).criar(
            entrada
        )

        assert questionario.json_questionario["6"]["arquivos"] == []

    @pytest.mark.asyncio
    async def test_anexo_embutido_em_base64_e_recusado(
        self, async_db, user_with_email, sample_email
    ):
        entrada = QuestionarioInputSchema(
            status_questionario=StatusEnum.pendente,
            json_questionario={
                "6": {"arquivos": [{"nome": "a.pdf", "conteudo_base64": "JVBERi0="}]}
            },
        )

        with pytest.raises(ValidacaoNegocioError):
            await QuestionarioService(user_with_email, async_db).criar(entrada)

        assert await async_db.get(Questionario, sample_email) is None

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
