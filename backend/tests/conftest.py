"""Shared pytest fixtures for backend workflow tests."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import sys

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.security import get_password_hash
from app.database import Base, get_db
from app.geo import point_value
from app.models.company import Company
from app.models.user import User, UserRole, UserStatus
from app.models.van import Van, VanStatus


TEST_PASSWORD = "password123"


@pytest.fixture()
def db_session_factory():
    """Create an isolated SQLite database for each test."""
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _enable_foreign_keys(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    try:
        yield factory
    finally:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture()
def seeded_data(db_session_factory):
    """Seed two tenant companies with users and vans."""
    db: Session = db_session_factory()
    try:
        password_hash = get_password_hash(TEST_PASSWORD)

        company_a = Company(name="TechCorp", domain="techcorp.com")
        company_b = Company(name="OtherCorp", domain="othercorp.com")
        db.add_all([company_a, company_b])
        db.flush()

        admin_a = User(
            company_id=company_a.id,
            email="admin@techcorp.com",
            password_hash=password_hash,
            name="Admin A",
            role=UserRole.ADMIN,
            status=UserStatus.ACTIVE,
        )
        driver_a1 = User(
            company_id=company_a.id,
            email="driver1@techcorp.com",
            password_hash=password_hash,
            name="Driver A1",
            role=UserRole.DRIVER,
            status=UserStatus.ACTIVE,
        )
        driver_a2 = User(
            company_id=company_a.id,
            email="driver2@techcorp.com",
            password_hash=password_hash,
            name="Driver A2",
            role=UserRole.DRIVER,
            status=UserStatus.ACTIVE,
        )
        employee_a = User(
            company_id=company_a.id,
            email="employee@techcorp.com",
            password_hash=password_hash,
            name="Employee A",
            role=UserRole.EMPLOYEE,
            status=UserStatus.ACTIVE,
            home_location=point_value(77.5946, 12.9716, sqlite_mode=True),
            home_address="Koramangala, Bangalore",
            default_destination=point_value(77.6000, 12.9800, sqlite_mode=True),
            default_destination_address="TechCorp Office, Whitefield",
        )

        admin_b = User(
            company_id=company_b.id,
            email="admin@othercorp.com",
            password_hash=password_hash,
            name="Admin B",
            role=UserRole.ADMIN,
            status=UserStatus.ACTIVE,
        )
        employee_b = User(
            company_id=company_b.id,
            email="employee@othercorp.com",
            password_hash=password_hash,
            name="Employee B",
            role=UserRole.EMPLOYEE,
            status=UserStatus.ACTIVE,
        )
        db.add_all([admin_a, driver_a1, driver_a2, employee_a, admin_b, employee_b])
        db.flush()

        van_a1 = Van(
            company_id=company_a.id,
            driver_id=driver_a1.id,
            license_plate="KA-01-AA-1111",
            capacity=8,
            current_location=point_value(77.5950, 12.9705, sqlite_mode=True),
            current_occupancy=0,
            status=VanStatus.AVAILABLE,
            last_location_update=datetime.utcnow(),
        )
        van_a2 = Van(
            company_id=company_a.id,
            driver_id=driver_a2.id,
            license_plate="KA-01-AA-2222",
            capacity=8,
            current_location=point_value(77.6200, 12.9400, sqlite_mode=True),
            current_occupancy=0,
            status=VanStatus.AVAILABLE,
            last_location_update=datetime.utcnow(),
        )
        db.add_all([van_a1, van_a2])
        db.commit()

        return {
            "password": TEST_PASSWORD,
            "company_a": str(company_a.id),
            "company_b": str(company_b.id),
            "users": {
                "admin_a": admin_a.email,
                "driver_a1": driver_a1.email,
                "driver_a2": driver_a2.email,
                "employee_a": employee_a.email,
                "admin_b": admin_b.email,
                "employee_b": employee_b.email,
            },
            "vans": {
                "van_a1": str(van_a1.id),
                "van_a2": str(van_a2.id),
            },
        }
    finally:
        db.close()


@pytest.fixture()
def client(db_session_factory, seeded_data):
    """Create a test client with an overridden DB session dependency."""
    app = FastAPI()
    app.include_router(api_router, prefix=settings.API_V1_STR)

    def override_get_db():
        db = db_session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def auth_headers(client, seeded_data):
    """Return an auth helper that logs in and returns bearer headers."""

    def _headers(email: str, role: str) -> dict[str, str]:
        response = client.post(
            f"{settings.API_V1_STR}/auth/login",
            json={
                "email": email,
                "password": seeded_data["password"],
                "requested_role": role,
            },
        )
        assert response.status_code == 200, response.text
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    return _headers
