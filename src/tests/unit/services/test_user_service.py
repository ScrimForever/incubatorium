from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from infra.db import User
from services.verificacoes.usuario import UserService


@pytest.fixture
async def user_in_db(async_db: AsyncSession, sample_email):
    """Cria um usuÃ¡rio no banco para os testes"""
    user = User(
        email=sample_email,
        hashed_password="hashed_pwd",
        is_active=False,
    )
    async_db.add(user)
    await async_db.commit()
    return user


class TestUserService:
    @pytest.mark.asyncio
    async def test_verificar_usuario_encontrado(
        self, async_db: AsyncSession, user_in_db, sample_email
    ):
        """Teste para verificar usuÃ¡rio existente"""
        service = UserService(db=async_db)
        resultado = await service.verificar_usuario(sample_email)

        assert resultado.email == sample_email

    @pytest.mark.asyncio
    async def test_verificar_usuario_nao_encontrado(self, async_db: AsyncSession):
        """Teste quando usuÃ¡rio nÃ£o existe"""
        service = UserService(db=async_db)
        resultado = await service.verificar_usuario("nao@existe.com")

        assert resultado is False

    @pytest.mark.asyncio
    async def test_ativar_usuario_com_codigo_verificacao_sucesso(
        self, async_db: AsyncSession, user_in_db, sample_email
    ):
        """Teste para ativar usuÃ¡rio com cÃ³digo correto"""
        codigo = user_in_db.codigo_ativacao

        service = UserService(db=async_db)

        # Mock do mÃ©todo _auto_criar_questionario para evitar dependÃªncias
        with patch.object(
            service, "_auto_criar_questionario", new_callable=AsyncMock
        ) as mock_criar:
            mock_criar.return_value = True
            resultado = await service.ativar_usuario_com_codigo_verificacao(
                sample_email, codigo
            )

        assert resultado is True

    @pytest.mark.asyncio
    async def test_ativar_usuario_codigo_incorreto(
        self, async_db: AsyncSession, user_in_db, sample_email
    ):
        """Teste com cÃ³digo incorreto"""
        service = UserService(db=async_db)
        resultado = await service.ativar_usuario_com_codigo_verificacao(
            sample_email, "999999"
        )

        assert resultado is False

    @pytest.mark.asyncio
    async def test_reativar_codigo_sucesso(
        self, async_db: AsyncSession, user_in_db, sample_email
    ):
        """Teste para reativar cÃ³digo"""
        service = UserService(db=async_db)

        with patch("services.verificacoes.usuario.EmailSetup") as mock_email:
            mock_email_instance = AsyncMock()
            mock_email.return_value = mock_email_instance
            mock_email_instance.enviar_email_cadastro.return_value = True

            resultado = await service.reativar_codigo(user_in_db)

        assert resultado is True

    @pytest.mark.asyncio
    async def test_reenviar_codigo_para_email_sucesso(
        self, async_db: AsyncSession, user_in_db, sample_email
    ):
        """Teste para reenviar cÃ³digo"""
        service = UserService(db=async_db)

        with patch("services.verificacoes.usuario.EmailSetup") as mock_email:
            mock_email_instance = AsyncMock()
            mock_email.return_value = mock_email_instance
            mock_email_instance.enviar_email_cadastro.return_value = True

            resultado = await service.reenviar_codigo_para_email(sample_email)

        assert resultado is True

    @pytest.mark.asyncio
    async def test_reenviar_codigo_para_email_nao_encontrado(
        self, async_db: AsyncSession
    ):
        """Teste quando usuÃ¡rio nÃ£o existe"""
        service = UserService(db=async_db)
        resultado = await service.reenviar_codigo_para_email("nao@existe.com")

        assert resultado is False
