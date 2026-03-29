"""Enterprise identity, SSO, and SCIM scaffolding services."""
from __future__ import annotations

from datetime import datetime
import hashlib
import secrets
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.rbac import parse_admin_scope
from app.core.security import get_password_hash
from app.models.company import Company
from app.models.user import User, UserRole, UserStatus
from app.schemas.enterprise_auth import (
    EnterpriseIdentityConfig,
    EnterpriseIdentityConfigUpdate,
    EnterpriseSSOStartRequest,
    EnterpriseSSOStartResponse,
    SCIMSyncHookRequest,
    SCIMSyncHookResponse,
)
from app.services.audit_service import record_dispatch_event


def get_company_identity_config(
    db: Session,
    company_id,
) -> EnterpriseIdentityConfig:
    """Return identity integration settings for the company."""
    company = db.get(Company, company_id)
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found.",
        )
    return _public_identity_config(company.identity_config)


def update_company_identity_config(
    db: Session,
    company_id,
    payload: EnterpriseIdentityConfigUpdate,
    *,
    actor_user_id,
) -> EnterpriseIdentityConfig:
    """Persist identity settings for enterprise integrations."""
    company = db.get(Company, company_id)
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found.",
        )

    previous = _raw_identity_config(company.identity_config)
    existing_scim_hash = previous.get("scim_token_hash")
    existing_scim_hint = previous.get("scim_token_hint")

    scim_token_hash = existing_scim_hash
    scim_token_hint = existing_scim_hint
    if payload.scim_bearer_token:
        normalized_token = payload.scim_bearer_token.strip()
        scim_token_hash = _hash_scim_token(normalized_token)
        scim_token_hint = f"***{normalized_token[-4:]}"
    elif not payload.scim.enabled:
        scim_token_hash = None
        scim_token_hint = None

    updated_at = datetime.utcnow().isoformat()
    identity_config = {
        "sso": payload.sso.model_dump(),
        "scim": {
            **payload.scim.model_dump(exclude={"bearer_token_hint"}),
            "bearer_token_hint": scim_token_hint,
        },
        "scim_token_hash": scim_token_hash,
        "scim_token_hint": scim_token_hint,
        "updated_at": updated_at,
        "updated_by_user_id": str(actor_user_id),
    }
    company.identity_config = identity_config
    db.add(company)
    record_dispatch_event(
        db,
        company_id=company.id,
        actor_type="admin",
        actor_user_id=actor_user_id,
        event_type="identity.config_updated",
        metadata={
            "sso_enabled": payload.sso.enabled,
            "scim_enabled": payload.scim.enabled,
            "scim_token_configured": bool(scim_token_hash),
        },
    )
    db.commit()
    db.refresh(company)
    return _public_identity_config(company.identity_config)


def start_enterprise_sso(
    db: Session,
    payload: EnterpriseSSOStartRequest,
) -> EnterpriseSSOStartResponse:
    """Build an enterprise SSO kickoff response for the auth screen."""
    domain = payload.company_domain.strip().lower()
    company = db.scalar(select(Company).where(Company.domain == domain))
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No company workspace found for this domain.",
        )

    config = _public_identity_config(company.identity_config)
    if not config.sso.enabled:
        return EnterpriseSSOStartResponse(
            company_name=company.name,
            company_domain=company.domain,
            configured=False,
            provider=config.sso.provider,
            guidance="Enterprise SSO is not enabled for this workspace. Use email/password sign in.",
            relay_state=payload.relay_state,
        )

    login_url = config.sso.sso_login_url or config.sso.issuer_url
    if not login_url:
        return EnterpriseSSOStartResponse(
            company_name=company.name,
            company_domain=company.domain,
            configured=False,
            provider=config.sso.provider,
            guidance="SSO is enabled but login URL is missing. Contact your workspace admin.",
            relay_state=payload.relay_state,
        )

    redirect_url = _build_sso_redirect_url(
        login_url=login_url,
        provider=config.sso.provider,
        client_id=config.sso.client_id,
        redirect_uri=config.sso.redirect_uri,
        relay_state=payload.relay_state,
    )
    return EnterpriseSSOStartResponse(
        company_name=company.name,
        company_domain=company.domain,
        configured=True,
        provider=config.sso.provider,
        redirect_url=redirect_url,
        guidance="Redirect user to enterprise identity provider to continue login.",
        relay_state=payload.relay_state,
    )


