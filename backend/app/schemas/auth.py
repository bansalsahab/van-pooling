"""Authentication schemas."""
import re
from typing import Annotated

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.user import UserRole
from app.schemas.user import UserProfile


# Password complexity requirements
PASSWORD_MIN_LENGTH = 12
PASSWORD_MAX_LENGTH = 128
PASSWORD_PATTERN = re.compile(
    r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?\":{}|<>_\-+=\[\]\\;'/`~]).+$"
)
PASSWORD_REQUIREMENTS = (
    f"Password must be {PASSWORD_MIN_LENGTH}-{PASSWORD_MAX_LENGTH} characters with at least: "
    "1 uppercase letter, 1 lowercase letter, 1 digit, and 1 special character"
)


def validate_password_strength(password: str) -> str:
    """Validate password meets complexity requirements."""
    if len(password) < PASSWORD_MIN_LENGTH:
        raise ValueError(PASSWORD_REQUIREMENTS)
    if len(password) > PASSWORD_MAX_LENGTH:
        raise ValueError(PASSWORD_REQUIREMENTS)
    if not PASSWORD_PATTERN.match(password):
        raise ValueError(PASSWORD_REQUIREMENTS)
    return password


# Annotated type for validated passwords
StrongPassword = Annotated[
    str,
    Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH),
]


class LoginRequest(BaseModel):
    """Credentials for email/password login."""

    email: EmailStr
    password: str = Field(min_length=1, max_length=128)  # Less strict for login
    requested_role: UserRole | None = None


class RegisterRequest(BaseModel):
    """Self-serve bootstrap or employee registration."""

    name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    password: StrongPassword
    phone: str | None = Field(default=None, max_length=20)
    company_domain: str = Field(min_length=3, max_length=255)
    company_name: str | None = Field(default=None, max_length=255)
    requested_role: UserRole | None = None
    requested_admin_scope: str | None = Field(default=None, max_length=32)

    @field_validator("password")
    @classmethod
    def check_password_strength(cls, v: str) -> str:
        return validate_password_strength(v)


class TokenResponse(BaseModel):
    """Authentication response."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserProfile
