from src.domain.models.questionario import Questionario, StatusEnum
from src.logger import logger
from src.repository.questionario import QuestionarioRepository
from src.repository.usuarios import UsuariosRepository
from src.services.email.setup import EmailSetup


class AtivacaoService:
    """Ativação da conta por código e reenvio do código por e-mail."""

    def __init__(
        self,
        usuarios: UsuariosRepository,
        questionarios: QuestionarioRepository,
        email: EmailSetup,
    ):
        self.usuarios = usuarios
        self.questionarios = questionarios
        self.email = email

    async def ativar(self, email: str, codigo: str) -> bool:
        """Ativa a conta e cria o questionário `iniciado` (vazio) do usuário."""
        logger.info(f"Ativando código para usuário: {email}")
        if not await self.usuarios.ativar_por_codigo(email, codigo):
            return False
        if await self.questionarios.buscar(email) is not None:
            logger.warning(f"Usuário {email} já possui questionário.")
            return False
        await self.questionarios.criar(
            Questionario(
                usuario_email=email,
                criado_por=email,
                status_questionario=StatusEnum.iniciado,
                json_questionario={},
            )
        )
        logger.success(f"Questionario gerado com sucesso para o usuário: {email}")
        return True

    async def reenviar_codigo(self, email: str) -> bool:
        """Gera um novo código e o envia por e-mail."""
        logger.info(f"Reenviando código para email: {email}")
        usuario = await self.usuarios.buscar_por_email(email)
        if usuario is None:
            return False
        await self.usuarios.gerar_novo_codigo(usuario)
        return await self.email.enviar_email_cadastro(usuario.email)
