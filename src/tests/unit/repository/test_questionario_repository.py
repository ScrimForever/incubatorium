import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from domain.models.questionarios.questionario import (
    Questionario,
    StatusEnum,
)
from domain.schemas.questionario_schema import QuestionarioInputSchema
from infra.db import User
from repository.questionario.questionario_rep import QuestionarioRepository


@pytest.fixture
async def user_with_email(async_db: AsyncSession, sample_email):
    """Cria um usuário para os testes"""
    user = User(
        email=sample_email,
        hashed_password="hashed_pwd",
        is_active=True,
    )
    async_db.add(user)
    await async_db.commit()
    return user


class TestQuestionarioRepository:
    @pytest.mark.asyncio
    async def test_buscar_questionario_encontrado(
        self, async_db: AsyncSession, user_with_email, sample_email
    ):
        """Teste para buscar questionário existente"""
        questionario = Questionario(
            usuario_email=sample_email,
            status_questionario=StatusEnum.iniciado,
            json_questionario={"pergunta": "resposta"},
            criado_por=sample_email,
        )
        async_db.add(questionario)
        await async_db.commit()

        repo = QuestionarioRepository(user_with_email, async_db)
        resultado = await repo.buscar_questionario()

        assert resultado.usuario_email == sample_email
        assert resultado.status_questionario == StatusEnum.iniciado

    @pytest.mark.asyncio
    async def test_buscar_questionario_nao_encontrado(
        self, async_db: AsyncSession, user_with_email
    ):
        """Teste quando questionário não existe"""
        repo = QuestionarioRepository(user_with_email, async_db)
        resultado = await repo.buscar_questionario()

        assert resultado is False

    @pytest.mark.asyncio
    async def test_gravar_questionario_novo(
        self, async_db: AsyncSession, user_with_email, sample_email
    ):
        """Teste para criar novo questionário"""
        input_schema = QuestionarioInputSchema(
            status_questionario=StatusEnum.iniciado,
            json_questionario={"pergunta_1": "resposta_1"},
        )

        repo = QuestionarioRepository(user_with_email, async_db)
        resultado = await repo.gravar_questionario(input_schema)

        assert resultado.usuario_email == sample_email
        assert resultado.status_questionario == StatusEnum.iniciado
        assert resultado.json_questionario == {"pergunta_1": "resposta_1"}

    @pytest.mark.asyncio
    async def test_gravar_questionario_ja_existe(
        self, async_db: AsyncSession, user_with_email, sample_email
    ):
        """Teste quando questionário já existe"""
        questionario = Questionario(
            usuario_email=sample_email,
            status_questionario=StatusEnum.iniciado,
            json_questionario={},
            criado_por=sample_email,
        )
        async_db.add(questionario)
        await async_db.commit()

        input_schema = QuestionarioInputSchema(
            status_questionario=StatusEnum.pendente,
        )

        repo = QuestionarioRepository(user_with_email, async_db)
        resultado = await repo.gravar_questionario(input_schema)

        assert resultado is False

    @pytest.mark.asyncio
    async def test_atualizar_questionario(
        self, async_db: AsyncSession, user_with_email, sample_email
    ):
        """Teste para atualizar questionário existente"""
        questionario = Questionario(
            usuario_email=sample_email,
            status_questionario=StatusEnum.iniciado,
            json_questionario={"pergunta_1": "resposta_1"},
            criado_por=sample_email,
        )
        async_db.add(questionario)
        await async_db.commit()

        input_schema = QuestionarioInputSchema(
            status_questionario=StatusEnum.pendente,
            json_questionario={"pergunta_1": "resposta_2"},
        )

        repo = QuestionarioRepository(user_with_email, async_db)
        resultado = await repo.atualizar_questionario(input_schema)

        assert resultado.status_questionario == StatusEnum.pendente
        assert resultado.json_questionario == {"pergunta_1": "resposta_2"}

    @pytest.mark.asyncio
    async def test_atualizar_questionario_nao_existe(
        self, async_db: AsyncSession, user_with_email
    ):
        """Teste quando questionário não existe"""
        input_schema = QuestionarioInputSchema(
            status_questionario=StatusEnum.pendente,
        )

        repo = QuestionarioRepository(user_with_email, async_db)
        resultado = await repo.atualizar_questionario(input_schema)

        assert resultado is False

    @pytest.mark.asyncio
    async def test_inicializar_questionario(
        self, async_db: AsyncSession, user_with_email, sample_email
    ):
        """Teste para inicializar questionário"""
        repo = QuestionarioRepository(user_with_email, async_db)
        resultado = await repo.inicializar_questionario(sample_email)

        assert resultado is True

        questionario = await repo.buscar_questionario()
        assert questionario.usuario_email == sample_email
        assert questionario.status_questionario == StatusEnum.iniciado

    @pytest.mark.asyncio
    async def test_inicializar_questionario_ja_existe(
        self, async_db: AsyncSession, user_with_email, sample_email
    ):
        """Teste quando questionário já existe"""
        questionario = Questionario(
            usuario_email=sample_email,
            status_questionario=StatusEnum.iniciado,
            json_questionario={},
            criado_por=sample_email,
        )
        async_db.add(questionario)
        await async_db.commit()

        repo = QuestionarioRepository(user_with_email, async_db)
        resultado = await repo.inicializar_questionario(sample_email)

        assert resultado is False
