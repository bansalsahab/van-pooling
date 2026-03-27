"""Apply Alembic migrations to the configured database."""
from app.services.migration_service import upgrade_database_schema


def main() -> None:
    """Upgrade database schema to latest revision."""
    upgrade_database_schema()
    print("Database migrated to latest revision.")


if __name__ == "__main__":
    main()
