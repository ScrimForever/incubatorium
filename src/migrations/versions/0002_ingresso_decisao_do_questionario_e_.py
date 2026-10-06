"""ingresso: decisao do questionario e situacao do incubado

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-01 04:46:31.132918

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "questionario", sa.Column("decidido_por", sa.String(length=255), nullable=True)
    )
    op.add_column(
        "questionario",
        sa.Column("decidido_em", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("questionario", sa.Column("motivo_decisao", sa.Text(), nullable=True))
    situacao = postgresql.ENUM(
        "ativo", "concluido", "desistente", name="situacaoincubacao", create_type=False
    )
    situacao.create(op.get_bind(), checkfirst=True)
    op.add_column("user", sa.Column("situacao_incubacao", situacao, nullable=True))
    op.add_column(
        "user",
        sa.Column("situacao_alterada_em", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "user", sa.Column("situacao_alterada_por", sa.String(length=255), nullable=True)
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("user", "situacao_alterada_por")
    op.drop_column("user", "situacao_alterada_em")
    op.drop_column("user", "situacao_incubacao")
    sa.Enum(name="situacaoincubacao").drop(op.get_bind(), checkfirst=True)
    op.drop_column("questionario", "motivo_decisao")
    op.drop_column("questionario", "decidido_em")
    op.drop_column("questionario", "decidido_por")
