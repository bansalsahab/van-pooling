"""Admin mutation services."""
import secrets
import string

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
from app.schemas.user import (
    AdminPasswordResetResponse,
    AdminUserCreate,
    AdminUserUpdate,
    UserSummary,
)
from app.schemas.van import AdminVanCreate, VanSummary
from app.services.dashboard_service import serialize_van_summary


def _serialize_user_summary(user: User) -> UserSummary:
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


def _parse_user_role(value: str) -> UserRole:
    try:
        return UserRole(value.lower())
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role must be one of: employee, driver, admin.",
        ) from exc


def _parse_user_status(value: str) -> UserStatus:
    try:
        return UserStatus(value.lower())
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status must be one of: active, inactive, suspended.",
        ) from exc


def _find_company_user(db: Session, company_id, user_id) -> User:
    user = db.scalar(
        select(User).where(
            User.id == user_id,
            User.company_id == company_id,
        )
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found in this company.",
        )
    return user


def _build_temporary_password(length: int = 14) -> str:
    alphabet = string.ascii_letters + string.digits
    password = "".join(secrets.choice(alphabet) for _ in range(length))
    return f"{password}A1!"


def list_company_users(db: Session, company_id) -> list[UserSummary]:
    """Return all tenant users for admin directory views."""
    users = db.scalars(
        select(User)
        .where(User.company_id == company_id)
        .order_by(User.role, User.name)
    ).all()
    return [_serialize_user_summary(user) for user in users]


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
    return [_serialize_user_summary(driver) for driver in drivers]


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

    role = _parse_user_role(payload.role)

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
    return _serialize_user_summary(user)


def update_company_user(
    db: Session,
    company_id,
    user_id,
    payload: AdminUserUpdate,
) -> UserSummary:
    """Update mutable user fields within a tenant."""
    user = _find_company_user(db, company_id, user_id)
    fields = payload.model_fields_set

    if "name" in fields and payload.name is not None:
        user.name = payload.name.strip()
    if "phone" in fields:
        user.phone = payload.phone.strip() if payload.phone else None
    if "status" in fields and payload.status is not None:
        user.status = _parse_user_status(payload.status)

    role = user.role
    if "role" in fields and payload.role is not None:
        role = _parse_user_role(payload.role)
        user.role = role

    if role == UserRole.ADMIN:
        if "admin_scope" in fields:
            user.admin_scope = (
                parse_admin_scope(payload.admin_scope).value
                if payload.admin_scope is not None
                else parse_admin_scope(None).value
            )
        elif user.admin_scope is None:
            user.admin_scope = parse_admin_scope(None).value
    else:
        user.admin_scope = None
        if payload.admin_scope is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="admin_scope can only be set when role is admin.",
            )

    db.add(user)
    db.commit()
    db.refresh(user)
    return _serialize_user_summary(user)


def reset_company_user_password(
    db: Session,
    company_id,
    user_id,
) -> AdminPasswordResetResponse:
    """Reset a tenant user password and require a rotation after sign-in."""
    user = _find_company_user(db, company_id, user_id)
    temporary_password = _build_temporary_password()
    user.password_hash = get_password_hash(temporary_password)
    user.must_reset_password = True
    db.add(user)
    db.commit()
    return AdminPasswordResetResponse(
        user_id=user.id,
        temporary_password=temporary_password,
        must_reset_password=True,
        message="Temporary password issued. User must reset password after login.",
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
