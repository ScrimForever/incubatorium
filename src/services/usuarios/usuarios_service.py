from fastapi_users.password import PasswordHelper

from src.domain.models.enums import SituacaoIncubacao
from src.domain.models.questionario import Questionario, StatusEnum
from src.domain.models.usuario import User
from src.domain.schemas.user_schema import UsuarioCriar
from src.logger import logger
from src.repository.questionario import QuestionarioRepository
from src.repository.usuarios import UsuariosRepository
from src.shared.exceptions import (
    ConflitoError,
    NaoEncontradoError,
)


class UsuariosService:
    def __init__(
        self, usuarios: UsuariosRepository, questionarios: QuestionarioRepository
    ):
        self.usuarios = usuarios
        self.questionarios = questionarios

    async def plano(self, email: str) -> Questionario:
        plano = await self.questionarios.buscar(email)
        if plano is None:
            raise NaoEncontradoError("O incubado ainda não possui questionário.")
        return plano

    async def painel(self, situacao: SituacaoIncubacao | None = None) -> list[dict]:
        return await self.usuarios.painel_incubados(situacao)

    async def criar(self, administrador: User, corpo: UsuarioCriar) -> User:
        """Cria conta ativa com um perfil. Incubado também ganha o questionário inicial."""
        if await self.usuarios.buscar_por_email(corpo.email) is not None:
            raise ConflitoError("E-mail já cadastrado.")
        usuario = User(
            email=corpo.email,
            hashed_password=PasswordHelper().hash(corpo.password),
            is_admin=corpo.is_admin,
            is_colaborador=corpo.is_colaborador,
            is_consultor=corpo.is_consultor,
            is_incubado=corpo.is_incubado,
        )
        await self.usuarios.criar(usuario)
        if usuario.is_incubado:
            await self.questionarios.criar(
                Questionario(
                    usuario_email=usuario.email,
                    criado_por=administrador.email,
                    status_questionario=StatusEnum.iniciado,
                    json_questionario={},
                )
            )
        await self.usuarios.salvar()
        logger.info(f"Usuário {usuario.email} criado por {administrador.email}.")
        return usuario

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
