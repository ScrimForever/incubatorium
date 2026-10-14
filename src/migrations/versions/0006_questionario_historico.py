"""tabela questionario_historico

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-14 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: str | Sequence[str] | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "questionario_historico",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("questionario_id", sa.Integer(), nullable=False),
        sa.Column("usuario_email", sa.String(length=255), nullable=False),
        sa.Column("json_questionario", postgresql.JSONB(), nullable=True),
        sa.Column(
            "criado_em",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["questionario_id"], ["questionario.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_questionario_historico_questionario_id",
        "questionario_historico",
        ["questionario_id"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        "ix_questionario_historico_questionario_id", table_name="questionario_historico"
    )
    op.drop_table("questionario_historico")
