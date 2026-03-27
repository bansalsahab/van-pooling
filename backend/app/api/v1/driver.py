"""Driver routes."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.config import settings
from app.database import get_db
from app.geo import haversine_distance_meters, parse_point, point_value
from app.models.ride_request import RideRequestStatus
from app.models.trip import Trip, TripStatus
from app.models.trip_passenger import PassengerStatus, TripPassenger
from app.models.user import User, UserRole
from app.models.van import Van, VanStatus
from app.schemas.common import MessageResponse
from app.schemas.dashboard import DriverDashboardSummary
from app.schemas.trip import DriverTripSummary
from app.schemas.van import DriverLocationUpdate, DriverStatusUpdate
from app.services.audit_service import record_dispatch_event
from app.services.dispatch_ops_service import mark_passenger_no_show
from app.services.dashboard_service import get_driver_dashboard, serialize_driver_trip
from app.services.lifecycle_service import TRIP_ACTIVE_STATUSES, close_trip, synchronize_trip_lifecycle
from app.services.routing_service import rebuild_trip_route

router = APIRouter(prefix="/driver", tags=["driver"])


def _get_driver_trip_or_404(db: Session, current_user: User, trip_id: UUID) -> Trip:
    """Resolve a trip that belongs to the current driver's van and company."""
    trip = db.scalar(
        select(Trip)
        .join(Van, Trip.van_id == Van.id)
        .where(
            Trip.id == trip_id,
            Trip.company_id == current_user.company_id,
            Van.driver_id == current_user.id,
        )
    )
    if trip is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found for this driver.",
        )
    return trip


def _get_driver_van_or_404(db: Session, driver_id) -> Van:
    van = db.scalar(select(Van).where(Van.driver_id == driver_id))
    if van is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No van is assigned to this driver.",
        )
    return van


def _get_latest_driver_trip(db: Session, van_id) -> Trip | None:
    statuses = list(TRIP_ACTIVE_STATUSES) + [TripStatus.PLANNED]
    return db.scalars(
        select(Trip)
        .where(
            Trip.van_id == van_id,
            Trip.status.in_(statuses),
        )
        .order_by(Trip.created_at.desc())
    ).first()


def _sync_trip_progress_from_location(trip: Trip, latitude: float, longitude: float) -> None:
    """Advance ride progress automatically when the van reaches pickup or drop-off zones."""
    threshold = settings.DRIVER_ARRIVAL_THRESHOLD_METERS
    for assignment in trip.trip_passengers:
        if assignment.ride_request is None:
            continue

        if assignment.status in {PassengerStatus.ASSIGNED, PassengerStatus.NOTIFIED}:
            pickup_coordinates = parse_point(assignment.ride_request.pickup_location)
            if pickup_coordinates is None:
                continue
            distance = haversine_distance_meters(
                latitude,
                longitude,
                pickup_coordinates[0],
                pickup_coordinates[1],
            )
            if distance <= threshold:
                assignment.status = PassengerStatus.NOTIFIED
                assignment.ride_request.status = RideRequestStatus.ARRIVED_AT_PICKUP
            elif trip.started_at is not None and assignment.ride_request.status in {
                RideRequestStatus.MATCHED,
                RideRequestStatus.REQUESTED,
                RideRequestStatus.MATCHING,
            }:
                assignment.ride_request.status = RideRequestStatus.DRIVER_EN_ROUTE
            continue

        if assignment.status == PassengerStatus.PICKED_UP:
            destination_coordinates = parse_point(assignment.ride_request.destination)
            if destination_coordinates is None:
                continue
            distance = haversine_distance_meters(
                latitude,
                longitude,
                destination_coordinates[0],
                destination_coordinates[1],
            )
            if distance <= threshold:
                assignment.ride_request.status = RideRequestStatus.ARRIVED_AT_DESTINATION

    synchronize_trip_lifecycle(trip)


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
    """Return the active or dispatch-ready trip for the current driver."""
    van = db.scalar(select(Van).where(Van.driver_id == current_user.id))
    if van is None:
        return None

    trip = _get_latest_driver_trip(db, van.id)
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
    van = _get_driver_van_or_404(db, current_user.id)
    van.current_location = point_value(
        payload.longitude,
        payload.latitude,
        sqlite_mode=db.bind.dialect.name == "sqlite",
    )
    van.last_location_update = datetime.utcnow()
    db.add(van)

    trip = _get_latest_driver_trip(db, van.id)
    if trip is not None:
        _sync_trip_progress_from_location(trip, payload.latitude, payload.longitude)
        rebuild_trip_route(db, trip)
        db.add(trip)

    db.commit()
    return MessageResponse(message="Driver location updated.")


