from datetime import datetime

from sqlalchemy import DateTime, String, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class MixinDate:
    criado_por: Mapped[str] = mapped_column(String(255), nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("timezone('America/Sao_Paulo', now())"),
        nullable=False,
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("timezone('America/Sao_Paulo', now())"),
        nullable=False,
    )
    atualizado_por: Mapped[str] = mapped_column(String(255), nullable=True)
