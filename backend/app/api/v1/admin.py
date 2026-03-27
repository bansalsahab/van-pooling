"""Admin routes."""
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.database import get_db
from app.models.user import User, UserRole
from app.schemas.admin_ops import OptionalReasonInput, TripReassignInput
from app.schemas.alert import AlertSummary
from app.schemas.dispatch_event import DispatchEventSummary
from app.schemas.dashboard import AdminDashboardSummary
from app.schemas.ride_request import AdminPendingRideSummary
from app.schemas.trip import TripSummary
from app.schemas.user import AdminUserCreate, UserSummary
from app.schemas.van import AdminVanCreate, VanSummary
from app.services.admin_service import (
    create_company_user,
    create_company_van,
    list_company_drivers,
)
from app.services.audit_service import list_trip_dispatch_events
from app.services.dispatch_ops_service import cancel_trip_by_admin, reassign_trip_van
from app.services.dashboard_service import (
    get_admin_dashboard,
    list_company_employees,
    list_company_trips,
    list_company_vans,
)
from app.services.notification_service import list_admin_alerts, resolve_admin_alert
from app.services.ride_service import list_company_pending_requests

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/dashboard", response_model=AdminDashboardSummary)
def dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> AdminDashboardSummary:
    """Return admin dashboard metrics."""
    return get_admin_dashboard(db, current_user.company_id, current_user.id)


@router.get("/vans", response_model=list[VanSummary])
def vans(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> list[VanSummary]:
    """Return fleet status for the admin's company."""
    return list_company_vans(db, current_user.company_id)


@router.get("/employees", response_model=list[UserSummary])
def employees(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> list[UserSummary]:
    """Return employees for the admin's company."""
    return list_company_employees(db, current_user.company_id)


@router.get("/drivers", response_model=list[UserSummary])
def drivers(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> list[UserSummary]:
    """Return drivers for the admin's company."""
    return list_company_drivers(db, current_user.company_id)


@router.get("/trips", response_model=list[TripSummary])
def trips(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> list[TripSummary]:
    """Return trips for the admin's company."""
    return list_company_trips(db, current_user.company_id)


@router.get("/requests", response_model=list[AdminPendingRideSummary])
def pending_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> list[AdminPendingRideSummary]:
    """Return dispatch-board ride requests for the admin's company."""
    return list_company_pending_requests(db, current_user.company_id)


@router.get("/trips/{trip_id}/events", response_model=list[DispatchEventSummary])
def trip_events(
    trip_id: UUID,
    limit: int = 40,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
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
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> list[AlertSummary]:
    """Return operational alerts for the signed-in admin."""
    return list_admin_alerts(db, current_user, include_resolved=include_resolved)


@router.post("/alerts/{alert_id}/resolve", response_model=AlertSummary)
def resolve_alert(
    alert_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> AlertSummary:
    """Resolve an operational alert."""
    return resolve_admin_alert(db, alert_id, current_user)


@router.post("/trips/{trip_id}/reassign", response_model=TripSummary)
def reassign_trip(
    trip_id: UUID,
    payload: TripReassignInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
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
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
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
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> UserSummary:
    """Create a user for the admin's company."""
    return create_company_user(db, current_user.company_id, payload)


@router.post("/vans", response_model=VanSummary)
def create_van(
    payload: AdminVanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> VanSummary:
    """Create a van for the admin's company."""
    return create_company_van(db, current_user.company_id, payload)
