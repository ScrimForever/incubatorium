"""id como chave primaria do questionario

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-05 23:10:00.000000

"""

from collections.abc import Sequence

from alembic import op

revision: str = "0005"
down_revision: str | Sequence[str] | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_constraint("questionario_pkey", "questionario", type_="primary")
    op.execute("ALTER TABLE questionario ADD COLUMN id SERIAL PRIMARY KEY")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("questionario", "id")
    op.create_primary_key("questionario_pkey", "questionario", ["usuario_email"])
