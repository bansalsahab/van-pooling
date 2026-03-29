"""Authentication service helpers."""
from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.rbac import (
    admin_scope_permissions_sorted,
    admin_scope_value,
    parse_admin_scope,
)
from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_password_hash,
    verify_password,
)
from app.geo import parse_point
from app.models.company import Company
from app.models.user import User, UserRole, UserStatus
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from app.schemas.user import UserProfile


def serialize_user(user: User) -> UserProfile:
    """Convert a user model into a response-friendly profile."""
    home_coordinates = parse_point(user.home_location)
    destination_coordinates = parse_point(user.default_destination)
    admin_scope = None
    admin_permissions: list[str] = []
    if user.role == UserRole.ADMIN:
        admin_scope = admin_scope_value(user.admin_scope)
        admin_permissions = admin_scope_permissions_sorted(admin_scope)
    return UserProfile(
        id=user.id,
        company_id=user.company_id,
        name=user.name,
        email=user.email,
        phone=user.phone,
        role=user.role.value,
        admin_scope=admin_scope,
        admin_permissions=admin_permissions,
        status=user.status.value,
        company_name=user.company.name if user.company else None,
        home_address=user.home_address,
        home_latitude=home_coordinates[0] if home_coordinates else None,
        home_longitude=home_coordinates[1] if home_coordinates else None,
        default_destination_address=user.default_destination_address,
        default_destination_latitude=(
            destination_coordinates[0] if destination_coordinates else None
        ),
        default_destination_longitude=(
            destination_coordinates[1] if destination_coordinates else None
        ),
    )


def authenticate_user(db: Session, email: str, password: str) -> User:
    """Validate login credentials and return the user."""
    user = db.scalar(select(User).where(User.email == email.lower()))
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is not active.",
        )
    return user


def _ensure_requested_role(user: User, requested_role: UserRole | None) -> None:
    """Reject logins routed through the wrong portal role."""
    if requested_role is None or user.role == requested_role:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=(
            f"This account is registered as {user.role.value}. "
            f"Use the {user.role.value} portal to sign in."
        ),
    )


def build_token_response(user: User) -> TokenResponse:
    """Create token payload plus normalized user profile."""
    claims = {
        "role": user.role.value,
        "company_id": str(user.company_id) if user.company_id else None,
    }
    if user.role == UserRole.ADMIN:
        claims["admin_scope"] = admin_scope_value(user.admin_scope)
    return TokenResponse(
        access_token=create_access_token(user.id, extra_claims=claims),
        refresh_token=create_refresh_token(user.id, extra_claims=claims),
        user=serialize_user(user),
    )


def login_user(db: Session, payload: LoginRequest) -> TokenResponse:
    """Authenticate and return fresh tokens."""
    user = authenticate_user(db, payload.email, payload.password)
    _ensure_requested_role(user, payload.requested_role)
    return build_token_response(user)


def register_user(db: Session, payload: RegisterRequest) -> TokenResponse:
    """Register a user, creating a company when bootstrapping a tenant."""
    requested_role = payload.requested_role or UserRole.EMPLOYEE
    existing_user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists.",
        )

    company = db.scalar(
        select(Company).where(Company.domain == payload.company_domain.lower())
    )
    if requested_role == UserRole.DRIVER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Driver accounts are created by admins. Use the driver portal only to sign in.",
        )

    if requested_role == UserRole.ADMIN:
        if company is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin accounts for an existing company must be created by another admin.",
            )
        if not payload.company_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Provide company_name to bootstrap a new admin workspace.",
            )
        company = Company(
            name=payload.company_name,
            domain=payload.company_domain.lower(),
        )
        db.add(company)
        db.flush()
        role = UserRole.ADMIN
        try:
            admin_scope = parse_admin_scope(payload.requested_admin_scope).value
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="requested_admin_scope must be one of: supervisor, dispatcher, viewer, support.",
            ) from exc
    elif company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found. Provide company_name to bootstrap a new tenant.",
        )
    else:
        role = UserRole.EMPLOYEE
        admin_scope = None

    user = User(
        company_id=company.id,
        email=payload.email.lower(),
        password_hash=get_password_hash(payload.password),
        name=payload.name,
        phone=payload.phone,
        role=role,
        admin_scope=admin_scope,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.refresh(company)
    return build_token_response(user)
