import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from infra.db import User, gerar_codigo_ativacao


class TestGerarCodigoAtivacao:
    def test_gerar_codigo_formato_correto(self):
        """Teste se o código gerado tem formato correto"""
        codigo = gerar_codigo_ativacao()

        assert isinstance(codigo, str)
        assert len(codigo) == 6
        assert codigo.isdigit()

    def test_gerar_codigo_variacao(self):
        """Teste múltiplas gerações de código"""
        codigos = [gerar_codigo_ativacao() for _ in range(10)]

        for codigo in codigos:
            assert len(codigo) == 6
            assert codigo.isdigit()

    def test_gerar_codigo_entre_0_e_999999(self):
        """Teste se código está no intervalo correto"""
        codigo = gerar_codigo_ativacao()
        valor = int(codigo)

        assert 0 <= valor <= 999999


class TestUserModel:
    @pytest.mark.asyncio
    async def test_user_default_values(self, async_db: AsyncSession, sample_email):
        """Teste valores padrão do usuário"""
        user = User(
            email=sample_email,
            hashed_password="pwd",
        )

        async_db.add(user)
        await async_db.commit()
        await async_db.refresh(user)

        assert user.email == sample_email
        assert user.is_active is False
        assert user.is_admin is False or user.is_admin is None
        assert user.is_consultor is False or user.is_consultor is None
        assert user.is_incubado is True or user.is_incubado is None
        assert user.is_colaborador is False or user.is_colaborador is None

    @pytest.mark.asyncio
    async def test_user_codigo_ativacao_auto_generated(
        self, async_db: AsyncSession, sample_email
    ):
        """Teste se código é gerado automaticamente no INSERT"""
        user = User(
            email=sample_email,
            hashed_password="pwd",
        )

        async_db.add(user)
        await async_db.commit()
        await async_db.refresh(user)

        assert user.codigo_ativacao is not None
        assert len(user.codigo_ativacao) == 6

    @pytest.mark.asyncio
    async def test_user_is_active_false_on_insert(
        self, async_db: AsyncSession, sample_email
    ):
        """Teste se is_active é False ao inserir"""
        user = User(
            email=sample_email,
            hashed_password="pwd",
        )

        async_db.add(user)
        await async_db.commit()
        await async_db.refresh(user)

        assert user.is_active is False

    @pytest.mark.asyncio
    async def test_user_query_by_email(self, async_db: AsyncSession, sample_email):
        """Teste query de usuário por email"""
        user = User(
            email=sample_email,
            hashed_password="pwd",
        )

        async_db.add(user)
        await async_db.commit()

        query = select(User).where(User.email == sample_email)
        result = await async_db.execute(query)
        user_found = result.scalar_one_or_none()

        assert user_found is not None
        assert user_found.email == sample_email

    @pytest.mark.asyncio
    async def test_user_update(self, async_db: AsyncSession, sample_email):
        """Teste atualização de usuário"""
        user = User(
            email=sample_email,
            hashed_password="pwd",
            is_active=False,
        )

        async_db.add(user)
        await async_db.commit()

        user.is_active = True
        await async_db.commit()
        await async_db.refresh(user)

        assert user.is_active is True

    @pytest.mark.asyncio
    async def test_user_delete(self, async_db: AsyncSession, sample_email):
        """Teste deleção de usuário"""
        user = User(
            email=sample_email,
            hashed_password="pwd",
        )

        async_db.add(user)
        await async_db.commit()

        await async_db.delete(user)
        await async_db.commit()

        query = select(User).where(User.email == sample_email)
        result = await async_db.execute(query)
        user_found = result.scalar_one_or_none()

        assert user_found is None


class TestGetAsyncSessionLogaNegocioComoAviso:
    @pytest.mark.asyncio
    async def test_erro_de_negocio_e_warning_nao_error(self, monkeypatch):
        from fastapi import HTTPException
        from fastapi.exceptions import RequestValidationError

        from infra import db
        from shared.exceptions import ConflitoError

        avisos, erros = [], []
        monkeypatch.setattr(db.logger, "warning", avisos.append)
        monkeypatch.setattr(db.logger, "error", erros.append)

        for excecao in (
            ConflitoError("x"),
            HTTPException(status_code=403),
            RequestValidationError([]),
        ):
            gerador = db.get_async_session()
            await anext(gerador)
            with pytest.raises(type(excecao)):
                await gerador.athrow(excecao)

        assert len(avisos) == 3
        assert erros == []

    @pytest.mark.asyncio
    async def test_erro_inesperado_continua_como_error(self, monkeypatch):
        from infra import db

        erros = []
        monkeypatch.setattr(db.logger, "error", erros.append)

        gerador = db.get_async_session()
        await anext(gerador)
        with pytest.raises(RuntimeError):
            await gerador.athrow(RuntimeError("quebrou"))

        assert len(erros) == 1


class TestEmailUnico:
    @pytest.mark.asyncio
    async def test_dois_usuarios_com_o_mesmo_email_sao_barrados_no_banco(
        self, async_db
    ):
        """FR-002: o e-mail identifica a conta e não pode se repetir."""
        from sqlalchemy.exc import IntegrityError

        for _ in range(2):
            async_db.add(User(email="dup@example.com", hashed_password="x"))

        with pytest.raises(IntegrityError):
            await async_db.commit()
        await async_db.rollback()
