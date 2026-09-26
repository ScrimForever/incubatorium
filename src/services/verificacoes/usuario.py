from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from src.domain.models.user_model import User
from src.logger import logger
from src.repository.questionario.questionario_rep import QuestionarioRepository
from src.repository.user.user_rep import UserRepository
from src.services.email.setup import EmailSetup


class UserService:
    def __init__(self, db: AsyncSession):

        self.db = db
        self.repository = UserRepository(self.db)

    async def _auto_criar_questionario(self, email: str) -> bool:
        logger.info("Buscando usuário na base de dados")
        usuario = await self.repository.buscar_usuario(email)
        if not usuario:
            logger.info("Usuário não encontrado")
            return False
        questionario_repository = QuestionarioRepository(usuario, self.db)
        logger.info(f"Gerando o questionario para o usuário: {email}")
        gerar_questionario = await questionario_repository.inicializar_questionario(
            usuario.email
        )
        if not gerar_questionario:
            logger.warning(
                f"Não foi possível gerar o questionario para o usuário: {email}"
            )
            return False
        logger.success(f"Questionario gerado com sucesso para o usuário: {email}")
        return True

    async def ativar_usuario_com_codigo_verificacao(
        self, email: str, codigo: str
    ) -> bool:
        logger.info(f"Ativando código para usuário: {email}")
        ativacao_usuario = await self.repository.ativar_usuario_por_codigo_gerado(
            email, codigo
        )
        if not ativacao_usuario:
            return False
        criar_questionario = await self._auto_criar_questionario(email)
        if not criar_questionario:
            return False
        return criar_questionario

    async def verificar_usuario(self, email: str) -> Any | bool:
        usuario = await self.repository.verificar_email(email)
        if usuario:
            return usuario
        return False

    async def reativar_codigo(self, usuario: User) -> bool:
        logger.info(f"Reativando código: {usuario.email}")
        persiste_codigo = await self.repository.reativar_codigo(usuario)
        logger.debug(f"codigo = {persiste_codigo}")
        if persiste_codigo:
            envio_email = await EmailSetup().enviar_email_cadastro(usuario.email)
            return envio_email
        return False

    async def reenviar_codigo_para_email(self, email: str) -> bool:
        logger.info(f"Reenviando código para email: {email}")
        usuario = await self.verificar_usuario(email)
        logger.debug(f"usuario = {usuario}")
        if not usuario:
            return False
        else:
            return await self.reativar_codigo(usuario)
