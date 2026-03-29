"""Admin mutation services."""
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.rbac import (
    admin_scope_permissions_sorted,
    admin_scope_value,
    parse_admin_scope,
)
from app.core.security import get_password_hash
from app.models.user import User, UserRole, UserStatus
from app.models.van import Van, VanStatus
from app.schemas.user import AdminUserCreate, UserSummary
from app.schemas.van import AdminVanCreate, VanSummary
from app.services.dashboard_service import serialize_van_summary


def list_company_drivers(db: Session, company_id) -> list[UserSummary]:
    """Return drivers for a company."""
    drivers = db.scalars(
        select(User)
        .where(
            User.company_id == company_id,
            User.role == UserRole.DRIVER,
        )
        .order_by(User.name)
    ).all()
    return [
        UserSummary(
            id=driver.id,
            company_id=driver.company_id,
            name=driver.name,
            email=driver.email,
            phone=driver.phone,
            role=driver.role.value,
            admin_scope=None,
            admin_permissions=[],
            status=driver.status.value,
        )
        for driver in drivers
    ]


def create_company_user(
    db: Session,
    company_id,
    payload: AdminUserCreate,
) -> UserSummary:
    """Create a new employee or driver for the admin's company."""
    existing_user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists.",
        )

    try:
        role = UserRole(payload.role.lower())
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role must be one of: employee, driver, admin.",
        ) from exc

    admin_scope: str | None = None
    if role == UserRole.ADMIN:
        try:
            admin_scope = parse_admin_scope(payload.admin_scope).value
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="admin_scope must be one of: supervisor, dispatcher, viewer, support.",
            ) from exc
    elif payload.admin_scope is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="admin_scope can only be set when role is admin.",
        )

    user = User(
        company_id=company_id,
        name=payload.name,
        email=payload.email.lower(),
        password_hash=get_password_hash(payload.password),
        phone=payload.phone,
        role=role,
        admin_scope=admin_scope,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    summary_scope = admin_scope_value(user.admin_scope) if user.role == UserRole.ADMIN else None
    summary_permissions = (
        admin_scope_permissions_sorted(summary_scope) if summary_scope is not None else []
    )
    return UserSummary(
        id=user.id,
        company_id=user.company_id,
        name=user.name,
        email=user.email,
        phone=user.phone,
        role=user.role.value,
        admin_scope=summary_scope,
        admin_permissions=summary_permissions,
        status=user.status.value,
    )


def create_company_van(
    db: Session,
    company_id,
    payload: AdminVanCreate,
) -> VanSummary:
    """Create a new van and optionally assign a driver."""
    existing_van = db.scalar(
        select(Van).where(Van.license_plate == payload.license_plate.upper())
    )
    if existing_van is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A van with this license plate already exists.",
        )

    driver = None
    if payload.driver_id is not None:
        driver = db.scalar(
            select(User).where(
                User.id == payload.driver_id,
                User.company_id == company_id,
                User.role == UserRole.DRIVER,
            )
        )
        if driver is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Driver not found in this company.",
            )

    try:
        van_status = VanStatus(payload.status.lower())
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status must be one of: available, on_trip, offline, maintenance.",
        ) from exc

    van = Van(
        company_id=company_id,
        driver_id=driver.id if driver else None,
        license_plate=payload.license_plate.upper(),
        capacity=payload.capacity,
        current_occupancy=0,
        status=van_status,
    )
    db.add(van)
    db.commit()
    db.refresh(van)

    return serialize_van_summary(van, driver.name if driver else None)
