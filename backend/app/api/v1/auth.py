"""Authentication routes."""
from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from app.schemas.enterprise_auth import (
    EnterpriseSSOStartRequest,
    EnterpriseSSOStartResponse,
    SCIMSyncHookRequest,
    SCIMSyncHookResponse,
)
from app.schemas.user import UserProfile
from app.services.auth_service import login_user, register_user, serialize_user
from app.services.enterprise_auth_service import process_scim_sync_hook, start_enterprise_sso

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Register a user or bootstrap a new tenant admin."""
    return register_user(db, payload)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Login with an email and password."""
    return login_user(db, payload)


@router.get("/me", response_model=UserProfile)
def me(current_user: User = Depends(get_current_user)) -> UserProfile:
    """Return the current authenticated user."""
    return serialize_user(current_user)


@router.post("/enterprise/sso/start", response_model=EnterpriseSSOStartResponse)
def enterprise_sso_start(
    payload: EnterpriseSSOStartRequest,
    db: Session = Depends(get_db),
) -> EnterpriseSSOStartResponse:
    """Start enterprise SSO by returning the configured IdP redirect URL."""
    return start_enterprise_sso(db, payload)


@router.post("/enterprise/scim/sync", response_model=SCIMSyncHookResponse)
def enterprise_scim_sync(
    payload: SCIMSyncHookRequest,
    x_scim_token: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> SCIMSyncHookResponse:
    """Process SCIM-compatible provisioning hooks for enterprise tenants."""
    bearer_token = None
    if authorization and authorization.lower().startswith("bearer "):
        bearer_token = authorization[7:].strip()
    token = x_scim_token or bearer_token
    return process_scim_sync_hook(db, payload, scim_token=token)
