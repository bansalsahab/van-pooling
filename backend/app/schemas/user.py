"""User schemas."""
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from typing import Literal


AdminScopeValue = Literal["supervisor", "dispatcher", "viewer", "support"]


class UserSummary(BaseModel):
    """Basic user response shape."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company_id: UUID | None = None
    name: str
    email: EmailStr
    phone: str | None = None
    role: str
    admin_scope: AdminScopeValue | None = None
    admin_permissions: list[str] = Field(default_factory=list)
    status: str


class NotificationPreferences(BaseModel):
    """Per-user notification channel preferences."""

    push: bool = True
    sms: bool = False
    email: bool = True


class UserProfile(UserSummary):
    """Authenticated user profile."""

    company_name: str | None = None
    notification_preferences: NotificationPreferences = Field(
        default_factory=NotificationPreferences
    )
    must_reset_password: bool = False
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
    admin_scope: AdminScopeValue | None = None


class AdminUserUpdate(BaseModel):
    """Admin payload for updating tenant users."""

    name: str | None = Field(default=None, min_length=2, max_length=255)
    phone: str | None = Field(default=None, max_length=20)
    role: str | None = None
    status: str | None = None
    admin_scope: AdminScopeValue | None = None


class AdminPasswordResetResponse(BaseModel):
    """Admin response after issuing a temporary password reset."""

    user_id: UUID
    temporary_password: str
    must_reset_password: bool = True
    message: str


class UserProfileUpdate(BaseModel):
    """Payload for a user-managed profile update."""

    name: str | None = Field(default=None, min_length=2, max_length=255)
    phone: str | None = Field(default=None, max_length=20)
    notification_preferences: NotificationPreferences | None = None
    home_address: str | None = None
    home_latitude: float | None = None
    home_longitude: float | None = None
    default_destination_address: str | None = None
    default_destination_latitude: float | None = None
    default_destination_longitude: float | None = None


class UserPasswordChangeRequest(BaseModel):
    """Payload for changing a signed-in user's password."""

    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)
