"""Role-permission helpers for enterprise admin scopes."""
from __future__ import annotations

from enum import Enum
from typing import Iterable


class AdminScope(str, Enum):
    """Supported enterprise admin scopes."""

    SUPERVISOR = "supervisor"
    DISPATCHER = "dispatcher"
    VIEWER = "viewer"
    SUPPORT = "support"


class AdminPermission(str, Enum):
    """Fine-grained permission keys for admin capabilities."""

    DASHBOARD_READ = "dashboard:read"
    FLEET_READ = "fleet:read"
    DISPATCH_WRITE = "dispatch:write"
    ALERTS_MANAGE = "alerts:manage"
    POLICY_MANAGE = "policy:manage"
    USERS_MANAGE = "users:manage"
    VANS_MANAGE = "vans:manage"
    AUDIT_EXPORT = "audit:export"
    INCIDENT_READ = "incident:read"
    SSO_MANAGE = "sso:manage"


DEFAULT_ADMIN_SCOPE = AdminScope.SUPERVISOR

_SCOPE_PERMISSION_MATRIX: dict[AdminScope, frozenset[str]] = {
    AdminScope.SUPERVISOR: frozenset({permission.value for permission in AdminPermission}),
    AdminScope.DISPATCHER: frozenset(
        {
            AdminPermission.DASHBOARD_READ.value,
            AdminPermission.FLEET_READ.value,
            AdminPermission.DISPATCH_WRITE.value,
            AdminPermission.ALERTS_MANAGE.value,
            AdminPermission.AUDIT_EXPORT.value,
            AdminPermission.INCIDENT_READ.value,
        }
    ),
    AdminScope.VIEWER: frozenset(
        {
            AdminPermission.DASHBOARD_READ.value,
            AdminPermission.FLEET_READ.value,
            AdminPermission.AUDIT_EXPORT.value,
            AdminPermission.INCIDENT_READ.value,
        }
    ),
    AdminScope.SUPPORT: frozenset(
        {
            AdminPermission.DASHBOARD_READ.value,
            AdminPermission.FLEET_READ.value,
            AdminPermission.ALERTS_MANAGE.value,
            AdminPermission.AUDIT_EXPORT.value,
            AdminPermission.INCIDENT_READ.value,
        }
    ),
}


def parse_admin_scope(scope: str | AdminScope | None) -> AdminScope:
    """Normalize a scope value, defaulting missing values to supervisor."""
    if scope is None:
        return DEFAULT_ADMIN_SCOPE
    if isinstance(scope, AdminScope):
        return scope
    normalized = str(scope).strip().lower()
    if normalized == "":
        return DEFAULT_ADMIN_SCOPE
    return AdminScope(normalized)


def admin_scope_value(scope: str | AdminScope | None) -> str:
    """Return a normalized scope string."""
    return parse_admin_scope(scope).value


def admin_scope_permissions(scope: str | AdminScope | None) -> frozenset[str]:
    """Return granted permission keys for a scope."""
    normalized_scope = parse_admin_scope(scope)
    return _SCOPE_PERMISSION_MATRIX.get(normalized_scope, frozenset())


def admin_scope_permissions_sorted(scope: str | AdminScope | None) -> list[str]:
    """Return a stable sorted permission list for API payloads."""
    return sorted(admin_scope_permissions(scope))


def normalize_permission_keys(
    permissions: Iterable[str | AdminPermission],
) -> list[str]:
    """Normalize mixed permission values into unique ordered keys."""
    keys = [
        item.value if isinstance(item, AdminPermission) else str(item).strip().lower()
        for item in permissions
    ]
    deduped: list[str] = []
    seen: set[str] = set()
    for key in keys:
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(key)
    return deduped

