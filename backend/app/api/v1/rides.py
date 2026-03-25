"""Employee ride request routes."""
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.database import get_db
from app.models.user import User, UserRole
from app.schemas.ride_request import RideRequestCreate, RideRequestSummary
from app.services.ride_service import (
    cancel_ride_request,
    create_ride_request,
    get_active_ride,
    list_user_rides,
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
