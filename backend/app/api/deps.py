"""Reusable API dependencies."""
import uuid

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rbac import (
    AdminPermission,
    admin_scope_permissions,
    admin_scope_value,
    normalize_permission_keys,
)
from app.core.security import decode_token
from app.database import get_db
from app.models.user import User, UserRole


oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")


def _credentials_exception() -> HTTPException:
    """Build a consistent auth failure response."""
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _resolve_user_from_token(db: Session, token: str) -> User:
    """Resolve a user from a provided JWT."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        token_role = payload.get("role")
        token_company_id = payload.get("company_id")
        token_admin_scope = payload.get("admin_scope")
        if user_id is None:
            raise credentials_exception
    except (JWTError, ValueError) as exc:
        raise credentials_exception from exc

    user = db.get(User, uuid.UUID(user_id))
    if user is None:
        raise credentials_exception
    if token_role and user.role.value != token_role:
        raise credentials_exception
    if token_company_id and str(user.company_id) != str(token_company_id):
        raise credentials_exception
    if token_admin_scope and user.role == UserRole.ADMIN:
        if admin_scope_value(user.admin_scope) != str(token_admin_scope):
            raise credentials_exception
    return user


def get_current_user(
    db: Session = Depends(get_db),
    token: str = Depends(oauth2_scheme),
) -> User:
    """Resolve the current authenticated user from a bearer token."""
    return _resolve_user_from_token(db, token)


def get_current_user_from_stream_token(
    access_token: str | None = Query(default=None),
    token: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> User:
    """Resolve the current user for browser APIs that pass auth in the query string."""
    candidate = access_token or token
    if not candidate:
        raise _credentials_exception()
    return _resolve_user_from_token(db, candidate)


def require_roles(*roles: UserRole):
    """Build a dependency that restricts access to specific roles."""

    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this resource.",
            )
        return current_user

    return dependency


def require_admin_permissions(*permissions: str | AdminPermission):
    """Build a dependency that restricts admin actions by permission keys."""

    required_keys = normalize_permission_keys(permissions)

    def dependency(current_user: User = Depends(require_roles(UserRole.ADMIN))) -> User:
        granted = admin_scope_permissions(current_user.admin_scope)
        missing = [key for key in required_keys if key not in granted]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "You do not have the required admin permission for this action. "
                    f"Missing: {', '.join(sorted(missing))}."
                ),
            )
        return current_user

    return dependency
