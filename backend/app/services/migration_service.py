"""Database migration helpers powered by Alembic."""
from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from app.core.config import settings
from app.database import engine
from app.services.notification_service import ensure_notification_schema
from app.services.runtime_schema_service import ensure_trip_schema


MANAGED_TABLES = {
    "companies",
    "users",
    "vans",
    "ride_requests",
    "trips",
    "trip_passengers",
    "analytics_events",
    "notifications",
    "dispatch_events",
}


def _alembic_config() -> Config:
    backend_root = Path(__file__).resolve().parents[2]
    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option("script_location", str(backend_root / "alembic"))
    config.set_main_option("sqlalchemy.url", settings.sqlalchemy_database_uri)
    return config


def _has_legacy_schema_without_alembic_version() -> bool:
    table_names = set(inspect(engine).get_table_names())
    return "alembic_version" not in table_names and bool(table_names & MANAGED_TABLES)


def upgrade_database_schema() -> None:
    """
    Upgrade database schema to Alembic head.

    If legacy tables exist without Alembic version tracking, backfill the last
    compatibility columns and stamp them as current before future upgrades.
    """
    config = _alembic_config()
    if _has_legacy_schema_without_alembic_version():
        ensure_trip_schema()
        ensure_notification_schema()
        command.stamp(config, "head")
    command.upgrade(config, "head")
