"""histórico de acesso: logins e trocas de senha (somente inserção)

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-11 00:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

EVENTO = sa.Enum("login_sucesso", "login_falha", "senha_alterada", name="evento_acesso")
MOTIVO = sa.Enum(
    "credenciais_invalidas",
    "conta_inativa",
    "propria",
    "recuperacao",
    "administrador",
    name="motivo_acesso",
)


def upgrade() -> None:
    op.create_table(
        "historico_acesso",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("evento", EVENTO, nullable=False),
        sa.Column("motivo", MOTIVO, nullable=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("usuario_id", sa.Uuid(), nullable=True),
        sa.Column("autor_email", sa.String(length=320), nullable=True),
        sa.Column("ip", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column(
            "criado_em",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_historico_acesso_email", "historico_acesso", ["email"])
    op.create_index("ix_historico_acesso_evento", "historico_acesso", ["evento"])
    op.create_index("ix_historico_acesso_criado_em", "historico_acesso", ["criado_em"])
    # Trilha de auditoria: nada é alterado nem apagado depois de gravado.
    op.execute(
        """
        CREATE FUNCTION historico_acesso_imutavel() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'historico_acesso aceita apenas INSERT';
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER historico_acesso_imutavel
        BEFORE UPDATE OR DELETE OR TRUNCATE ON historico_acesso
        FOR EACH STATEMENT EXECUTE FUNCTION historico_acesso_imutavel();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER historico_acesso_imutavel ON historico_acesso")
    op.execute("DROP FUNCTION historico_acesso_imutavel()")
    op.drop_table("historico_acesso")
    MOTIVO.drop(op.get_bind(), checkfirst=True)
    EVENTO.drop(op.get_bind(), checkfirst=True)