def process_scim_sync_hook(
    db: Session,
    payload: SCIMSyncHookRequest,
    *,
    scim_token: str | None,
) -> SCIMSyncHookResponse:
    """Handle scaffolded SCIM-like user lifecycle sync hooks."""
    domain = payload.company_domain.strip().lower()
    company = db.scalar(select(Company).where(Company.domain == domain))
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No company workspace found for this domain.",
        )

    raw_identity = _raw_identity_config(company.identity_config)
    scim_config = raw_identity.get("scim", {})
    if not isinstance(scim_config, dict) or not scim_config.get("enabled"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="SCIM sync is not enabled for this workspace.",
        )

    expected_hash = raw_identity.get("scim_token_hash")
    if not expected_hash:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SCIM token is not configured for this workspace.",
        )
    if not scim_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing SCIM token.",
        )
    provided_hash = _hash_scim_token(scim_token.strip())
    if not secrets.compare_digest(str(expected_hash), provided_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid SCIM token.",
        )

    user = db.scalar(
        select(User).where(
            User.company_id == company.id,
            User.email == payload.email.lower(),
        )
    )
    operation = payload.operation

    if operation == "deactivate":
        if user is None:
            return SCIMSyncHookResponse(
                accepted=True,
                operation=operation,
                message="No matching user found; nothing to deactivate.",
            )
        user.status = UserStatus.INACTIVE
        db.add(user)
        record_dispatch_event(
            db,
            company_id=company.id,
            actor_type="scim",
            event_type="scim.user_deactivated",
            actor_user_id=None,
            metadata={
                "external_user_id": payload.external_user_id,
                "email": payload.email.lower(),
                "role": user.role.value,
            },
        )
        db.commit()
        db.refresh(user)
        return SCIMSyncHookResponse(
            accepted=True,
            operation=operation,
            message="User deactivated.",
            user_id=user.id,
        )

    admin_scope: str | None = None
    if payload.role == UserRole.ADMIN:
        try:
            admin_scope = parse_admin_scope(payload.admin_scope).value
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="admin_scope must be one of: supervisor, dispatcher, viewer, support.",
            ) from exc

    if user is None:
        user = User(
            company_id=company.id,
            email=payload.email.lower(),
            password_hash=get_password_hash(secrets.token_urlsafe(24)),
            name=payload.name or payload.email.split("@")[0],
            phone=payload.phone,
            role=payload.role,
            admin_scope=admin_scope,
            status=UserStatus.ACTIVE,
        )
        action = "created"
    else:
        user.name = payload.name or user.name
        user.phone = payload.phone
        user.role = payload.role
        user.admin_scope = admin_scope if payload.role == UserRole.ADMIN else None
        user.status = UserStatus.ACTIVE
        action = "updated"

    db.add(user)
    record_dispatch_event(
        db,
        company_id=company.id,
        actor_type="scim",
        event_type=f"scim.user_{action}",
        actor_user_id=None,
        metadata={
            "external_user_id": payload.external_user_id,
            "email": payload.email.lower(),
            "role": payload.role.value,
            "admin_scope": admin_scope,
        },
    )
    db.commit()
    db.refresh(user)
    return SCIMSyncHookResponse(
        accepted=True,
        operation=operation,
        message=f"User {action} via SCIM sync hook.",
        user_id=user.id,
    )


def _public_identity_config(raw_config: dict | None) -> EnterpriseIdentityConfig:
    normalized = _raw_identity_config(raw_config)
    return EnterpriseIdentityConfig.model_validate(
        {
            "sso": normalized["sso"],
            "scim": normalized["scim"],
            "updated_at": normalized.get("updated_at"),
            "updated_by_user_id": normalized.get("updated_by_user_id"),
        }
    )


def _raw_identity_config(raw_config: dict | None) -> dict:
    config = raw_config if isinstance(raw_config, dict) else {}
    sso = config.get("sso") if isinstance(config.get("sso"), dict) else {}
    scim = config.get("scim") if isinstance(config.get("scim"), dict) else {}
    return {
        "sso": {
            "enabled": bool(sso.get("enabled", False)),
            "provider": str(sso.get("provider") or "oidc"),
            "issuer_url": _string_or_none(sso.get("issuer_url")),
            "sso_login_url": _string_or_none(sso.get("sso_login_url")),
            "sso_logout_url": _string_or_none(sso.get("sso_logout_url")),
            "client_id": _string_or_none(sso.get("client_id")),
            "audience": _string_or_none(sso.get("audience")),
            "redirect_uri": _string_or_none(sso.get("redirect_uri")),
        },
        "scim": {
            "enabled": bool(scim.get("enabled", False)),
            "base_url": _string_or_none(scim.get("base_url")),
            "provisioning_mode": str(scim.get("provisioning_mode") or "manual"),
            "bearer_token_hint": _string_or_none(
                scim.get("bearer_token_hint") or config.get("scim_token_hint")
            ),
        },
        "scim_token_hash": _string_or_none(config.get("scim_token_hash")),
        "scim_token_hint": _string_or_none(config.get("scim_token_hint")),
        "updated_at": _string_or_none(config.get("updated_at")),
        "updated_by_user_id": _string_or_none(config.get("updated_by_user_id")),
    }


def _build_sso_redirect_url(
    *,
    login_url: str,
    provider: str,
    client_id: str | None,
    redirect_uri: str | None,
    relay_state: str | None,
) -> str:
    parsed = urlparse(login_url)
    existing = dict(parse_qsl(parsed.query, keep_blank_values=True))
    if provider == "oidc":
        if client_id:
            existing.setdefault("client_id", client_id)
        existing.setdefault("response_type", "code")
        existing.setdefault("scope", "openid profile email")
        if redirect_uri:
            existing.setdefault("redirect_uri", redirect_uri)
        if relay_state:
            existing.setdefault("state", relay_state)
    else:
        if relay_state:
            existing.setdefault("RelayState", relay_state)
    return urlunparse(parsed._replace(query=urlencode(existing)))


def _hash_scim_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _string_or_none(value) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None

