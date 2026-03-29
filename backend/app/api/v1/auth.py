"""Authentication routes."""
from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.common import MessageResponse
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from app.schemas.enterprise_auth import (
    EnterpriseSSOStartRequest,
    EnterpriseSSOStartResponse,
    SCIMSyncHookRequest,
    SCIMSyncHookResponse,
)
from app.schemas.user import UserPasswordChangeRequest, UserProfile, UserProfileUpdate
from app.services.auth_service import (
    change_user_password,
    login_user,
    register_user,
    serialize_user,
    update_user_profile,
)
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


@router.put("/me", response_model=UserProfile)
def update_me(
    payload: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserProfile:
    """Update profile settings for the signed-in user."""
    return update_user_profile(db, current_user, payload)


@router.post("/me/password", response_model=MessageResponse)
def change_my_password(
    payload: UserPasswordChangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageResponse:
    """Change password for the signed-in user."""
    change_user_password(db, current_user, payload)
    return MessageResponse(message="Password updated.")


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
