from collections.abc import AsyncGenerator
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import resend
from jinja2 import Environment, FileSystemLoader
from resend.exceptions import ResendError
from sqlalchemy.ext.asyncio import AsyncSession
from src.infra.config import settings
from src.infra.db import get_async_session
from src.logger import logger
from src.repository.user.user_rep import UserRepository

resend.api_key = settings.resend_api_key

TEMPLATES_DIR = Path("templates") / "html"
jinja_env = Environment(loader=FileSystemLoader(TEMPLATES_DIR))


@dataclass
class EmailSetup:
    @staticmethod
    async def _db_session() -> tuple[AsyncSession, AsyncGenerator]:
        session_gen = get_async_session()
        session = await anext(session_gen)
        return session, session_gen

    async def enviar_email_nova_senha(self, email: str, token: str) -> bool:
        logger.info("Enviando nova senha.")
        template = jinja_env.get_template("resetar_senha.html")
        html_renderizado = template.render(
            reset_pwd=f"http://localhost:3000/{token}",  # ajuste para a URL real
        )
        params: resend.Emails.SendParams = {
            "from": "Acme <onboarding@resend.dev>",
            "to": "thiago.salgado.monteiro@gmail.com",
            "subject": "Tec Campos - Reativação de senha.",
            "html": html_renderizado,
        }

        try:
            if settings.enviroment == "development":
                logger.info("Enviando email.")
                resend.Emails.send(params)
                logger.success(f"Email de cadastro enviado para {email}")
                return True
            return False
        except ResendError as error:
            logger.error(error)
            return False

    async def _verificar_codigo_usuario(self, email: str) -> str | Literal[False]:
        session, session_gen = await self._db_session()
        codigo = await UserRepository(session).verificar_codigo_usuario(email)
        await session_gen.aclose()
        return codigo

    async def enviar_email_cadastro(self, email: str) -> bool:
        logger.info("Montando corpo do email.")
        codigo_ativacao = await self._verificar_codigo_usuario(email)
        logger.debug(f"codigo_ativacao = {codigo_ativacao}")
        if codigo_ativacao is False:
            return False
        template = jinja_env.get_template("codigo_ativacao.html")
        html_renderizado = template.render(
            codigo_ativacao=codigo_ativacao,
            link_verificacao=f"http://127.0.0.1:8000/validar_email/{email}/{codigo_ativacao}",  # ajuste para a URL real
        )
        params: resend.Emails.SendParams = {
            "from": "Acme <onboarding@resend.dev>",
            "to": "thiago.salgado.monteiro@gmail.com",
            "subject": "Tec Campos - Email de Ativação.",
            "html": html_renderizado,
        }

        try:
            if settings.enviroment == "development":
                logger.info("Enviando email.")
                resend.Emails.send(params)
                logger.success(f"Email de cadastro enviado para {email}")
                return True
            return False
        except ResendError as error:
            logger.error(error)
            return False

    @staticmethod
    def _destinatario(email: str) -> str:
        """Em testes de homologação, `EMAIL_DESTINO_OVERRIDE` redireciona todos os envios."""
        return settings.email_destino_override or email

    async def enviar_notificacao(
        self, email: str, assunto: str, titulo: str, mensagem: str, detalhe: str = ""
    ) -> bool:
        """E-mail genérico de notificação (decisão de ingresso, nova avaliação)."""
        template = jinja_env.get_template("notificacao.html")
        html_renderizado = template.render(
            titulo=titulo, mensagem=mensagem, detalhe=detalhe
        )
        params: resend.Emails.SendParams = {
            "from": "Acme <onboarding@resend.dev>",
            "to": self._destinatario(email),
            "subject": f"Tec Campos - {assunto}",
            "html": html_renderizado,
        }
        if not settings.email_envio_habilitado or not settings.resend_api_key:
            logger.warning(
                f"Notificação '{assunto}' não enviada: envio de e-mail desabilitado "
                "ou RESEND_API_KEY ausente."
            )
            return False
        try:
            resend.Emails.send(params)
            logger.success(f"Notificação '{assunto}' enviada para {email}")
            return True
        except ResendError as error:
            logger.error(error)
            return False

    async def enviar_email_decisao_ingresso(
        self, email: str, aprovado: bool, motivo: str | None = None
    ) -> bool:
        if aprovado:
            return await self.enviar_notificacao(
                email,
                "Ingresso aprovado",
                "Seu ingresso foi aprovado",
                "Parabéns! Seu plano de negócio foi aprovado e você agora é um incubado.",
            )
        return await self.enviar_notificacao(
            email,
            "Ingresso não aprovado",
            "Seu plano de negócio foi devolvido",
            "Seu pedido de ingresso não foi aprovado desta vez. "
            "Você pode revisar o plano e enviar um novo pedido.",
            detalhe=f"Motivo: {motivo}" if motivo else "",
        )

    async def enviar_email_nova_avaliacao(
        self, email: str, etapa: str, nota: int, parecer: str
    ) -> bool:
        return await self.enviar_notificacao(
            email,
            "Nova avaliação",
            "Você recebeu uma nova avaliação",
            f'Sua etapa "{etapa}" foi avaliada com nota {nota}.',
            detalhe=parecer,
        )
