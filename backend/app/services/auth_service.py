"""Authentication service helpers."""
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

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
    return UserProfile(
        id=user.id,
        company_id=user.company_id,
        name=user.name,
        email=user.email,
        phone=user.phone,
        role=user.role.value,
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


def build_token_response(user: User) -> TokenResponse:
    """Create token payload plus normalized user profile."""
    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user=serialize_user(user),
    )


def login_user(db: Session, payload: LoginRequest) -> TokenResponse:
    """Authenticate and return fresh tokens."""
    user = authenticate_user(db, payload.email, payload.password)
    return build_token_response(user)


def register_user(db: Session, payload: RegisterRequest) -> TokenResponse:
    """Register a user, creating a company when bootstrapping a tenant."""
    existing_user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists.",
        )

    company = db.scalar(
        select(Company).where(Company.domain == payload.company_domain.lower())
    )
    role = UserRole.EMPLOYEE

    if company is None and payload.company_name:
        company = Company(
            name=payload.company_name,
            domain=payload.company_domain.lower(),
        )
        db.add(company)
        db.flush()
        role = UserRole.ADMIN
    elif company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found. Provide company_name to bootstrap a new tenant.",
        )

    user = User(
        company_id=company.id,
        email=payload.email.lower(),
        password_hash=get_password_hash(payload.password),
        name=payload.name,
        phone=payload.phone,
        role=role,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.refresh(company)
    return build_token_response(user)
