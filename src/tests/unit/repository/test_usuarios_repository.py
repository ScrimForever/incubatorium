import pytest
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.models.usuario import User, gerar_codigo_ativacao
from src.repository.usuarios import UsuariosRepository


@pytest.fixture
async def usuario(async_db: AsyncSession, sample_email):
    """Usuário inativo com código de ativação"""
    user = User(
        email=sample_email,
        hashed_password="hashed_pwd",
        is_active=False,
        codigo_ativacao=gerar_codigo_ativacao(),
    )
    async_db.add(user)
    await async_db.commit()
    return user


async def _recarregar(async_db: AsyncSession, email: str) -> User:
    resultado = await async_db.execute(select(User).where(User.email == email))
    return resultado.scalar_one()


class TestBuscar:
    @pytest.mark.asyncio
    async def test_buscar_por_email_encontrado(
        self, async_db: AsyncSession, usuario, sample_email
    ):
        resultado = await UsuariosRepository(async_db).buscar_por_email(sample_email)

        assert resultado.email == sample_email

    @pytest.mark.asyncio
    async def test_buscar_por_email_nao_encontrado(self, async_db: AsyncSession):
        repo = UsuariosRepository(async_db)

        assert await repo.buscar_por_email("nao@existe.com") is None

    @pytest.mark.asyncio
    async def test_buscar_por_id(self, async_db: AsyncSession, usuario):
        resultado = await UsuariosRepository(async_db).buscar_por_id(usuario.id)

        assert resultado.email == usuario.email


class TestCodigoAtivacao:
    @pytest.mark.asyncio
    async def test_buscar_codigo_ativacao(
        self, async_db: AsyncSession, usuario, sample_email
    ):
        repo = UsuariosRepository(async_db)

        assert await repo.buscar_codigo_ativacao(sample_email) == (
            usuario.codigo_ativacao
        )

    @pytest.mark.asyncio
    async def test_buscar_codigo_ativacao_email_inexistente(
        self, async_db: AsyncSession
    ):
        repo = UsuariosRepository(async_db)

        assert await repo.buscar_codigo_ativacao("nao@existe.com") is None

    @pytest.mark.asyncio
    async def test_ativar_por_codigo_correto(
        self, async_db: AsyncSession, usuario, sample_email
    ):
        repo = UsuariosRepository(async_db)

        resultado = await repo.ativar_por_codigo(sample_email, usuario.codigo_ativacao)

        assert resultado is True
        atualizado = await _recarregar(async_db, sample_email)
        assert atualizado.is_active is True
        assert atualizado.codigo_ativacao is None

    @pytest.mark.asyncio
    async def test_ativar_por_codigo_errado(
        self, async_db: AsyncSession, usuario, sample_email
    ):
        repo = UsuariosRepository(async_db)

        assert await repo.ativar_por_codigo(sample_email, "999999") is False
        assert (await _recarregar(async_db, sample_email)).is_active is False

    @pytest.mark.asyncio
    async def test_ativar_por_codigo_usuario_inexistente(
        self, async_db: AsyncSession
    ):
        repo = UsuariosRepository(async_db)

        assert await repo.ativar_por_codigo("nao@existe.com", "123456") is False

    @pytest.mark.asyncio
    async def test_ativar_por_codigo_falha_no_commit_devolve_false(
        self, async_db: AsyncSession, usuario, sample_email, monkeypatch
    ):
        async def _falha():
            raise SQLAlchemyError("falhou")

        monkeypatch.setattr(async_db, "commit", _falha)
        repo = UsuariosRepository(async_db)

        resultado = await repo.ativar_por_codigo(sample_email, usuario.codigo_ativacao)

        assert resultado is False

    @pytest.mark.asyncio
    async def test_gerar_novo_codigo(
        self, async_db: AsyncSession, usuario, sample_email
    ):
        usuario.codigo_ativacao = "123456"
        await async_db.commit()

        await UsuariosRepository(async_db).gerar_novo_codigo(usuario)

        atualizado = await _recarregar(async_db, sample_email)
        assert atualizado.codigo_ativacao is not None
        assert atualizado.codigo_ativacao != "123456"


class TestSalvar:
    @pytest.mark.asyncio
    async def test_salvar_faz_rollback_e_relanca(
        self, async_db: AsyncSession, monkeypatch
    ):
        rollbacks = []
        rollback_original = async_db.rollback

        async def _falha():
            raise SQLAlchemyError("falhou")

        async def _rollback():
            rollbacks.append(True)
            await rollback_original()

        monkeypatch.setattr(async_db, "commit", _falha)
        monkeypatch.setattr(async_db, "rollback", _rollback)

        with pytest.raises(SQLAlchemyError):
            await UsuariosRepository(async_db).salvar()
        assert rollbacks == [True]
