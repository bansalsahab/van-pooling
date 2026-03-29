"""Admin routes."""
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.api.deps import require_admin_permissions
from app.core.rbac import AdminPermission
from app.database import get_db
from app.models.user import User
from app.schemas.admin_ops import OptionalReasonInput, TripReassignInput
from app.schemas.alert import AlertSummary
from app.schemas.audit import AuditExportFormat, AuditExportResponse
from app.schemas.dispatch_event import DispatchEventSummary
from app.schemas.dashboard import AdminDashboardSummary, AdminKPISummary, KPIWindow
from app.schemas.domain_profile import DomainProfilingSnapshot
from app.schemas.enterprise_auth import (
    EnterpriseIdentityConfig,
    EnterpriseIdentityConfigUpdate,
)
from app.schemas.policy import (
    CommutePolicyConfig,
    PolicySimulationRequest,
    PolicySimulationResponse,
)
from app.schemas.ride_request import AdminPendingRideSummary
from app.schemas.sla import IncidentTimelineItem, SLASnapshotSummary
from app.schemas.service_zone import (
    ServiceZoneCreate,
    ServiceZoneSummary,
    ServiceZoneUpdate,
)
from app.schemas.trip import TripSummary
from app.schemas.user import (
    AdminPasswordResetResponse,
    AdminUserCreate,
    AdminUserUpdate,
    UserSummary,
)
from app.schemas.van import AdminVanCreate, VanSummary
from app.services.admin_service import (
    create_company_user,
    create_company_van,
    list_company_drivers,
    list_company_users,
    reset_company_user_password,
    update_company_user,
)
from app.services.audit_service import (
    build_company_audit_export,
    list_trip_dispatch_events,
    render_audit_csv,
)
from app.services.dispatch_ops_service import cancel_trip_by_admin, reassign_trip_van
from app.services.dashboard_service import (
    get_admin_dashboard,
    get_admin_kpis,
    list_company_employees,
    list_company_trips,
    list_company_vans,
)
from app.services.notification_service import list_admin_alerts, resolve_admin_alert
from app.services.enterprise_auth_service import (
    get_company_identity_config,
    update_company_identity_config,
)
from app.services.domain_profile_service import snapshot_domain_profiles
from app.services.policy_service import (
    get_company_policy,
    simulate_company_policy,
    update_company_policy,
)
from app.services.service_zone_service import (
    create_company_service_zone,
    list_company_service_zones,
    update_company_service_zone,
)
from app.services.ride_service import list_company_pending_requests
from app.services.sla_service import collect_company_sla_snapshot, list_admin_incidents

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/dashboard", response_model=AdminDashboardSummary)
def dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_admin_permissions(AdminPermission.DASHBOARD_READ)
    ),
) -> AdminDashboardSummary:
    """Return admin dashboard metrics."""
    return get_admin_dashboard(db, current_user.company_id, current_user.id)


@router.get("/sla", response_model=SLASnapshotSummary)
def sla_snapshot(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_admin_permissions(AdminPermission.DASHBOARD_READ)
    ),
) -> SLASnapshotSummary:
    """Return current SLA monitoring snapshot for the admin's company."""
    return collect_company_sla_snapshot(db, current_user.company_id)


@router.get("/incidents", response_model=list[IncidentTimelineItem])
def incidents(
    include_resolved: bool = True,
    limit: int = 60,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_admin_permissions(AdminPermission.INCIDENT_READ)
    ),
) -> list[IncidentTimelineItem]:
    """Return incident timeline items for the admin."""
    return list_admin_incidents(
        db,
        current_user,
        include_resolved=include_resolved,
        limit=limit,
    )


@router.get("/policy", response_model=CommutePolicyConfig)
def policy_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_admin_permissions(AdminPermission.DASHBOARD_READ)
    ),
) -> CommutePolicyConfig:
    """Return policy configuration for the admin's company."""
    return get_company_policy(db, current_user.company_id)


@router.put("/policy", response_model=CommutePolicyConfig)
def update_policy_config(
    payload: CommutePolicyConfig,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_admin_permissions(AdminPermission.POLICY_MANAGE)
    ),
) -> CommutePolicyConfig:
    """Update policy configuration for the admin's company."""
    return update_company_policy(
        db,
        current_user.company_id,
        payload,
        actor_user_id=current_user.id,
    )


