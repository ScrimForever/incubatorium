import pytest
from pydantic import ValidationError
from sqlalchemy import select

from src.domain.models.questionario import (
    Questionario,
    QuestionarioHistorico,
    StatusEnum,
)
from src.domain.schemas.questionario_schema import QuestionarioInputSchema
from src.repository.questionario import QuestionarioRepository
from src.services.questionario.questionario_service import QuestionarioService
from src.shared.exceptions import ConflitoError, NaoEncontradoError


@pytest.fixture
async def user_with_email(criar_usuario, sample_email):
    return await criar_usuario("incubado", sample_email)


@pytest.fixture
def service(async_db):
    return QuestionarioService(QuestionarioRepository(async_db))


class TestCriar:
    @pytest.mark.asyncio
    async def test_grava_o_json_como_enviado(self, service, user_with_email):
        json = {"2": {"business_canvas": "x", "nota": {"valor": 5}, "arquivos": []}}
        entrada = QuestionarioInputSchema(
            status_questionario=StatusEnum.pendente, json_questionario=json
        )

        questionario = await service.criar(user_with_email, entrada)

        assert questionario.id is not None
        assert questionario.json_questionario == json
        assert questionario.usuario_email == user_with_email.email
        assert questionario.criado_por == user_with_email.email

    @pytest.mark.asyncio
    async def test_criar_grava_historico_inicial(
        self, async_db, service, user_with_email
    ):
        questionario = await service.criar(
            user_with_email,
            QuestionarioInputSchema(status_questionario=StatusEnum.iniciado),
        )

        [historico] = (
            (await async_db.execute(select(QuestionarioHistorico))).scalars().all()
        )
        assert historico.questionario_id == questionario.id
        assert historico.usuario_email == user_with_email.email
        assert historico.status_questionario == StatusEnum.iniciado

    @pytest.mark.asyncio
    async def test_criar_duas_vezes_da_conflito(self, service, user_with_email):
        entrada = QuestionarioInputSchema(status_questionario=StatusEnum.pendente)
        await service.criar(user_with_email, entrada)

        with pytest.raises(ConflitoError) as erro:
            await service.criar(user_with_email, entrada)
        assert erro.value.mensagem == (
            "Questionario já existe. Não é possível criar um novo questionario."
        )

    @pytest.mark.asyncio
    async def test_questionario_existente_da_conflito(
        self, async_db, service, user_with_email, sample_email
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
            await service.criar(
                user_with_email,
                QuestionarioInputSchema(status_questionario=StatusEnum.pendente),
            )


class TestBuscar:
    @pytest.mark.asyncio
    async def test_devolve_o_questionario_do_usuario(
        self, async_db, service, user_with_email, sample_email
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

        encontrado = await service.buscar(user_with_email)

        assert encontrado.usuario_email == sample_email

    @pytest.mark.asyncio
    async def test_sem_questionario_levanta_nao_encontrado(
        self, service, user_with_email
    ):
        with pytest.raises(NaoEncontradoError):
            await service.buscar(user_with_email)

    @pytest.mark.asyncio
    async def test_listar_todos(self, async_db, service, criar_usuario):
        for email in ("ana@x.com", "bia@x.com"):
            async_db.add(
                Questionario(
                    usuario_email=email,
                    status_questionario=StatusEnum.iniciado,
                    json_questionario={},
                    criado_por=email,
                )
            )
        await async_db.commit()

        todos = await service.listar_todos()

        assert sorted(q.usuario_email for q in todos) == ["ana@x.com", "bia@x.com"]


class TestAtualizar:
    @pytest.mark.asyncio
    async def test_sem_questionario_da_nao_encontrado(self, service, user_with_email):
        with pytest.raises(NaoEncontradoError) as erro:
            await service.atualizar(
                user_with_email,
                QuestionarioInputSchema(status_questionario=StatusEnum.pendente),
            )
        assert erro.value.mensagem == "Questionário não encontrado."

    @pytest.mark.asyncio
    async def test_grava_json_status_autor_e_historico(
        self, async_db, service, user_with_email, sample_email
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
        json = {"2": {"business_canvas": "Canvas"}}

        atualizado = await service.atualizar(
            user_with_email,
            QuestionarioInputSchema(
                status_questionario=StatusEnum.pendente, json_questionario=json
            ),
        )

        assert atualizado.json_questionario == json
        assert atualizado.status_questionario == StatusEnum.pendente
        assert atualizado.atualizado_por == sample_email
        assert atualizado.atualizado_em is not None
        [historico] = (
            (await async_db.execute(select(QuestionarioHistorico))).scalars().all()
        )
        assert historico.questionario_id == atualizado.id
        assert historico.json_questionario == json
        assert historico.status_questionario == StatusEnum.pendente

    @pytest.mark.asyncio
    async def test_sem_json_so_muda_status_e_nao_grava_historico(
        self, async_db, service, user_with_email, sample_email
    ):
        async_db.add(
            Questionario(
                usuario_email=sample_email,
                status_questionario=StatusEnum.iniciado,
                json_questionario={"1": "a"},
                criado_por=sample_email,
            )
        )
        await async_db.commit()

        atualizado = await service.atualizar(
            user_with_email,
            QuestionarioInputSchema(status_questionario=StatusEnum.pendente),
        )

        assert atualizado.json_questionario == {"1": "a"}
        assert atualizado.status_questionario == StatusEnum.pendente
        assert (
            await async_db.execute(select(QuestionarioHistorico))
        ).scalars().all() == []


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
