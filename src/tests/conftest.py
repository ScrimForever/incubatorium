import asyncio
import sys
import uuid
from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

src_path = str(Path(__file__).parent.parent)
if src_path not in sys.path:
    sys.path.insert(0, src_path)

# Redireciona src.* antes de qualquer outro import
from tests.src_redirect import instalar

instalar()

# Now import all modules we need
from domain.models.base_models import Base
from infra.db import User


def patch_jsonb_for_sqlite():
    from sqlalchemy.dialects.sqlite.base import SQLiteTypeCompiler

    original_process = SQLiteTypeCompiler.process

    def patched_process(self, type_, **kwargs):
        if isinstance(type_, JSONB):
            return original_process(self, JSON(), **kwargs)
        return original_process(self, type_, **kwargs)

    SQLiteTypeCompiler.process = patched_process


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def async_db():
    patch_jsonb_for_sqlite()

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session_maker = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session_maker() as session:
        yield session
        await session.close()

    await engine.dispose()


@pytest.fixture
def sample_user_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def sample_email() -> str:
    return "test@example.com"


@pytest.fixture
def sample_password() -> str:
    return "securePassword123!"


@pytest.fixture
def sample_user_data(sample_email, sample_password, sample_user_id):
    return {
        "id": sample_user_id,
        "email": sample_email,
        "password": sample_password,
        "is_active": False,
        "is_superuser": False,
        "is_verified": False,
        "is_incubado": True,
    }


@pytest.fixture
def sample_questionario_data(sample_email):
    return {
        "usuario_email": sample_email,
        "status_questionario": "iniciado",
        "json_questionario": {"pergunta_1": "resposta_1"},
    }


PERFIS = ("admin", "colaborador", "consultor", "incubado")


@pytest_asyncio.fixture
async def criar_usuario(async_db):
    """Fábrica de usuários ativos por perfil: exatamente um perfil verdadeiro."""

    async def _criar(perfil: str = "incubado", email: str | None = None) -> User:
        assert perfil in PERFIS, f"perfil inválido: {perfil}"
        usuario = User(
            email=email or f"{perfil}-{uuid.uuid4().hex[:8]}@example.com",
            hashed_password="hashed_pwd",
            is_active=True,
            is_admin=perfil == "admin",
            is_colaborador=perfil == "colaborador",
            is_consultor=perfil == "consultor",
            is_incubado=perfil == "incubado",
        )
        async_db.add(usuario)
        await async_db.commit()
        # o listener before_insert força is_active=False; ativa explicitamente
        usuario.is_active = True
        await async_db.commit()
        return usuario

    return _criar


@pytest_asyncio.fixture
async def cliente_api(async_db):
    """Fábrica de clientes HTTP assíncronos contra um app com os routers informados.

    Uso: `cliente = await cliente_api([router], usuario)`; as requisições passam por
    `current_active_user` (fixado em `usuario`) e usam a sessão `async_db`.
    """
    import httpx
    from fastapi import FastAPI

    from domain.models.user_model import current_active_user
    from infra.db import get_async_session
    from shared.handlers import registrar_handlers

    clientes = []

    async def _criar(routers, usuario):
        app = FastAPI()
        registrar_handlers(app)
        for router in routers:
            app.include_router(router)

        async def _usuario():
            return usuario

        async def _sessao():
            return async_db

        app.dependency_overrides[current_active_user] = _usuario
        app.dependency_overrides[get_async_session] = _sessao
        cliente = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        )
        clientes.append(cliente)
        return cliente

    yield _criar

    for cliente in clientes:
        await cliente.aclose()
