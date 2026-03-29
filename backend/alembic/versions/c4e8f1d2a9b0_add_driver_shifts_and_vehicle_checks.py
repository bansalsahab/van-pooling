"""add_driver_shifts_and_vehicle_checks

Revision ID: c4e8f1d2a9b0
Revises: 9b6e3d2f4a10
Create Date: 2026-03-29 18:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.db_types import JSONType, UUIDType


# revision identifiers, used by Alembic.
revision: str = "c4e8f1d2a9b0"
down_revision: Union[str, Sequence[str], None] = "9b6e3d2f4a10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "driver_shifts",
        sa.Column("id", UUIDType, nullable=False),
        sa.Column("company_id", UUIDType, nullable=True),
        sa.Column("driver_id", UUIDType, nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "SCHEDULED",
                "CLOCKED_IN",
                "CLOCKED_OUT",
                "MISSED",
                name="driver_shift_status",
            ),
            nullable=False,
            server_default="SCHEDULED",
        ),
        sa.Column("scheduled_start_at", sa.TIMESTAMP(), nullable=True),
        sa.Column("scheduled_end_at", sa.TIMESTAMP(), nullable=True),
        sa.Column("clocked_in_at", sa.TIMESTAMP(), nullable=True),
        sa.Column("clocked_out_at", sa.TIMESTAMP(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("source", sa.String(length=32), nullable=False, server_default="driver"),
        sa.Column("created_at", sa.TIMESTAMP(), nullable=True, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(), nullable=True, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["driver_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_driver_shifts_company_id"), "driver_shifts", ["company_id"], unique=False)
    op.create_index(op.f("ix_driver_shifts_driver_id"), "driver_shifts", ["driver_id"], unique=False)
    op.create_index(op.f("ix_driver_shifts_status"), "driver_shifts", ["status"], unique=False)

    op.create_table(
        "vehicle_checks",
        sa.Column("id", UUIDType, nullable=False),
        sa.Column("company_id", UUIDType, nullable=True),
        sa.Column("driver_id", UUIDType, nullable=True),
        sa.Column("van_id", UUIDType, nullable=True),
        sa.Column("shift_id", UUIDType, nullable=True),
        sa.Column(
            "status",
            sa.Enum("PASSED", "FAILED", name="vehicle_check_status"),
            nullable=False,
            server_default="PASSED",
        ),
        sa.Column("checklist", JSONType(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("submitted_at", sa.TIMESTAMP(), nullable=False, server_default=sa.func.now()),
        sa.Column("source", sa.String(length=32), nullable=False, server_default="driver"),
        sa.Column("created_at", sa.TIMESTAMP(), nullable=True, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(), nullable=True, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["driver_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["shift_id"], ["driver_shifts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["van_id"], ["vans.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_vehicle_checks_company_id"), "vehicle_checks", ["company_id"], unique=False)
    op.create_index(op.f("ix_vehicle_checks_driver_id"), "vehicle_checks", ["driver_id"], unique=False)
    op.create_index(op.f("ix_vehicle_checks_shift_id"), "vehicle_checks", ["shift_id"], unique=False)
    op.create_index(op.f("ix_vehicle_checks_status"), "vehicle_checks", ["status"], unique=False)
    op.create_index(op.f("ix_vehicle_checks_submitted_at"), "vehicle_checks", ["submitted_at"], unique=False)
    op.create_index(op.f("ix_vehicle_checks_van_id"), "vehicle_checks", ["van_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_vehicle_checks_van_id"), table_name="vehicle_checks")
    op.drop_index(op.f("ix_vehicle_checks_submitted_at"), table_name="vehicle_checks")
    op.drop_index(op.f("ix_vehicle_checks_status"), table_name="vehicle_checks")
    op.drop_index(op.f("ix_vehicle_checks_shift_id"), table_name="vehicle_checks")
    op.drop_index(op.f("ix_vehicle_checks_driver_id"), table_name="vehicle_checks")
    op.drop_index(op.f("ix_vehicle_checks_company_id"), table_name="vehicle_checks")
    op.drop_table("vehicle_checks")

    op.drop_index(op.f("ix_driver_shifts_status"), table_name="driver_shifts")
    op.drop_index(op.f("ix_driver_shifts_driver_id"), table_name="driver_shifts")
    op.drop_index(op.f("ix_driver_shifts_company_id"), table_name="driver_shifts")
    op.drop_table("driver_shifts")
