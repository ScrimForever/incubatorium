import asyncio
import base64
from dataclasses import dataclass
from pathlib import Path

import resend
from jinja2 import Environment, FileSystemLoader
from resend.exceptions import ResendError
from src.infra.config import settings
from src.logger import logger

resend.api_key = settings.resend_api_key

TEMPLATES_DIR = Path("templates") / "html"
jinja_env = Environment(loader=FileSystemLoader(TEMPLATES_DIR))


@dataclass
class EmailSetup:
    async def enviar_email_nova_senha(self, email: str, token: str) -> bool:
        logger.info("Enviando nova senha.")
        template = jinja_env.get_template("resetar_senha.html")
        html_renderizado = template.render(
            reset_pwd=f"http://localhost:3000/{token}",  # ajuste para a URL real
        )
        params: resend.Emails.SendParams = {
            "from": "Acme <onboarding@resend.dev>",
            "to": "maicon.kistemmacher@gmail.com",
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

    async def enviar_email_cadastro(self, email: str, codigo_ativacao: str | None) -> bool:
        logger.info("Montando corpo do email.")
        if codigo_ativacao is None:
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
        self,
        email: str,
        assunto: str,
        titulo: str,
        mensagem: str,
        detalhe: str = "",
        convite_ics: str = "",
    ) -> bool:
        """E-mail genérico de notificação; com `convite_ics`, anexa o convite de calendário
        (o `METHOD` do próprio .ics diz ao Gmail se é convite ou cancelamento)."""
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
        if convite_ics:
            metodo = "CANCEL" if "METHOD:CANCEL" in convite_ics else "REQUEST"
            params["attachments"] = [
                {
                    "filename": "convite.ics",
                    "content": base64.b64encode(convite_ics.encode()).decode(),
                    "content_type": f"text/calendar; charset=utf-8; method={metodo}",
                }
            ]
        if not settings.email_envio_habilitado or not settings.resend_api_key:
            logger.warning(
                f"Notificação '{assunto}' não enviada: envio de e-mail desabilitado "
                "ou RESEND_API_KEY ausente."
            )
            return False
        try:
            await asyncio.to_thread(resend.Emails.send, params)
            logger.success(f"Notificação '{assunto}' enviada para {email}")
            return True
        except ResendError as error:
            logger.error(error)
            return False
