"""add_service_zones_and_recurring_rules

Revision ID: 9b6e3d2f4a10
Revises: 5f9c2a7a1b01
Create Date: 2026-03-29 18:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.db_types import JSONType, UUIDType


# revision identifiers, used by Alembic.
revision: str = "9b6e3d2f4a10"
down_revision: Union[str, Sequence[str], None] = "5f9c2a7a1b01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "service_zones",
        sa.Column("id", UUIDType, nullable=False),
        sa.Column("company_id", UUIDType, nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "zone_type",
            sa.Enum("PICKUP", "DESTINATION", name="service_zone_type"),
            nullable=False,
        ),
        sa.Column("polygon_geojson", JSONType(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.TIMESTAMP(), server_default=sa.func.now(), nullable=True),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_service_zones_company_id"), "service_zones", ["company_id"], unique=False)
    op.create_index(op.f("ix_service_zones_is_active"), "service_zones", ["is_active"], unique=False)
    op.create_index(op.f("ix_service_zones_zone_type"), "service_zones", ["zone_type"], unique=False)

    op.create_table(
        "recurring_ride_rules",
        sa.Column("id", UUIDType, nullable=False),
        sa.Column("user_id", UUIDType, nullable=True),
        sa.Column("company_id", UUIDType, nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "status",
            sa.Enum("ACTIVE", "PAUSED", name="recurring_ride_rule_status"),
            nullable=False,
            server_default="ACTIVE",
        ),
        sa.Column("weekdays", sa.String(length=32), nullable=False, server_default="0,1,2,3,4"),
        sa.Column("pickup_time_local", sa.String(length=5), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False, server_default="Asia/Kolkata"),
        sa.Column("pickup_address", sa.Text(), nullable=False),
        sa.Column("pickup_latitude", sa.Float(), nullable=False),
        sa.Column("pickup_longitude", sa.Float(), nullable=False),
        sa.Column("destination_address", sa.Text(), nullable=False),
        sa.Column("destination_latitude", sa.Float(), nullable=False),
        sa.Column("destination_longitude", sa.Float(), nullable=False),
        sa.Column("last_generated_for_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(), server_default=sa.func.now(), nullable=True),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_recurring_ride_rules_company_id"),
        "recurring_ride_rules",
        ["company_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_recurring_ride_rules_status"),
        "recurring_ride_rules",
        ["status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_recurring_ride_rules_user_id"),
        "recurring_ride_rules",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_recurring_ride_rules_user_id"), table_name="recurring_ride_rules")
    op.drop_index(op.f("ix_recurring_ride_rules_status"), table_name="recurring_ride_rules")
    op.drop_index(op.f("ix_recurring_ride_rules_company_id"), table_name="recurring_ride_rules")
    op.drop_table("recurring_ride_rules")

    op.drop_index(op.f("ix_service_zones_zone_type"), table_name="service_zones")
    op.drop_index(op.f("ix_service_zones_is_active"), table_name="service_zones")
    op.drop_index(op.f("ix_service_zones_company_id"), table_name="service_zones")
    op.drop_table("service_zones")
