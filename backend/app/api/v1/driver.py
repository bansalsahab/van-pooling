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
from app.schemas.driver_ops import (
    DriverPickupOtpInput,
    DriverShiftStartInput,
    DriverShiftSummary,
    DriverVehicleCheckCreate,
    DriverVehicleCheckSummary,
)
from app.schemas.trip import DriverTripSummary
from app.schemas.van import DriverLocationUpdate, DriverStatusUpdate
from app.services.audit_service import record_dispatch_event
from app.services.dispatch_ops_service import mark_passenger_no_show
from app.services.driver_ops_service import (
    clock_out_driver_shift,
    list_driver_shifts,
    list_driver_vehicle_checks,
    start_driver_shift,
    submit_driver_vehicle_check,
)
from app.services.dashboard_service import get_driver_dashboard, serialize_driver_trip
from app.services.lifecycle_service import TRIP_ACTIVE_STATUSES, close_trip, synchronize_trip_lifecycle
from app.services.notification_service import queue_notification_once
from app.services.ride_service import BOARDING_OTP_CODE_KEY, BOARDING_OTP_VERIFIED_AT_KEY
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


def _ride_event_name_for_status(status: RideRequestStatus) -> str:
    return {
        RideRequestStatus.DRIVER_EN_ROUTE: "ride.driver_en_route",
        RideRequestStatus.ARRIVED_AT_PICKUP: "ride.arrived_at_pickup",
        RideRequestStatus.PICKED_UP: "ride.picked_up",
        RideRequestStatus.ARRIVED_AT_DESTINATION: "ride.arrived_at_destination",
        RideRequestStatus.DROPPED_OFF: "ride.dropped_off",
    }.get(status, "ride.status_changed")


def _coerce_dispatch_metadata(raw: object) -> dict[str, object]:
    if isinstance(raw, dict):
        return dict(raw)
    return {}


def _notify_ride_transition(
    db: Session,
    assignment: TripPassenger,
    next_status: RideRequestStatus,
) -> None:
    if assignment.user_id is None:
        return
    if next_status == RideRequestStatus.DRIVER_EN_ROUTE:
        queue_notification_once(
            db,
            assignment.user_id,
            title="Driver is on the way",
            message="Your driver is now en route to your pickup location.",
            metadata={
                "ride_id": str(assignment.ride_request_id),
                "trip_id": str(assignment.trip_id),
            },
            dedupe_key=f"ride-transition:{assignment.ride_request_id}:{next_status.value}",
        )
        return
    if next_status == RideRequestStatus.ARRIVED_AT_PICKUP:
        queue_notification_once(
            db,
            assignment.user_id,
            title="Driver arrived at pickup",
            message="Your driver has reached your pickup point.",
            metadata={
                "ride_id": str(assignment.ride_request_id),
                "trip_id": str(assignment.trip_id),
            },
            dedupe_key=f"ride-transition:{assignment.ride_request_id}:{next_status.value}",
        )
        return
    if next_status == RideRequestStatus.ARRIVED_AT_DESTINATION:
        queue_notification_once(
            db,
            assignment.user_id,
            title="Approaching destination",
            message="Your van has reached the destination area and dropoff is in progress.",
            metadata={
                "ride_id": str(assignment.ride_request_id),
                "trip_id": str(assignment.trip_id),
            },
            dedupe_key=f"ride-transition:{assignment.ride_request_id}:{next_status.value}",
        )


def _sync_trip_progress_from_location(
    trip: Trip,
    latitude: float,
    longitude: float,
) -> tuple[
    list[tuple[TripPassenger, RideRequestStatus, RideRequestStatus]],
    str,
    str,
]:
    """Advance ride progress automatically when the van reaches pickup or drop-off zones."""
    threshold = settings.DRIVER_ARRIVAL_THRESHOLD_METERS
    transitions: list[tuple[TripPassenger, RideRequestStatus, RideRequestStatus]] = []
    previous_trip_status = trip.status.value
    for assignment in trip.trip_passengers:
        if assignment.ride_request is None:
            continue

        previous_ride_status = assignment.ride_request.status
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
            if assignment.ride_request.status != previous_ride_status:
                transitions.append(
                    (assignment, previous_ride_status, assignment.ride_request.status)
                )
            continue

        if assignment.status == PassengerStatus.PICKED_UP:
            previous_ride_status = assignment.ride_request.status
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
            if assignment.ride_request.status != previous_ride_status:
                transitions.append(
                    (assignment, previous_ride_status, assignment.ride_request.status)
                )

    synchronize_trip_lifecycle(trip)
    return transitions, previous_trip_status, trip.status.value


