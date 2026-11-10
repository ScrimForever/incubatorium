"""flag avaliado_admin no questionário

Questionários já existentes começam com `avaliado_admin = false`.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-10 00:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "questionario",
        sa.Column(
            "avaliado_admin",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("questionario", "avaliado_admin")
