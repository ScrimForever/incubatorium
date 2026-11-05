import asyncio
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import AsyncEngine
from src.domain.models import consultoria, questionario, usuario  # noqa: F401  (registram as tabelas em Base.metadata)
from src.domain.models.base import Base
from src.logger import logger

ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"


async def migrar_se_faltar_tabela(engine: AsyncEngine) -> None:
    """Roda `alembic upgrade head` quando alguma tabela dos models não existe no banco."""
    async with engine.connect() as conn:
        existentes = await conn.run_sync(lambda c: set(inspect(c).get_table_names()))
    faltando = set(Base.metadata.tables) - existentes
    if not faltando:
        return
    logger.info(f"Tabelas ausentes {sorted(faltando)}: executando migrações...")
    # o env.py do Alembic usa asyncio.run, então precisa de uma thread sem event loop
    await asyncio.to_thread(command.upgrade, Config(str(ALEMBIC_INI)), "head")
    logger.info("Migrações aplicadas.")
