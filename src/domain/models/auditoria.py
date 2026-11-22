"""Histórico de acesso: logins (com e sem sucesso) e trocas de senha.

Só recebe inserções. Em Postgres, um gatilho (migração 0005) recusa UPDATE e DELETE.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, Integer, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column
from src.domain.models.base import Base


class EventoAcesso(str, enum.Enum):
    login_sucesso = "login_sucesso"
    login_falha = "login_falha"
    senha_alterada = "senha_alterada"


class MotivoAcesso(str, enum.Enum):
    """Detalhe do evento: por que o login falhou ou por qual caminho a senha mudou."""

    credenciais_invalidas = "credenciais_invalidas"
    conta_inativa = "conta_inativa"
    propria = "propria"  # o próprio usuário, logado (PATCH /users/me)
    recuperacao = "recuperacao"  # link de "esqueci a senha"
    administrador = "administrador"  # outra conta alterou (admin ou superusuário)


class RegistroAcesso(Base):
    __tablename__ = "historico_acesso"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    evento: Mapped[EventoAcesso] = mapped_column(
        Enum(EventoAcesso, name="evento_acesso"), nullable=False, index=True
    )
    motivo: Mapped[MotivoAcesso | None] = mapped_column(
        Enum(MotivoAcesso, name="motivo_acesso"), nullable=True
    )
    # E-mail informado, mesmo sem conta: tentativas contra contas inexistentes também contam.
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    # Sem FK: o histórico sobrevive à exclusão da conta.
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    autor_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
