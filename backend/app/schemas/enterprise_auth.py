"""Enterprise identity and SSO scaffolding schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models.user import UserRole


EnterpriseProvider = Literal["oidc", "saml"]
SCIMProvisioningMode = Literal["manual", "sync_hook"]
SCIMOperation = Literal["create", "update", "deactivate"]
AdminScopeValue = Literal["supervisor", "dispatcher", "viewer", "support"]


class EnterpriseSSOConfig(BaseModel):
    """SSO provider settings for a company."""

    enabled: bool = False
    provider: EnterpriseProvider = "oidc"
    issuer_url: str | None = None
    sso_login_url: str | None = None
    sso_logout_url: str | None = None
    client_id: str | None = None
    audience: str | None = None
    redirect_uri: str | None = None


class EnterpriseSCIMConfig(BaseModel):
    """SCIM/provisioning sync settings for a company."""

    enabled: bool = False
    base_url: str | None = None
    provisioning_mode: SCIMProvisioningMode = "manual"
    bearer_token_hint: str | None = None


class EnterpriseIdentityConfig(BaseModel):
    """Company identity integration configuration."""

    sso: EnterpriseSSOConfig = Field(default_factory=EnterpriseSSOConfig)
    scim: EnterpriseSCIMConfig = Field(default_factory=EnterpriseSCIMConfig)
    updated_at: datetime | None = None
    updated_by_user_id: UUID | None = None


class EnterpriseIdentityConfigUpdate(BaseModel):
    """Admin payload for mutating identity settings."""

    sso: EnterpriseSSOConfig = Field(default_factory=EnterpriseSSOConfig)
    scim: EnterpriseSCIMConfig = Field(default_factory=EnterpriseSCIMConfig)
    scim_bearer_token: str | None = Field(default=None, min_length=10, max_length=255)


class EnterpriseSSOStartRequest(BaseModel):
    """Public SSO kickoff payload from the auth screen."""

    company_domain: str = Field(min_length=3, max_length=255)
    requested_role: UserRole | None = None
    relay_state: str | None = Field(default=None, max_length=255)


class EnterpriseSSOStartResponse(BaseModel):
    """Response returned when enterprise SSO kickoff is requested."""

    company_name: str
    company_domain: str
    configured: bool
    provider: EnterpriseProvider | None = None
    redirect_url: str | None = None
    guidance: str
    relay_state: str | None = None


class SCIMSyncHookRequest(BaseModel):
    """SCIM-compatible lifecycle payload for scaffolded user sync."""

    company_domain: str = Field(min_length=3, max_length=255)
    operation: SCIMOperation
    external_user_id: str = Field(min_length=1, max_length=128)
    email: EmailStr
    name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=20)
    role: UserRole = UserRole.EMPLOYEE
    admin_scope: AdminScopeValue | None = None


class SCIMSyncHookResponse(BaseModel):
    """Result for a SCIM sync hook request."""

    accepted: bool
    operation: SCIMOperation
    message: str
    user_id: UUID | None = None

