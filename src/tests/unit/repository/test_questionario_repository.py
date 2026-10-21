import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.models.questionario import Questionario, StatusEnum
from src.repository.questionario import QuestionarioRepository


def _questionario(email: str, json=None) -> Questionario:
    return Questionario(
        usuario_email=email,
        status_questionario=StatusEnum.iniciado,
        json_questionario=json if json is not None else {},
        criado_por=email,
    )


@pytest.fixture
def gravar(async_db: AsyncSession):
    async def _gravar(email: str, json=None) -> Questionario:
        questionario = _questionario(email, json)
        async_db.add(questionario)
        await async_db.commit()
        return questionario

    return _gravar


class TestBuscar:
    @pytest.mark.asyncio
    async def test_buscar_encontrado(self, async_db: AsyncSession, gravar):
        await gravar("ana@x.com", {"pergunta": "resposta"})

        resultado = await QuestionarioRepository(async_db).buscar("ana@x.com")

        assert resultado.usuario_email == "ana@x.com"
        assert resultado.status_questionario == StatusEnum.iniciado

    @pytest.mark.asyncio
    async def test_buscar_sem_registro_devolve_none(self, async_db: AsyncSession):
        assert await QuestionarioRepository(async_db).buscar("x@y") is None

    @pytest.mark.asyncio
    async def test_buscar_para_atualizar(self, async_db: AsyncSession, gravar):
        await gravar("ana@x.com")
        repo = QuestionarioRepository(async_db)

        assert (await repo.buscar_para_atualizar("ana@x.com")).usuario_email == (
            "ana@x.com"
        )
        assert await repo.buscar_para_atualizar("x@y") is None

    @pytest.mark.asyncio
    async def test_listar_todos(self, async_db: AsyncSession, gravar):
        await gravar("ana@x.com")
        await gravar("bia@x.com")

        todos = await QuestionarioRepository(async_db).listar_todos()

        assert sorted(q.usuario_email for q in todos) == ["ana@x.com", "bia@x.com"]

    @pytest.mark.asyncio
    async def test_listar_todos_vazio(self, async_db: AsyncSession):
        assert await QuestionarioRepository(async_db).listar_todos() == []


class TestCriar:
    @pytest.mark.asyncio
    async def test_criar_persiste_e_devolve_com_id(self, async_db: AsyncSession):
        repo = QuestionarioRepository(async_db)

        criado = await repo.criar(_questionario("ana@x.com", {"1": "a"}))

        assert criado.id is not None
        encontrado = await repo.buscar("ana@x.com")
        assert encontrado.id == criado.id
        assert encontrado.json_questionario == {"1": "a"}
