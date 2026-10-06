"""baseline user e questionario

Esquema que antes nascia de `create_all`. Idempotente: bancos já criados por
`create_all` mantêm suas tabelas e só recebem o carimbo desta revisão.

Revision ID: 0001
Revises:
Create Date: 2026-10-01 04:43:46.182190

"""

from collections.abc import Sequence

import fastapi_users_db_sqlalchemy
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    tabelas = sa.inspect(op.get_bind()).get_table_names()

    if "questionario" not in tabelas:
        op.create_table(
            "questionario",
            sa.Column("usuario_email", sa.String(length=255), nullable=False),
            sa.Column(
                "status_questionario",
                sa.Enum(
                    "iniciado",
                    "pendente",
                    "aguardando_aprovacao",
                    "aprovado",
                    "rejeitado",
                    name="statusenum",
                ),
                nullable=False,
            ),
            sa.Column(
                "json_questionario",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=True,
            ),
            sa.Column("criado_por", sa.String(length=255), nullable=False),
            sa.Column(
                "criado_em",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=True),
            sa.Column("atualizado_por", sa.String(length=255), nullable=True),
            sa.PrimaryKeyConstraint("usuario_email"),
        )

    if "user" not in tabelas:
        op.create_table(
            "user",
            sa.Column("is_admin", sa.Boolean(), nullable=True),
            sa.Column("is_consultor", sa.Boolean(), nullable=True),
            sa.Column("is_incubado", sa.Boolean(), nullable=True),
            sa.Column("is_colaborador", sa.Boolean(), nullable=True),
            sa.Column("codigo_ativacao", sa.String(length=6), nullable=True),
            sa.Column(
                "id", fastapi_users_db_sqlalchemy.generics.GUID(), nullable=False
            ),
            sa.Column("email", sa.String(length=320), nullable=False),
            sa.Column("hashed_password", sa.String(length=1024), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("is_superuser", sa.Boolean(), nullable=False),
            sa.Column("is_verified", sa.Boolean(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_user_email"), "user", ["email"], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_user_email"), table_name="user")
    op.drop_table("user")
    op.drop_table("questionario")
    sa.Enum(name="statusenum").drop(op.get_bind(), checkfirst=True)