@router.get("/dashboard", response_model=DriverDashboardSummary)
def driver_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DRIVER)),
) -> DriverDashboardSummary:
    """Return the driver's dashboard snapshot."""
    return get_driver_dashboard(db, current_user)


@router.get("/shifts", response_model=list[DriverShiftSummary])
def shifts(
    limit: int = 25,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DRIVER)),
) -> list[DriverShiftSummary]:
    """Return recent shift entries for the current driver."""
    return list_driver_shifts(db, current_user, limit=limit)


@router.post("/shifts/start", response_model=DriverShiftSummary)
def start_shift(
    payload: DriverShiftStartInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DRIVER)),
) -> DriverShiftSummary:
    """Start a shift for the current driver when no active shift exists."""
    return start_driver_shift(db, current_user, payload)


@router.post("/shifts/{shift_id}/clock-out", response_model=DriverShiftSummary)
def clock_out_shift(
    shift_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DRIVER)),
) -> DriverShiftSummary:
    """Clock out one active shift for the current driver."""
    return clock_out_driver_shift(db, current_user, shift_id)


@router.get("/vehicle-checks", response_model=list[DriverVehicleCheckSummary])
def vehicle_checks(
    limit: int = 25,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DRIVER)),
) -> list[DriverVehicleCheckSummary]:
    """Return recent vehicle checks submitted by the current driver."""
    return list_driver_vehicle_checks(db, current_user, limit=limit)


@router.post("/vehicle-checks", response_model=DriverVehicleCheckSummary)
def submit_vehicle_check(
    payload: DriverVehicleCheckCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DRIVER)),
) -> DriverVehicleCheckSummary:
    """Submit a pre-trip vehicle check entry."""
    return submit_driver_vehicle_check(db, current_user, payload)


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
        transitions, previous_trip_status, current_trip_status = _sync_trip_progress_from_location(
            trip,
            payload.latitude,
            payload.longitude,
        )
        for assignment, previous_ride_status, next_ride_status in transitions:
            record_dispatch_event(
                db,
                company_id=current_user.company_id,
                event_type=_ride_event_name_for_status(next_ride_status),
                actor_type=current_user.role.value,
                actor_user_id=current_user.id,
                ride_id=assignment.ride_request_id,
                trip_id=trip.id,
                from_state=previous_ride_status.value,
                to_state=next_ride_status.value,
                metadata={"auto_transition": True, "source": "driver.location_update"},
            )
            _notify_ride_transition(db, assignment, next_ride_status)

        if current_trip_status != previous_trip_status:
            record_dispatch_event(
                db,
                company_id=current_user.company_id,
                event_type="trip.status_changed",
                actor_type=current_user.role.value,
                actor_user_id=current_user.id,
                trip_id=trip.id,
                from_state=previous_trip_status,
                to_state=current_trip_status,
                metadata={"auto_transition": True, "source": "driver.location_update"},
            )
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
    if trip.accepted_at is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Accept the trip before starting it.",
        )
    if trip.started_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trip has already started.",
        )
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


def _ensure_trip_started(trip: Trip) -> None:
    if trip.started_at is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Accept and start the trip before updating rider progress.",
        )


def _notify_trip_acceptance(db: Session, trip: Trip) -> None:
    for assignment in trip.trip_passengers:
        if assignment.ride_request is None or assignment.user_id is None:
            continue
        queue_notification_once(
            db,
            assignment.user_id,
            title="Driver confirmed your ride",
            message=(
                f"Your driver acknowledged trip {str(trip.id)[:8]} and is preparing for pickup."
            ),
            metadata={
                "trip_id": str(trip.id),
                "ride_id": str(assignment.ride_request_id),
            },
            dedupe_key=f"trip-accepted:{trip.id}:{assignment.ride_request_id}",
        )


@router.post("/trips/{trip_id}/accept", response_model=MessageResponse)
def accept_trip(
    trip_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DRIVER)),
) -> MessageResponse:
    """Acknowledge responsibility for a dispatch-ready trip before departure."""
    trip = _get_driver_trip_or_404(db, current_user, trip_id)
    if trip.status not in {TripStatus.PLANNED, TripStatus.DISPATCH_READY}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only dispatch-ready trips can be accepted.",
        )
    if trip.accepted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trip has already been accepted.",
        )

    previous_trip_status = trip.status.value
    trip.accepted_at = datetime.utcnow()
    synchronize_trip_lifecycle(trip)
    rebuild_trip_route(db, trip)
    _notify_trip_acceptance(db, trip)
    record_dispatch_event(
        db,
        company_id=current_user.company_id,
        event_type="trip.accepted",
        actor_type=current_user.role.value,
        actor_user_id=current_user.id,
        trip_id=trip.id,
        from_state=previous_trip_status,
        to_state=trip.status.value,
        metadata={"accepted_at": trip.accepted_at.isoformat()},
    )
    db.add(trip)
    db.commit()
    return MessageResponse(message="Trip accepted. You can now start the route.")


