"""adiciona nome, sobrenome e telefone aos usuários

Usuários já cadastrados recebem valores gerados e distintos entre si (numerados pela
ordem de criação), para que nenhum fique sem os novos campos.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-10 00:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("user", sa.Column("nome", sa.String(length=255), nullable=True))
    op.add_column("user", sa.Column("sobrenome", sa.String(length=255), nullable=True))
    op.add_column("user", sa.Column("telefone", sa.String(length=32), nullable=True))

    # Numeração por ordem de criação: cada usuário recebe um valor diferente dos demais.
    op.execute(
        """
        UPDATE "user" AS u
        SET nome = 'Nome ' || n.seq,
            sobrenome = 'Sobrenome ' || n.seq,
            telefone = '+55 11 9' || LPAD(n.seq::text, 8, '0')
        FROM (
            SELECT id, ROW_NUMBER() OVER (ORDER BY email) AS seq
            FROM "user"
        ) AS n
        WHERE u.id = n.id
        """
    )


def downgrade() -> None:
    op.drop_column("user", "telefone")
    op.drop_column("user", "sobrenome")
    op.drop_column("user", "nome")
