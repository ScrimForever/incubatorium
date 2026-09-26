import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from infra.db import User, gerar_codigo_ativacao
from repository.user.user_rep import UserRepository


class TestUserRepository:
    @pytest.mark.asyncio
    async def test_verificar_codigo_usuario_encontrado(
        self, async_db: AsyncSession, sample_email
    ):
        """Teste para verificar código quando usuário existe"""
        codigo = gerar_codigo_ativacao()
        user = User(
            email=sample_email,
            hashed_password="hashed_pwd",
            is_active=False,
            codigo_ativacao=codigo,
        )
        async_db.add(user)
        await async_db.commit()

        repo = UserRepository(async_db)
        resultado = await repo.verificar_codigo_usuario(sample_email)

        assert resultado == codigo

    @pytest.mark.asyncio
    async def test_verificar_codigo_usuario_nao_encontrado(
        self, async_db: AsyncSession
    ):
        """Teste quando usuário não existe"""
        repo = UserRepository(async_db)
        resultado = await repo.verificar_codigo_usuario("nao@existe.com")

        assert resultado is False

    @pytest.mark.asyncio
    async def test_ativar_usuario_por_codigo_gerado_sucesso(
        self, async_db: AsyncSession, sample_email
    ):
        """Teste para ativar usuário com código correto"""
        codigo = gerar_codigo_ativacao()
        user = User(
            email=sample_email,
            hashed_password="hashed_pwd",
            is_active=False,
            codigo_ativacao=codigo,
        )
        async_db.add(user)
        await async_db.commit()

        repo = UserRepository(async_db)
        resultado = await repo.ativar_usuario_por_codigo_gerado(sample_email, codigo)

        assert resultado is True

        query = select(User).where(User.email == sample_email)
        result = await async_db.execute(query)
        user_atualizado = result.scalar_one()
        assert user_atualizado.is_active is True
        assert user_atualizado.codigo_ativacao is None

    @pytest.mark.asyncio
    async def test_ativar_usuario_codigo_incorreto(
        self, async_db: AsyncSession, sample_email
    ):
        """Teste com código incorreto"""
        codigo = gerar_codigo_ativacao()
        user = User(
            email=sample_email,
            hashed_password="hashed_pwd",
            is_active=False,
            codigo_ativacao=codigo,
        )
        async_db.add(user)
        await async_db.commit()

        repo = UserRepository(async_db)
        resultado = await repo.ativar_usuario_por_codigo_gerado(sample_email, "999999")

        assert resultado is False

    @pytest.mark.asyncio
    async def test_ativar_usuario_nao_encontrado(self, async_db: AsyncSession):
        """Teste quando usuário não existe"""
        repo = UserRepository(async_db)
        resultado = await repo.ativar_usuario_por_codigo_gerado(
            "nao@existe.com", "123456"
        )

        assert resultado is False

    @pytest.mark.asyncio
    async def test_verificar_email_encontrado(
        self, async_db: AsyncSession, sample_email
    ):
        """Teste para buscar email existente"""
        user = User(
            email=sample_email,
            hashed_password="hashed_pwd",
            is_active=False,
        )
        async_db.add(user)
        await async_db.commit()

        repo = UserRepository(async_db)
        resultado = await repo.verificar_email(sample_email)

        assert resultado.email == sample_email

    @pytest.mark.asyncio
    async def test_verificar_email_nao_encontrado(self, async_db: AsyncSession):
        """Teste quando email não existe"""
        repo = UserRepository(async_db)
        resultado = await repo.verificar_email("nao@existe.com")

        assert resultado is False

    @pytest.mark.asyncio
    async def test_reativar_codigo(self, async_db: AsyncSession, sample_email):
        """Teste para reativar código de ativação"""
        user = User(
            email=sample_email,
            hashed_password="hashed_pwd",
            is_active=False,
            codigo_ativacao="123456",
        )
        async_db.add(user)
        await async_db.commit()

        repo = UserRepository(async_db)
        resultado = await repo.reativar_codigo(user)

        assert resultado is True

        query = select(User).where(User.email == sample_email)
        result = await async_db.execute(query)
        user_atualizado = result.scalar_one()
        assert user_atualizado.codigo_ativacao is not None
        assert user_atualizado.codigo_ativacao != "123456"

    @pytest.mark.asyncio
    async def test_buscar_usuario(self, async_db: AsyncSession, sample_email):
        """Teste para buscar usuário por email"""
        user = User(
            email=sample_email,
            hashed_password="hashed_pwd",
            is_active=False,
        )
        async_db.add(user)
        await async_db.commit()

        repo = UserRepository(async_db)
        resultado = await repo.buscar_usuario(sample_email)

        assert resultado.email == sample_email

    @pytest.mark.asyncio
    async def test_buscar_usuario_nao_encontrado(self, async_db: AsyncSession):
        """Teste quando usuário não existe"""
        repo = UserRepository(async_db)
        resultado = await repo.buscar_usuario("nao@existe.com")

        assert resultado is False
