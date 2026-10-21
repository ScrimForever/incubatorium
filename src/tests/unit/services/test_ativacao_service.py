from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.models.questionario import Questionario, StatusEnum
from src.domain.models.usuario import User
from src.repository.questionario import QuestionarioRepository
from src.repository.usuarios import UsuariosRepository
from src.services.usuarios.ativacao_service import AtivacaoService


@pytest.fixture
async def user_in_db(async_db: AsyncSession, sample_email):
    """Cria um usuário inativo (o listener gera o código de ativação)"""
    user = User(
        email=sample_email,
        hashed_password="hashed_pwd",
        is_active=False,
    )
    async_db.add(user)
    await async_db.commit()
    return user


@pytest.fixture
def email():
    mock = AsyncMock()
    mock.enviar_email_cadastro.return_value = True
    return mock


@pytest.fixture
def service(async_db: AsyncSession, email):
    return AtivacaoService(
        UsuariosRepository(async_db), QuestionarioRepository(async_db), email
    )


async def _questionarios(async_db: AsyncSession, email: str) -> list[Questionario]:
    resultado = await async_db.execute(
        select(Questionario).where(Questionario.usuario_email == email)
    )
    return list(resultado.scalars().all())


class TestAtivar:
    @pytest.mark.asyncio
    async def test_codigo_certo_cria_questionario_iniciado(
        self, async_db, service, user_in_db, sample_email
    ):
        resultado = await service.ativar(sample_email, user_in_db.codigo_ativacao)

        assert resultado is True
        assert user_in_db.is_active is True
        [questionario] = await _questionarios(async_db, sample_email)
        assert questionario.status_questionario == StatusEnum.iniciado
        assert questionario.json_questionario == {}
        assert questionario.criado_por == sample_email

    @pytest.mark.asyncio
    async def test_com_questionario_existente_devolve_false(
        self, async_db, service, user_in_db, sample_email
    ):
        async_db.add(
            Questionario(
                usuario_email=sample_email,
                status_questionario=StatusEnum.pendente,
                json_questionario={"1": "a"},
                criado_por=sample_email,
            )
        )
        await async_db.commit()

        resultado = await service.ativar(sample_email, user_in_db.codigo_ativacao)

        assert resultado is False
        [questionario] = await _questionarios(async_db, sample_email)
        assert questionario.json_questionario == {"1": "a"}

    @pytest.mark.asyncio
    async def test_codigo_errado_devolve_false_sem_criar(
        self, async_db, service, user_in_db, sample_email
    ):
        assert await service.ativar(sample_email, "999999") is False
        assert await _questionarios(async_db, sample_email) == []


class TestReenviarCodigo:
    @pytest.mark.asyncio
    async def test_gera_novo_codigo_e_envia(
        self, service, email, user_in_db, sample_email
    ):
        anterior = user_in_db.codigo_ativacao

        assert await service.reenviar_codigo(sample_email) is True
        assert user_in_db.codigo_ativacao != anterior
        email.enviar_email_cadastro.assert_awaited_once_with(sample_email)

    @pytest.mark.asyncio
    async def test_falha_no_envio_devolve_false(
        self, service, email, user_in_db, sample_email
    ):
        email.enviar_email_cadastro.return_value = False

        assert await service.reenviar_codigo(sample_email) is False

    @pytest.mark.asyncio
    async def test_email_inexistente_devolve_false(self, service, email):
        assert await service.reenviar_codigo("nao@existe.com") is False
        email.enviar_email_cadastro.assert_not_awaited()
