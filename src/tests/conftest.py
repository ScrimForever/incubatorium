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

# Setup import redirection for src.* modules BEFORE any other imports
import importlib.abc
import importlib.machinery


class SrcRedirectFinder(importlib.abc.MetaPathFinder):
    """Redirect src.* imports to their non-src counterparts"""

    def find_spec(self, fullname, path, target=None):
        if fullname.startswith("src."):
            redirect_name = fullname[4:]  # Remove 'src.' prefix
            try:
                # Find the spec for the target module
                import importlib.util

                spec = importlib.util.find_spec(redirect_name)
                if spec and spec.loader:
                    # Return a spec that loads the redirect module under the src name
                    return importlib.machinery.ModuleSpec(
                        fullname, SrcRedirectLoader(redirect_name), origin=spec.origin
                    )
            except ImportError, ValueError, AttributeError:
                pass
        return None


class SrcRedirectLoader(importlib.abc.Loader):
    """Loader that imports a non-src module and caches it under the src name"""

    def __init__(self, redirect_name):
        self.redirect_name = redirect_name

    def create_module(self, spec):
        # Return the already-loaded or load-on-demand module
        if self.redirect_name in sys.modules:
            return sys.modules[self.redirect_name]
        return None

    def exec_module(self, module):
        # Import and cache the redirect module
        redirect_module = __import__(self.redirect_name, fromlist=["*"])
        sys.modules[module.__name__] = redirect_module


# Install the import hook at the beginning of sys.meta_path
sys.meta_path.insert(0, SrcRedirectFinder())

# Now import all modules we need
from domain.models.base_models import Base


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
