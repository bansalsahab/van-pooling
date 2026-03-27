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
