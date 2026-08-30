import os
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from pathlib import Path

import resend
from jinja2 import Environment, FileSystemLoader
from loguru import logger
from resend.exceptions import ResendError
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from src.infra.config import settings
from src.infra.db import User, get_async_session

resend.api_key = settings.resend_api_key

TEMPLATES_DIR = Path("templates") / "html"
jinja_env = Environment(loader=FileSystemLoader(TEMPLATES_DIR))


@dataclass
class EmailSetup:
    email: str = ""

    @staticmethod
    async def _db_session() -> tuple[AsyncSession, AsyncGenerator]:
        session_gen = get_async_session()
        session = await anext(session_gen)
        return session, session_gen

    async def _verificar_codigo_usuario(self, email: str) -> str | None:
        session, session_gen = await self._db_session()
        query = select(User).where(User.email == email)
        logger.info(f"Verificando codigo de ativação do usuario: {email}")
        try:
            result = await session.execute(query)
            user = result.scalar_one_or_none()
            logger.success(
                f"Código de ativação identificado para o usuario: {user.email}"
            )
            return user.codigo_ativacao
        except SQLAlchemyError as error:
            logger.error(error)
            return None
        finally:
            await session_gen.aclose()

    async def enviar_email_cadastro(self, email: str):
        self.email = email
        logger.info("Montando corpo do email.")
        codigo_ativacao = await self._verificar_codigo_usuario(email)

        template = jinja_env.get_template("codigo_ativacao.html")
        html_renderizado = template.render(
            codigo_ativacao=codigo_ativacao,
            link_verificacao="http://127.0.0.1/validar_email",  # ajuste para a URL real
        )

        params: resend.Emails.SendParams = {
            "from": "Acme <onboarding@resend.dev>",
            "to": "thiago.salgado.monteiro@gmail.com",
            "subject": "Tec Campos - Email de ativação.",
            "html": html_renderizado,
        }

        try:
            if os.getenv("ENV") != "development":
                email_enviado = resend.Emails.send(params)
                logger.success(f"Email de cadastro enviado para {email}")
                return email_enviado
            else:
                ...
        except ResendError as error:
            logger.error(error)
