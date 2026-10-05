"""data da ultima avaliacao no questionario

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-01 05:00:00.884377

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "questionario",
        sa.Column("ultima_avaliacao_em", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("questionario", "ultima_avaliacao_em")
