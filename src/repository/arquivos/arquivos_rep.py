from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.domain.models.questionarios.questionario import Questionario


class ArquivosRepository:
    """Acesso ao questionário para checar se os anexos podem ser alterados."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def buscar(self, email: str) -> Questionario | None:
        resultado = await self.db.execute(
            select(Questionario).where(Questionario.usuario_email == email)
        )
        return resultado.scalar_one_or_none()
