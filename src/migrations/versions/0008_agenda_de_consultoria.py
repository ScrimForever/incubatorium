"""agenda de consultoria: janelas e horarios

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-19 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | Sequence[str] | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "consultoria_janela",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("consultor_email", sa.String(length=255), nullable=False),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("hora_inicio", sa.Time(), nullable=False),
        sa.Column("hora_fim", sa.Time(), nullable=False),
        sa.Column("duracao_minutos", sa.Integer(), nullable=False),
        sa.Column("criado_por", sa.String(length=255), nullable=False),
        sa.Column(
            "criado_em",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("atualizado_por", sa.String(length=255), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_consultoria_janela_consultor_email",
        "consultoria_janela",
        ["consultor_email"],
    )
    op.create_table(
        "consultoria_horario",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("janela_id", sa.Integer(), nullable=False),
        sa.Column("consultor_email", sa.String(length=255), nullable=False),
        sa.Column("inicio", sa.DateTime(timezone=True), nullable=False),
        sa.Column("fim", sa.DateTime(timezone=True), nullable=False),
        sa.Column("incubado_email", sa.String(length=255), nullable=True),
        sa.Column("reservado_em", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["janela_id"], ["consultoria_janela.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("consultor_email", "inicio"),
    )
    op.create_index(
        "ix_consultoria_horario_janela_id", "consultoria_horario", ["janela_id"]
    )
    op.create_index(
        "ix_consultoria_horario_consultor_email",
        "consultoria_horario",
        ["consultor_email"],
    )
    op.create_index(
        "ix_consultoria_horario_incubado_email",
        "consultoria_horario",
        ["incubado_email"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("consultoria_horario")
    op.drop_table("consultoria_janela")
