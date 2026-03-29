"""Employee ride request routes."""
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.database import get_db
from app.models.user import User, UserRole
from app.schemas.recurring_schedule import (
    RecurringRideRuleCreate,
    RecurringRideRuleSummary,
    RecurringRideRuleUpdate,
)
from app.schemas.ride_request import RideRequestCreate, RideRequestSummary
from app.services.ride_service import (
    cancel_ride_request,
    create_ride_request,
    get_active_ride,
    list_user_rides,
)
from app.services.recurring_schedule_service import (
    create_user_recurring_rule,
    list_user_recurring_rules,
    update_user_recurring_rule,
)

router = APIRouter(prefix="/rides", tags=["rides"])


@router.post("/request", response_model=RideRequestSummary)
def request_ride(
    payload: RideRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.EMPLOYEE, UserRole.ADMIN)),
) -> RideRequestSummary:
    """Create a new ride request."""
    return create_ride_request(db, current_user, payload)


@router.get("/history", response_model=list[RideRequestSummary])
def ride_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.EMPLOYEE, UserRole.ADMIN)),
) -> list[RideRequestSummary]:
    """Return ride history for the current user."""
    return list_user_rides(db, current_user)


@router.get("/active", response_model=RideRequestSummary | None)
def active_ride(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.EMPLOYEE, UserRole.ADMIN)),
) -> RideRequestSummary | None:
    """Return the current user's active ride, if any."""
    return get_active_ride(db, current_user)


@router.post("/{ride_id}/cancel", response_model=RideRequestSummary)
def cancel_ride(
    ride_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.EMPLOYEE, UserRole.ADMIN)),
) -> RideRequestSummary:
    """Cancel a ride before pickup."""
    return cancel_ride_request(db, ride_id, current_user)


@router.get("/schedules", response_model=list[RecurringRideRuleSummary])
def recurring_schedules(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.EMPLOYEE, UserRole.ADMIN)),
) -> list[RecurringRideRuleSummary]:
    """Return recurring ride schedules for the current user."""
    return list_user_recurring_rules(db, current_user)


@router.post("/schedules", response_model=RecurringRideRuleSummary)
def create_recurring_schedule(
    payload: RecurringRideRuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.EMPLOYEE, UserRole.ADMIN)),
) -> RecurringRideRuleSummary:
    """Create a recurring ride schedule template."""
    return create_user_recurring_rule(db, current_user, payload)


@router.put("/schedules/{rule_id}", response_model=RecurringRideRuleSummary)
def update_recurring_schedule(
    rule_id: UUID,
    payload: RecurringRideRuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.EMPLOYEE, UserRole.ADMIN)),
) -> RecurringRideRuleSummary:
    """Update or pause a recurring ride schedule template."""
    return update_user_recurring_rule(db, current_user, rule_id, payload)
