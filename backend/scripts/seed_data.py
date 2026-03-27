"""Seed demo data using ORM models."""
from app.core.security import get_password_hash
from app.database import SessionLocal
from app.geo import point_value
from app.models.company import Company
from app.models.user import User, UserRole, UserStatus
from app.models.van import Van, VanStatus
from app.services.migration_service import upgrade_database_schema


def seed() -> None:
    """Create a demo tenant, users, and vans if they do not exist."""
    upgrade_database_schema()
    db = SessionLocal()
    try:
        existing_company = db.query(Company).filter_by(domain="techcorp.com").first()
        if existing_company is not None:
            print("Demo data already present.")
            return

        company = Company(
            name="TechCorp India",
            domain="techcorp.com",
            service_zone=point_value(77.6000, 12.9750, sqlite_mode=db.bind.dialect.name == "sqlite"),
        )
        db.add(company)
        db.flush()

        password_hash = get_password_hash("password123")

        admin = User(
            company_id=company.id,
            email="admin@techcorp.com",
            password_hash=password_hash,
            name="Admin User",
            phone="+91-9876543210",
            role=UserRole.ADMIN,
            status=UserStatus.ACTIVE,
        )
        drivers = [
            User(
                company_id=company.id,
                email="driver1@techcorp.com",
                password_hash=password_hash,
                name="Rajesh Kumar",
                phone="+91-9876543211",
                role=UserRole.DRIVER,
                status=UserStatus.ACTIVE,
            ),
            User(
                company_id=company.id,
                email="driver2@techcorp.com",
                password_hash=password_hash,
                name="Priya Sharma",
                phone="+91-9876543212",
                role=UserRole.DRIVER,
                status=UserStatus.ACTIVE,
            ),
        ]
        employees = [
            User(
                company_id=company.id,
                email="john.doe@techcorp.com",
                password_hash=password_hash,
                name="John Doe",
                phone="+91-9876543220",
                role=UserRole.EMPLOYEE,
                status=UserStatus.ACTIVE,
                home_location=point_value(
                    77.5946,
                    12.9716,
                    sqlite_mode=db.bind.dialect.name == "sqlite",
                ),
                home_address="Koramangala, Bangalore",
                default_destination=point_value(
                    77.6000,
                    12.9800,
                    sqlite_mode=db.bind.dialect.name == "sqlite",
                ),
                default_destination_address="TechCorp Office, Whitefield",
            ),
            User(
                company_id=company.id,
                email="jane.smith@techcorp.com",
                password_hash=password_hash,
                name="Jane Smith",
                phone="+91-9876543221",
                role=UserRole.EMPLOYEE,
                status=UserStatus.ACTIVE,
                home_location=point_value(
                    77.5950,
                    12.9720,
                    sqlite_mode=db.bind.dialect.name == "sqlite",
                ),
                home_address="Koramangala 5th Block, Bangalore",
                default_destination=point_value(
                    77.6000,
                    12.9800,
                    sqlite_mode=db.bind.dialect.name == "sqlite",
                ),
                default_destination_address="TechCorp Office, Whitefield",
            ),
        ]

        db.add(admin)
        for user in drivers + employees:
            db.add(user)
        db.flush()

        vans = [
            Van(
                company_id=company.id,
                driver_id=drivers[0].id,
                license_plate="KA-01-AB-1234",
                capacity=8,
                current_location=point_value(
                    77.5950,
                    12.9700,
                    sqlite_mode=db.bind.dialect.name == "sqlite",
                ),
                current_occupancy=0,
                status=VanStatus.AVAILABLE,
            ),
            Van(
                company_id=company.id,
                driver_id=drivers[1].id,
                license_plate="KA-01-AB-5678",
                capacity=8,
                current_location=point_value(
                    77.6100,
                    12.9400,
                    sqlite_mode=db.bind.dialect.name == "sqlite",
                ),
                current_occupancy=0,
                status=VanStatus.AVAILABLE,
            ),
        ]
        for van in vans:
            db.add(van)

        db.commit()
        print("Seeded demo data.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
