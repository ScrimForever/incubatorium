"""tabela de avaliadores selecionados por questionário

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-10 00:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "questionario_avaliador",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("questionario_id", sa.Integer(), nullable=False),
        sa.Column("avaliador_email", sa.String(length=255), nullable=False),
        sa.Column("criado_por", sa.String(length=255), nullable=False),
        sa.Column(
            "criado_em",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("atualizado_por", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(
            ["questionario_id"], ["questionario.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "questionario_id", "avaliador_email", name="uq_questionario_avaliador"
        ),
    )
    op.create_index(
        op.f("ix_questionario_avaliador_questionario_id"),
        "questionario_avaliador",
        ["questionario_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_questionario_avaliador_avaliador_email"),
        "questionario_avaliador",
        ["avaliador_email"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_questionario_avaliador_avaliador_email"),
        table_name="questionario_avaliador",
    )
    op.drop_index(
        op.f("ix_questionario_avaliador_questionario_id"),
        table_name="questionario_avaliador",
    )
    op.drop_table("questionario_avaliador")
