"""Authentication schemas."""
from pydantic import BaseModel, EmailStr, Field

from app.models.user import UserRole
from app.schemas.user import UserProfile


class LoginRequest(BaseModel):
    """Credentials for email/password login."""

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    requested_role: UserRole | None = None


class RegisterRequest(BaseModel):
    """Self-serve bootstrap or employee registration."""

    name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    phone: str | None = Field(default=None, max_length=20)
    company_domain: str = Field(min_length=3, max_length=255)
    company_name: str | None = Field(default=None, max_length=255)
    requested_role: UserRole | None = None


class TokenResponse(BaseModel):
    """Authentication response."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserProfile
