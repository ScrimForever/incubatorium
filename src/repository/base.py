from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession


class Repositorio:
    """Base dos repositórios: guarda a sessão e centraliza o commit."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def salvar(self) -> None:
        """Confirma a transação; em erro desfaz e relança."""
        try:
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise
