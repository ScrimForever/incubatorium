from sqlalchemy.ext.asyncio import AsyncSession
from src.domain.models.enums import SituacaoIncubacao
from src.domain.models.questionarios.questionario import Questionario
from src.infra.db import User
from src.logger import logger
from src.repository.usuarios.usuarios_rep import UsuariosRepository
from src.shared.exceptions import (
    ConflitoError,
    NaoEncontradoError,
)


class UsuariosService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.usuarios = UsuariosRepository(db)

    async def plano(self, email: str) -> Questionario:
        plano = await self.usuarios.buscar_plano(email)
        if plano is None:
            raise NaoEncontradoError("O incubado ainda não possui questionário.")
        return plano

    async def painel(self, situacao: SituacaoIncubacao | None = None) -> list[dict]:
        return await self.usuarios.painel_incubados(situacao)

    async def alterar_situacao(
        self, colaborador: User, email: str, situacao: SituacaoIncubacao
    ) -> User:
        usuario = await self.usuarios.buscar_por_email(email)
        if usuario is None or not usuario.is_incubado:
            raise NaoEncontradoError("Incubado não encontrado.")
        if usuario.situacao_incubacao is None:
            raise ConflitoError("O ingresso deste usuário ainda não foi aprovado.")
        await self.usuarios.alterar_situacao(usuario, situacao, colaborador.email)
        logger.info(f"Situação de {email} alterada para {situacao.value}.")
        return usuario
