import secrets

from fastapi_users.password import PasswordHelper
from src.domain.models.enums import SituacaoIncubacao
from src.domain.models.questionario import Questionario, StatusEnum
from src.domain.models.usuario import User
from src.domain.schemas.user_schema import UsuarioCriar, UsuarioEditar
from src.logger import logger
from src.repository.questionario import QuestionarioRepository
from src.repository.usuarios import UsuariosRepository
from src.services.contratos import EmailDeCadastro
from src.shared.exceptions import (
    ConflitoError,
    NaoEncontradoError,
)


class UsuariosService:
    def __init__(
        self,
        usuarios: UsuariosRepository,
        questionarios: QuestionarioRepository,
        email: EmailDeCadastro,
    ):
        self.usuarios = usuarios
        self.questionarios = questionarios
        self.email = email

    async def plano(self, email: str) -> Questionario:
        plano = await self.questionarios.buscar(email)
        if plano is None:
            raise NaoEncontradoError("O incubado ainda não possui questionário.")
        return plano

    async def painel(self, situacao: SituacaoIncubacao | None = None) -> list[dict]:
        return await self.usuarios.painel_incubados(situacao)

    async def todos(self) -> list[User]:
        return await self.usuarios.listar_todos()

    async def avaliadores(self) -> list[User]:
        return await self.usuarios.listar_consultores()

    async def criar(self, administrador: User, corpo: UsuarioCriar) -> User:
        """Cria conta com um perfil.

        Com senha: conta ativa, e incubado já ganha o questionário inicial. Sem senha:
        senha aleatória, conta inativa e código de ativação por e-mail; o questionário
        do incubado nasce na ativação (`AtivacaoService.ativar`).
        """
        if await self.usuarios.buscar_por_email(corpo.email) is not None:
            raise ConflitoError("E-mail já cadastrado.")
        ativo = bool(corpo.password.strip())
        senha = corpo.password if ativo else secrets.token_urlsafe(32)
        usuario = User(
            email=corpo.email,
            hashed_password=PasswordHelper().hash(senha),
            is_admin=corpo.is_admin,
            is_colaborador=corpo.is_colaborador,
            is_consultor=corpo.is_consultor,
            is_incubado=corpo.is_incubado,
            nome=corpo.nome,
            sobrenome=corpo.sobrenome,
            telefone=corpo.telefone,
        )
        await self.usuarios.criar(usuario, ativo=ativo)
        if ativo and usuario.is_incubado:
            await self._criar_questionario_inicial(administrador, usuario)
        await self.usuarios.salvar()
        logger.info(f"Usuário {usuario.email} criado por {administrador.email}.")
        if not ativo and not await self.email.enviar_email_cadastro(
            usuario.email, usuario.codigo_ativacao, definir_senha=True
        ):
            logger.warning(
                f"Código de ativação de {usuario.email} não foi enviado; "
                "use /reenviar_codigo."
            )
        return usuario

    async def editar(
        self, administrador: User, email: str, corpo: UsuarioEditar
    ) -> User:
        """Aplica só os campos enviados. Incubado ativo sem questionário ganha o inicial.

        Ativar manualmente (`is_active=True`) descarta o código de ativação pendente.
        """
        usuario = await self.usuarios.buscar_por_email(email)
        if usuario is None:
            raise NaoEncontradoError("Usuário não encontrado.")
        perfis = corpo.perfis_enviados
        if usuario.id == administrador.id and (
            (perfis and not perfis.get("is_admin")) or corpo.is_active is False
        ):
            raise ConflitoError(
                "O admin não pode remover o próprio perfil de admin nem se desativar."
            )

        for campo in ("nome", "sobrenome", "telefone", "is_active"):
            if campo in corpo.model_fields_set:
                setattr(usuario, campo, getattr(corpo, campo))
        if corpo.password is not None:
            usuario.hashed_password = PasswordHelper().hash(corpo.password)
        if perfis:
            for campo in ("is_admin", "is_colaborador", "is_consultor", "is_incubado"):
                setattr(usuario, campo, perfis.get(campo, False))
        if corpo.is_active:
            usuario.codigo_ativacao = None
        # Conta ainda aguardando o código ganha o questionário na ativação.
        if (
            usuario.is_incubado
            and usuario.is_active
            and await self.questionarios.buscar(email) is None
        ):
            await self._criar_questionario_inicial(administrador, usuario)

        await self.usuarios.salvar()
        logger.info(f"Usuário {usuario.email} editado por {administrador.email}.")
        return usuario

    async def _criar_questionario_inicial(self, administrador: User, usuario: User):
        await self.questionarios.criar(
            Questionario(
                usuario_email=usuario.email,
                criado_por=administrador.email,
                status_questionario=StatusEnum.iniciado,
                json_questionario={},
            )
        )

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
