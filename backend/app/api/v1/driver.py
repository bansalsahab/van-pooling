"""Driver routes."""
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.database import get_db
from app.geo import point_value
from app.models.ride_request import RideRequestStatus
from app.models.trip import Trip, TripStatus
from app.models.trip_passenger import PassengerStatus, TripPassenger
from app.models.user import User, UserRole
from app.models.van import Van, VanStatus
from app.schemas.common import MessageResponse
from app.schemas.dashboard import DriverDashboardSummary
from app.schemas.trip import DriverTripSummary
from app.schemas.van import DriverLocationUpdate, DriverStatusUpdate
from app.services.dashboard_service import get_driver_dashboard, serialize_driver_trip
from app.services.routing_service import rebuild_trip_route

router = APIRouter(prefix="/driver", tags=["driver"])


def _get_driver_trip_or_404(db: Session, current_user: User, trip_id: UUID) -> Trip:
    """Resolve a trip that belongs to the current driver's van."""
    trip = db.scalar(
        select(Trip)
        .join(Van, Trip.van_id == Van.id)
        .where(
            Trip.id == trip_id,
            Van.driver_id == current_user.id,
        )
    )
    if trip is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found for this driver.",
        )
    return trip


@router.get("/dashboard", response_model=DriverDashboardSummary)
def driver_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DRIVER)),
) -> DriverDashboardSummary:
    """Return the driver's dashboard snapshot."""
    return get_driver_dashboard(db, current_user)


@router.get("/trips/active", response_model=DriverTripSummary | None)
def active_trip(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DRIVER)),
) -> DriverTripSummary | None:
    """Return the active or planned trip for the current driver."""
    van = db.scalar(select(Van).where(Van.driver_id == current_user.id))
    if van is None:
        return None

    trip = db.scalars(
        select(Trip)
        .where(
            Trip.van_id == van.id,
            Trip.status.in_([TripStatus.PLANNED, TripStatus.ACTIVE]),
        )
        .order_by(Trip.created_at.desc())
    ).first()
    if trip is None:
        return None

    return serialize_driver_trip(trip)


@router.post("/location", response_model=MessageResponse)
def update_location(
    payload: DriverLocationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DRIVER)),
) -> MessageResponse:
    """Update the current location for the driver's assigned van."""
    van = db.scalar(select(Van).where(Van.driver_id == current_user.id))
    if van is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No van is assigned to this driver.",
        )

    van.current_location = point_value(
        payload.longitude,
        payload.latitude,
        sqlite_mode=db.bind.dialect.name == "sqlite",
    )
    van.last_location_update = datetime.utcnow()
    db.add(van)
    active_trip = db.scalars(
        select(Trip)
        .where(
            Trip.van_id == van.id,
            Trip.status.in_([TripStatus.PLANNED, TripStatus.ACTIVE]),
        )
        .order_by(Trip.created_at.desc())
    ).first()
    if active_trip is not None:
        rebuild_trip_route(db, active_trip)
        db.add(active_trip)
    db.commit()

    return MessageResponse(message="Driver location updated.")


@router.post("/status", response_model=MessageResponse)
def update_status(
    payload: DriverStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DRIVER)),
) -> MessageResponse:
    """Update the availability state for the driver's assigned van."""
    van = db.scalar(select(Van).where(Van.driver_id == current_user.id))
    if van is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No van is assigned to this driver.",
        )

    try:
        van.status = VanStatus(payload.status.lower())
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status must be one of: available, on_trip, offline, maintenance.",
        ) from exc

    db.add(van)
    db.commit()
    return MessageResponse(message="Driver status updated.")


@router.post("/trips/{trip_id}/start", response_model=MessageResponse)
def start_trip(
    trip_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DRIVER)),
) -> MessageResponse:
    """Mark a planned trip as active."""
    trip = _get_driver_trip_or_404(db, current_user, trip_id)
    trip.status = TripStatus.ACTIVE
    trip.started_at = datetime.utcnow()
    if trip.van:
        trip.van.status = VanStatus.ON_TRIP
        db.add(trip.van)
    rebuild_trip_route(db, trip)
    db.add(trip)
    db.commit()
    return MessageResponse(message="Trip started.")


@router.post("/trips/{trip_id}/pickup/{ride_request_id}", response_model=MessageResponse)
def pickup_passenger(
    trip_id: UUID,
    ride_request_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DRIVER)),
) -> MessageResponse:
    """Mark a passenger as picked up."""
    _get_driver_trip_or_404(db, current_user, trip_id)
    assignment = db.scalar(
        select(TripPassenger).where(
            TripPassenger.trip_id == trip_id,
            TripPassenger.ride_request_id == ride_request_id,
        )
    )
    if assignment is None or assignment.ride_request is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Passenger assignment not found.",
        )

    assignment.status = PassengerStatus.PICKED_UP
    assignment.actual_pickup_time = datetime.utcnow()
    assignment.ride_request.status = RideRequestStatus.PICKED_UP
    assignment.ride_request.actual_pickup_time = assignment.actual_pickup_time

    trip = _get_driver_trip_or_404(db, current_user, trip_id)
    rebuild_trip_route(db, trip)
    db.add(assignment)
    db.add(assignment.ride_request)
    db.add(trip)
    db.commit()
    return MessageResponse(message="Passenger marked as picked up.")


@router.post("/trips/{trip_id}/dropoff/{ride_request_id}", response_model=MessageResponse)
def dropoff_passenger(
    trip_id: UUID,
    ride_request_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DRIVER)),
) -> MessageResponse:
    """Mark a passenger as dropped off and close the trip when finished."""
    trip = _get_driver_trip_or_404(db, current_user, trip_id)
    assignment = db.scalar(
        select(TripPassenger).where(
            TripPassenger.trip_id == trip_id,
            TripPassenger.ride_request_id == ride_request_id,
        )
    )
    if assignment is None or assignment.ride_request is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Passenger assignment not found.",
        )

    assignment.status = PassengerStatus.DROPPED_OFF
    assignment.actual_dropoff_time = datetime.utcnow()
    assignment.ride_request.status = RideRequestStatus.COMPLETED
    assignment.ride_request.actual_dropoff_time = assignment.actual_dropoff_time

    if trip.van is not None:
        trip.van.current_occupancy = max(0, (trip.van.current_occupancy or 0) - 1)
        db.add(trip.van)

    if all(
        passenger.status == PassengerStatus.DROPPED_OFF
        for passenger in trip.trip_passengers
        if passenger.id != assignment.id
    ):
        trip.status = TripStatus.COMPLETED
        trip.completed_at = assignment.actual_dropoff_time
        if trip.van is not None:
            trip.van.status = VanStatus.AVAILABLE
            trip.van.current_occupancy = 0
            db.add(trip.van)
    else:
        rebuild_trip_route(db, trip)

    db.add(assignment)
    db.add(assignment.ride_request)
    db.add(trip)
    db.commit()
    return MessageResponse(message="Passenger marked as dropped off.")


@router.post("/trips/{trip_id}/complete", response_model=MessageResponse)
def complete_trip(
    trip_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DRIVER)),
) -> MessageResponse:
    """Force-complete a trip and release the van."""
    trip = _get_driver_trip_or_404(db, current_user, trip_id)
    trip.status = TripStatus.COMPLETED
    trip.completed_at = datetime.utcnow()
    if trip.van is not None:
        trip.van.status = VanStatus.AVAILABLE
        trip.van.current_occupancy = 0
        db.add(trip.van)
    db.add(trip)
    db.commit()
    return MessageResponse(message="Trip completed.")