@router.post("/status", response_model=MessageResponse)
def update_status(
    payload: DriverStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DRIVER)),
) -> MessageResponse:
    """Update the availability state for the driver's assigned van."""
    van = _get_driver_van_or_404(db, current_user.id)

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
    """Mark a dispatch-ready trip as active toward pickups."""
    trip = _get_driver_trip_or_404(db, current_user, trip_id)
    previous_trip_status = trip.status.value
    trip.started_at = trip.started_at or datetime.utcnow()
    trip.status = TripStatus.ACTIVE_TO_PICKUP
    if trip.van:
        trip.van.status = VanStatus.ON_TRIP
        db.add(trip.van)

    synchronize_trip_lifecycle(trip)
    rebuild_trip_route(db, trip)
    record_dispatch_event(
        db,
        company_id=current_user.company_id,
        event_type="trip.started",
        actor_type=current_user.role.value,
        actor_user_id=current_user.id,
        trip_id=trip.id,
        from_state=previous_trip_status,
        to_state=trip.status.value,
    )
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

    previous_ride_status = assignment.ride_request.status.value
    assignment.status = PassengerStatus.PICKED_UP
    assignment.actual_pickup_time = datetime.utcnow()
    assignment.ride_request.status = RideRequestStatus.PICKED_UP
    assignment.ride_request.actual_pickup_time = assignment.actual_pickup_time

    synchronize_trip_lifecycle(trip)
    rebuild_trip_route(db, trip)
    record_dispatch_event(
        db,
        company_id=current_user.company_id,
        event_type="ride.picked_up",
        actor_type=current_user.role.value,
        actor_user_id=current_user.id,
        ride_id=assignment.ride_request_id,
        trip_id=trip.id,
        from_state=previous_ride_status,
        to_state=assignment.ride_request.status.value,
        metadata={"passenger_name": assignment.user.name if assignment.user else None},
    )
    db.add_all([assignment, assignment.ride_request, trip])
    db.commit()
    return MessageResponse(message="Passenger marked as picked up.")


@router.post("/trips/{trip_id}/dropoff/{ride_request_id}", response_model=MessageResponse)
def dropoff_passenger(
    trip_id: UUID,
    ride_request_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DRIVER)),
) -> MessageResponse:
    """Mark a passenger as dropped off."""
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

    previous_ride_status = assignment.ride_request.status.value
    assignment.status = PassengerStatus.DROPPED_OFF
    assignment.actual_dropoff_time = datetime.utcnow()
    assignment.ride_request.status = RideRequestStatus.DROPPED_OFF
    assignment.ride_request.actual_dropoff_time = assignment.actual_dropoff_time

    if trip.van is not None:
        trip.van.current_occupancy = max(0, (trip.van.current_occupancy or 0) - 1)
        db.add(trip.van)

    synchronize_trip_lifecycle(trip)
    rebuild_trip_route(db, trip)
    record_dispatch_event(
        db,
        company_id=current_user.company_id,
        event_type="ride.dropped_off",
        actor_type=current_user.role.value,
        actor_user_id=current_user.id,
        ride_id=assignment.ride_request_id,
        trip_id=trip.id,
        from_state=previous_ride_status,
        to_state=assignment.ride_request.status.value,
        metadata={"passenger_name": assignment.user.name if assignment.user else None},
    )
    db.add_all([assignment, assignment.ride_request, trip])
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
    previous_trip_status = trip.status.value
    completed_at = datetime.utcnow()
    for assignment in trip.trip_passengers:
        if assignment.ride_request is None:
            continue
        previous_ride_status = assignment.ride_request.status.value
        if assignment.status != PassengerStatus.DROPPED_OFF:
            assignment.status = PassengerStatus.DROPPED_OFF
            assignment.actual_dropoff_time = completed_at
            assignment.ride_request.status = RideRequestStatus.DROPPED_OFF
            assignment.ride_request.actual_dropoff_time = completed_at
            db.add(assignment.ride_request)
            record_dispatch_event(
                db,
                company_id=current_user.company_id,
                event_type="ride.dropped_off",
                actor_type=current_user.role.value,
                actor_user_id=current_user.id,
                ride_id=assignment.ride_request_id,
                trip_id=trip.id,
                from_state=previous_ride_status,
                to_state=assignment.ride_request.status.value,
                metadata={"forced": True},
            )
        db.add(assignment)

    close_trip(trip)
    trip.completed_at = completed_at
    rebuild_trip_route(db, trip)
    record_dispatch_event(
        db,
        company_id=current_user.company_id,
        event_type="trip.completed",
        actor_type=current_user.role.value,
        actor_user_id=current_user.id,
        trip_id=trip.id,
        from_state=previous_trip_status,
        to_state=trip.status.value,
        metadata={"completed_at": completed_at.isoformat()},
    )
    for assignment in trip.trip_passengers:
        if assignment.ride_request is None:
            continue
        record_dispatch_event(
            db,
            company_id=current_user.company_id,
            event_type="ride.completed",
            actor_type=current_user.role.value,
            actor_user_id=current_user.id,
            ride_id=assignment.ride_request_id,
            trip_id=trip.id,
            from_state=RideRequestStatus.DROPPED_OFF.value,
            to_state=assignment.ride_request.status.value,
            metadata={"completed_at": completed_at.isoformat()},
        )
    db.add(trip)
    db.commit()
    return MessageResponse(message="Trip completed.")


@router.post("/trips/{trip_id}/no-show/{ride_request_id}", response_model=MessageResponse)
def no_show_passenger(
    trip_id: UUID,
    ride_request_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DRIVER)),
) -> MessageResponse:
    """Mark a passenger as a no-show and alert dispatch."""
    mark_passenger_no_show(
        db,
        driver_user=current_user,
        trip_id=trip_id,
        ride_request_id=ride_request_id,
    )
    return MessageResponse(message="Passenger marked as no-show and dispatch alerted.")