@router.post("/policy/simulate", response_model=PolicySimulationResponse)
def simulate_policy_config(
    payload: PolicySimulationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_admin_permissions(AdminPermission.POLICY_MANAGE)
    ),
) -> PolicySimulationResponse:
    """Simulate policy evaluation for a sample ride request."""
    return simulate_company_policy(db, current_user.company_id, payload)


@router.get("/kpis", response_model=AdminKPISummary)
def kpis(
    window: KPIWindow = Query(default=KPIWindow.TODAY),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_admin_permissions(AdminPermission.DASHBOARD_READ)
    ),
) -> AdminKPISummary:
    """Return baseline KPI snapshot for the admin's company."""
    return get_admin_kpis(db, current_user.company_id, window=window)


@router.get("/profiling", response_model=DomainProfilingSnapshot)
def profiling_snapshot(
    current_user: User = Depends(
        require_admin_permissions(AdminPermission.DASHBOARD_READ)
    ),
) -> DomainProfilingSnapshot:
    """Return runtime request profiling across employee, driver, and admin domains."""
    _ = current_user
    return snapshot_domain_profiles()


@router.get("/vans", response_model=list[VanSummary])
def vans(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_permissions(AdminPermission.FLEET_READ)),
) -> list[VanSummary]:
    """Return fleet status for the admin's company."""
    return list_company_vans(db, current_user.company_id)


@router.get("/employees", response_model=list[UserSummary])
def employees(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_permissions(AdminPermission.FLEET_READ)),
) -> list[UserSummary]:
    """Return employees for the admin's company."""
    return list_company_employees(db, current_user.company_id)


@router.get("/drivers", response_model=list[UserSummary])
def drivers(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_permissions(AdminPermission.FLEET_READ)),
) -> list[UserSummary]:
    """Return drivers for the admin's company."""
    return list_company_drivers(db, current_user.company_id)


@router.get("/users", response_model=list[UserSummary])
def users(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_admin_permissions(AdminPermission.DASHBOARD_READ)
    ),
) -> list[UserSummary]:
    """Return all tenant users for the admin directory."""
    return list_company_users(db, current_user.company_id)


@router.get("/zones", response_model=list[ServiceZoneSummary])
def zones(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_admin_permissions(AdminPermission.DASHBOARD_READ)
    ),
) -> list[ServiceZoneSummary]:
    """Return service-zone polygons for the admin's company."""
    return list_company_service_zones(db, current_user.company_id)


@router.get("/trips", response_model=list[TripSummary])
def trips(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_permissions(AdminPermission.FLEET_READ)),
) -> list[TripSummary]:
    """Return trips for the admin's company."""
    return list_company_trips(db, current_user.company_id)


@router.get("/requests", response_model=list[AdminPendingRideSummary])
def pending_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_permissions(AdminPermission.FLEET_READ)),
) -> list[AdminPendingRideSummary]:
    """Return dispatch-board ride requests for the admin's company."""
    return list_company_pending_requests(db, current_user.company_id)


@router.get("/trips/{trip_id}/events", response_model=list[DispatchEventSummary])
def trip_events(
    trip_id: UUID,
    limit: int = 40,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_permissions(AdminPermission.FLEET_READ)),
) -> list[DispatchEventSummary]:
    """Return persisted dispatch history for a specific trip."""
    return list_trip_dispatch_events(
        db,
        current_user.company_id,
        trip_id,
        limit=limit,
    )


@router.get("/alerts", response_model=list[AlertSummary])
def alerts(
    include_resolved: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_permissions(AdminPermission.FLEET_READ)),
) -> list[AlertSummary]:
    """Return operational alerts for the signed-in admin."""
    return list_admin_alerts(db, current_user, include_resolved=include_resolved)


@router.post("/alerts/{alert_id}/resolve", response_model=AlertSummary)
def resolve_alert(
    alert_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_admin_permissions(AdminPermission.ALERTS_MANAGE)
    ),
) -> AlertSummary:
    """Resolve an operational alert."""
    return resolve_admin_alert(db, alert_id, current_user)


