"""User schemas."""
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserSummary(BaseModel):
    """Basic user response shape."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company_id: UUID | None = None
    name: str
    email: EmailStr
    phone: str | None = None
    role: str
    status: str


class UserProfile(UserSummary):
    """Authenticated user profile."""

    company_name: str | None = None
    home_address: str | None = None
    home_latitude: float | None = None
    home_longitude: float | None = None
    default_destination_address: str | None = None
    default_destination_latitude: float | None = None
    default_destination_longitude: float | None = None


class AdminUserCreate(BaseModel):
    """Admin payload for creating a company user."""

    name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    phone: str | None = Field(default=None, max_length=20)
    role: str
