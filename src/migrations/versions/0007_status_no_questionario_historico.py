"""status_questionario no questionario_historico

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-16 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007"
down_revision: str | Sequence[str] | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# O tipo `statusenum` já existe (criado em 0001); não recriar.
statusenum = postgresql.ENUM(
    "iniciado",
    "pendente",
    "aguardando_aprovacao",
    "aprovado",
    "rejeitado",
    name="statusenum",
    create_type=False,
)


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "questionario_historico",
        sa.Column("status_questionario", statusenum, nullable=True),
    )
    # Linhas existentes herdam o status atual do questionário.
    op.execute(
        "UPDATE questionario_historico h SET status_questionario = q.status_questionario "
        "FROM questionario q WHERE h.questionario_id = q.id"
    )
    op.alter_column("questionario_historico", "status_questionario", nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("questionario_historico", "status_questionario")