@router.post("/trips/{trip_id}/pickup/{ride_request_id}", response_model=MessageResponse)
def pickup_passenger(
    trip_id: UUID,
    ride_request_id: UUID,
    payload: DriverPickupOtpInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DRIVER)),
) -> MessageResponse:
    """Mark a passenger as picked up."""
    trip = _get_driver_trip_or_404(db, current_user, trip_id)
    previous_trip_status = trip.status.value
    _ensure_trip_started(trip)
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
    if assignment.status in {PassengerStatus.PICKED_UP, PassengerStatus.DROPPED_OFF}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passenger is already picked up or dropped off.",
        )

    metadata = _coerce_dispatch_metadata(assignment.ride_request.dispatch_metadata)
    expected_otp = metadata.get(BOARDING_OTP_CODE_KEY)
    if not isinstance(expected_otp, str) or len(expected_otp) != 4 or not expected_otp.isdigit():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Boarding OTP is unavailable for this ride. Ask dispatch to rematch the ride.",
        )
    if payload.otp_code != expected_otp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OTP. Ask the rider to share the 4-digit boarding code.",
        )

    previous_ride_status = assignment.ride_request.status.value
    assignment.status = PassengerStatus.PICKED_UP
    assignment.actual_pickup_time = datetime.utcnow()
    assignment.ride_request.status = RideRequestStatus.PICKED_UP
    assignment.ride_request.actual_pickup_time = assignment.actual_pickup_time
    metadata[BOARDING_OTP_VERIFIED_AT_KEY] = assignment.actual_pickup_time.isoformat()
    assignment.ride_request.dispatch_metadata = metadata

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
        metadata={
            "passenger_name": assignment.user.name if assignment.user else None,
            "boarding_otp_verified": True,
            "boarding_otp_verified_at": assignment.actual_pickup_time.isoformat(),
        },
    )
    if trip.status.value != previous_trip_status:
        record_dispatch_event(
            db,
            company_id=current_user.company_id,
            event_type="trip.status_changed",
            actor_type=current_user.role.value,
            actor_user_id=current_user.id,
            ride_id=assignment.ride_request_id,
            trip_id=trip.id,
            from_state=previous_trip_status,
            to_state=trip.status.value,
            metadata={"source": "driver.pickup"},
        )
    if assignment.user_id is not None:
        queue_notification_once(
            db,
            assignment.user_id,
            title="Pickup confirmed",
            message="Your driver confirmed pickup and the ride is now in transit.",
            metadata={
                "ride_id": str(assignment.ride_request_id),
                "trip_id": str(trip.id),
            },
            dedupe_key=f"ride-transition:{assignment.ride_request_id}:{RideRequestStatus.PICKED_UP.value}",
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
    previous_trip_status = trip.status.value
    _ensure_trip_started(trip)
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
    if trip.status.value != previous_trip_status:
        record_dispatch_event(
            db,
            company_id=current_user.company_id,
            event_type="trip.status_changed",
            actor_type=current_user.role.value,
            actor_user_id=current_user.id,
            ride_id=assignment.ride_request_id,
            trip_id=trip.id,
            from_state=previous_trip_status,
            to_state=trip.status.value,
            metadata={"source": "driver.dropoff"},
        )
    if assignment.user_id is not None:
        queue_notification_once(
            db,
            assignment.user_id,
            title="Dropoff confirmed",
            message="Your dropoff was confirmed. Trip closure is in progress.",
            metadata={
                "ride_id": str(assignment.ride_request_id),
                "trip_id": str(trip.id),
            },
            dedupe_key=f"ride-transition:{assignment.ride_request_id}:{RideRequestStatus.DROPPED_OFF.value}",
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
    _ensure_trip_started(trip)
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
        if assignment.user_id is not None:
            queue_notification_once(
                db,
                assignment.user_id,
                title="Ride completed",
                message="Your ride has been completed. Thanks for riding.",
                metadata={
                    "ride_id": str(assignment.ride_request_id),
                    "trip_id": str(trip.id),
                },
                dedupe_key=f"ride-transition:{assignment.ride_request_id}:{RideRequestStatus.COMPLETED.value}",
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
    trip = _get_driver_trip_or_404(db, current_user, trip_id)
    _ensure_trip_started(trip)
    mark_passenger_no_show(
        db,
        driver_user=current_user,
        trip_id=trip_id,
        ride_request_id=ride_request_id,
    )
    return MessageResponse(message="Passenger marked as no-show and dispatch alerted.")
