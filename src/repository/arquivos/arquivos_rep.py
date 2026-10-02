from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from src.domain.models.questionarios.questionario import Questionario


class ArquivosRepository:
    """Referências de anexos gravadas em `json_questionario[aba].arquivos`."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def buscar(self, email: str) -> Questionario | None:
        resultado = await self.db.execute(
            select(Questionario).where(Questionario.usuario_email == email)
        )
        return resultado.scalar_one_or_none()

    async def buscar_para_atualizar(self, email: str) -> Questionario | None:
        """Bloqueia a linha (como o `PUT` das respostas e a avaliação do consultor)."""
        resultado = await self.db.execute(
            select(Questionario)
            .where(Questionario.usuario_email == email)
            .with_for_update()
        )
        return resultado.scalar_one_or_none()

    async def gravar_json(
        self, questionario: Questionario, novo_json: dict, autor: str
    ) -> None:
        """Reatribui um novo dict ao JSONB para o SQLAlchemy detectar a mudança."""
        questionario.json_questionario = novo_json
        questionario.atualizado_por = autor
        questionario.atualizado_em = datetime.now(UTC)
        try:
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise
