import os
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import resend
from jinja2 import Environment, FileSystemLoader
from loguru import logger
from resend.exceptions import ResendError
from sqlalchemy.ext.asyncio import AsyncSession
from src.infra.config import settings
from src.infra.db import get_async_session
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

    async def _verificar_codigo_usuario(self, email: str) -> str | Literal[False]:
        session, session_gen = await self._db_session()
        codigo = await UserRepository(session).verificar_codigo_usuario(email)
        await session_gen.aclose()
        return codigo

    async def enviar_email_cadastro(self, email: str) -> bool:
        logger.info("Montando corpo do email.")
        codigo_ativacao = await self._verificar_codigo_usuario(email)
        if codigo_ativacao is False:
            return False
        template = jinja_env.get_template("codigo_ativacao.html")
        html_renderizado = template.render(
            codigo_ativacao=codigo_ativacao,
            link_verificacao=f"http://127.0.0.1/validar_email/{email}/{codigo_ativacao}",  # ajuste para a URL real
        )
        params: resend.Emails.SendParams = {
            "from": "Acme <onboarding@resend.dev>",
            "to": "thiago.salgado.monteiro@gmail.com",
            "subject": "Tec Campos - Email de ativação.",
            "html": html_renderizado,
        }

        try:
            if os.getenv("ENV") == "development":
                resend.Emails.send(params)
                logger.success(f"Email de cadastro enviado para {email}")
                return True
            return False
        except ResendError as error:
            logger.error(error)
            return False
