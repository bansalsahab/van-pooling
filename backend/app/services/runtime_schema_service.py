"""Runtime schema compatibility helpers for local development."""
from __future__ import annotations

from sqlalchemy import inspect, text

from app.database import engine


def ensure_trip_schema() -> None:
    """Backfill lightweight trip schema changes for local development."""
    with engine.begin() as connection:
        inspector = inspect(connection)
        if "trips" not in inspector.get_table_names():
            return

        columns = {column["name"] for column in inspector.get_columns("trips")}
        if "accepted_at" not in columns:
            connection.execute(text("ALTER TABLE trips ADD COLUMN accepted_at TIMESTAMP"))

        connection.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_trips_accepted_at "
                "ON trips(accepted_at)"
            )
        )


def ensure_ride_request_schema() -> None:
    """Backfill lightweight ride request schema changes for local development."""
    with engine.begin() as connection:
        inspector = inspect(connection)
        if "ride_requests" not in inspector.get_table_names():
            return

        columns = {column["name"] for column in inspector.get_columns("ride_requests")}
        if "dispatch_metadata" not in columns:
            connection.execute(text("ALTER TABLE ride_requests ADD COLUMN dispatch_metadata JSON"))


def ensure_company_schema() -> None:
    """Backfill lightweight company schema changes for local development."""
    with engine.begin() as connection:
        inspector = inspect(connection)
        if "companies" not in inspector.get_table_names():
            return

        columns = {column["name"] for column in inspector.get_columns("companies")}
        if "policy_config" not in columns:
            connection.execute(text("ALTER TABLE companies ADD COLUMN policy_config JSON"))
        if "identity_config" not in columns:
            connection.execute(text("ALTER TABLE companies ADD COLUMN identity_config JSON"))


def ensure_user_schema() -> None:
    """Backfill lightweight user schema changes for local development."""
    with engine.begin() as connection:
        inspector = inspect(connection)
        if "users" not in inspector.get_table_names():
            return

        columns = {column["name"] for column in inspector.get_columns("users")}
        if "admin_scope" not in columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN admin_scope VARCHAR(32)"))
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_users_admin_scope ON users(admin_scope)")
        )
