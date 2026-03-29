"""enterprise_scope_and_identity_config

Revision ID: 8c0fd93a5e54
Revises: 414d0978b9fb
Create Date: 2026-03-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8c0fd93a5e54"
down_revision: Union[str, Sequence[str], None] = "414d0978b9fb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("admin_scope", sa.String(length=32), nullable=True))
        batch_op.create_index(batch_op.f("ix_users_admin_scope"), ["admin_scope"], unique=False)

    with op.batch_alter_table("companies", schema=None) as batch_op:
        batch_op.add_column(sa.Column("identity_config", sa.JSON(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("companies", schema=None) as batch_op:
        batch_op.drop_column("identity_config")

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_users_admin_scope"))
        batch_op.drop_column("admin_scope")