@router.post("/trips/{trip_id}/reassign", response_model=TripSummary)
def reassign_trip(
    trip_id: UUID,
    payload: TripReassignInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_admin_permissions(AdminPermission.DISPATCH_WRITE)
    ),
) -> TripSummary:
    """Move a trip to another van."""
    return reassign_trip_van(
        db,
        current_user,
        trip_id=trip_id,
        target_van_id=payload.van_id,
        reason=payload.reason,
    )


@router.post("/trips/{trip_id}/cancel", response_model=TripSummary)
def cancel_trip(
    trip_id: UUID,
    payload: OptionalReasonInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_admin_permissions(AdminPermission.DISPATCH_WRITE)
    ),
) -> TripSummary:
    """Cancel a trip before riders are onboard."""
    return cancel_trip_by_admin(
        db,
        current_user,
        trip_id=trip_id,
        reason=payload.reason,
    )


@router.post("/users", response_model=UserSummary)
def create_user(
    payload: AdminUserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_admin_permissions(AdminPermission.USERS_MANAGE)
    ),
) -> UserSummary:
    """Create a user for the admin's company."""
    return create_company_user(db, current_user.company_id, payload)


@router.put("/users/{user_id}", response_model=UserSummary)
def update_user(
    user_id: UUID,
    payload: AdminUserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_admin_permissions(AdminPermission.USERS_MANAGE)
    ),
) -> UserSummary:
    """Update a user in the admin's company directory."""
    return update_company_user(db, current_user.company_id, user_id, payload)


@router.post("/users/{user_id}/reset-password", response_model=AdminPasswordResetResponse)
def reset_user_password(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_admin_permissions(AdminPermission.USERS_MANAGE)
    ),
) -> AdminPasswordResetResponse:
    """Issue a temporary password and enforce a post-login password reset."""
    return reset_company_user_password(db, current_user.company_id, user_id)


@router.post("/zones", response_model=ServiceZoneSummary)
def create_zone(
    payload: ServiceZoneCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_admin_permissions(AdminPermission.POLICY_MANAGE)
    ),
) -> ServiceZoneSummary:
    """Create a service-zone polygon."""
    return create_company_service_zone(db, current_user.company_id, payload)


@router.put("/zones/{zone_id}", response_model=ServiceZoneSummary)
def update_zone(
    zone_id: UUID,
    payload: ServiceZoneUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_admin_permissions(AdminPermission.POLICY_MANAGE)
    ),
) -> ServiceZoneSummary:
    """Update a service-zone polygon."""
    return update_company_service_zone(db, current_user.company_id, zone_id, payload)


@router.post("/vans", response_model=VanSummary)
def create_van(
    payload: AdminVanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_admin_permissions(AdminPermission.VANS_MANAGE)
    ),
) -> VanSummary:
    """Create a van for the admin's company."""
    return create_company_van(db, current_user.company_id, payload)


@router.get("/audit/export", response_model=AuditExportResponse)
def export_audit(
    format: AuditExportFormat = Query(default=AuditExportFormat.JSON),
    limit: int = Query(default=500, ge=1, le=5000),
    include_alerts: bool = Query(default=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_admin_permissions(AdminPermission.AUDIT_EXPORT)
    ),
) -> AuditExportResponse | Response:
    """Export signed tenant-scoped operational audit records."""
    payload = build_company_audit_export(
        db,
        current_user.company_id,
        limit=limit,
        include_alerts=include_alerts,
    )
    if format == AuditExportFormat.JSON:
        return payload
    csv_content = render_audit_csv(payload.records)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="audit-export.csv"',
            "X-Audit-Signature": payload.signature,
            "X-Audit-Signature-Algorithm": payload.signature_algorithm,
        },
    )


@router.get("/identity/config", response_model=EnterpriseIdentityConfig)
def identity_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_admin_permissions(AdminPermission.SSO_MANAGE)
    ),
) -> EnterpriseIdentityConfig:
    """Return enterprise identity integration settings for this tenant."""
    return get_company_identity_config(db, current_user.company_id)


@router.put("/identity/config", response_model=EnterpriseIdentityConfig)
def update_identity_config(
    payload: EnterpriseIdentityConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_admin_permissions(AdminPermission.SSO_MANAGE)
    ),
) -> EnterpriseIdentityConfig:
    """Update enterprise identity integration settings for this tenant."""
    return update_company_identity_config(
        db,
        current_user.company_id,
        payload,
        actor_user_id=current_user.id,
    )
