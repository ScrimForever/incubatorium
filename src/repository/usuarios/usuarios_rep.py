from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from src.domain.models.enums import SituacaoIncubacao
from src.domain.models.questionarios.questionario import Questionario
from src.infra.db import User


class UsuariosRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def buscar_por_email(self, email: str) -> User | None:
        resultado = await self.db.execute(select(User).where(User.email == email))
        return resultado.scalar_one_or_none()

    async def buscar_plano(self, email: str) -> Questionario | None:
        resultado = await self.db.execute(
            select(Questionario).where(Questionario.usuario_email == email)
        )
        return resultado.scalars().first()

    async def buscar_por_id(self, user_id) -> User | None:
        return await self.db.get(User, user_id)

    async def painel_incubados(
        self, situacao: SituacaoIncubacao | None = None
    ) -> list[dict]:
        """Uma única consulta: situação e estado do plano."""
        consulta = (
            select(
                User.email,
                User.situacao_incubacao,
                Questionario.status_questionario,
            )
            .join(Questionario, Questionario.usuario_email == User.email)
            .where(User.is_incubado.is_(True), User.situacao_incubacao.is_not(None))
            .order_by(User.email)
        )
        if situacao is not None:
            consulta = consulta.where(User.situacao_incubacao == situacao)
        linhas = (await self.db.execute(consulta)).all()
        return [
            {
                "email": email,
                "situacao": sit,
                "status_questionario": status.value,
            }
            for email, sit, status in linhas
        ]

    async def alterar_situacao(
        self, usuario: User, situacao: SituacaoIncubacao, autor: str
    ) -> User:
        usuario.situacao_incubacao = situacao
        usuario.situacao_alterada_em = datetime.now(UTC)
        usuario.situacao_alterada_por = autor
        try:
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise
        return usuario
