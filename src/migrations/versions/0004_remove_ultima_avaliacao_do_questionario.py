"""remove ultima avaliacao do questionario

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-05 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_column("questionario", "ultima_avaliacao_em")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        "questionario",
        sa.Column("ultima_avaliacao_em", sa.DateTime(timezone=True), nullable=True),
    )
