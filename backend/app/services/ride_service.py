"""Ride request and dispatch helpers."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.geo import haversine_distance_meters, parse_point, point_value
from app.models.ride_request import RideRequest, RideRequestStatus
from app.models.trip import Trip, TripStatus
from app.models.trip_passenger import PassengerStatus, TripPassenger
from app.models.user import User
from app.models.van import Van, VanStatus
from app.schemas.ride_request import RideRequestCreate, RideRequestSummary
from app.services.audit_service import record_dispatch_event
from app.services.lifecycle_service import (
    RIDE_OPEN_STATUSES,
    TRIP_POOLABLE_STATUSES,
    ride_is_cancellable,
    ride_is_terminal,
    synchronize_trip_lifecycle,
    trip_is_blocking,
)
from app.services.notification_service import create_admin_alert, queue_notification
from app.services.routing_service import rebuild_trip_route


AVERAGE_SPEED_METERS_PER_MINUTE = 400.0


def _point(longitude: float, latitude: float):
    """Create a PostGIS-compatible geography point."""
    return point_value(longitude, latitude, settings.is_sqlite)


def _utc_now() -> datetime:
    """Return a naive UTC timestamp consistent with the existing schema."""
    return datetime.utcnow()


def _normalize_datetime(value: datetime | None) -> datetime | None:
    """Convert aware values to naive UTC for storage and comparison."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def serialize_ride_request(ride: RideRequest) -> RideRequestSummary:
    """Convert a ride request model to API output."""
    trip = ride.trip_passenger.trip if ride.trip_passenger else None
    van = trip.van if trip else None
    driver = van.driver if van else None
    van_coordinates = parse_point(van.current_location) if van else None
    pickup_coordinates = parse_point(ride.pickup_location)
    destination_coordinates = parse_point(ride.destination)
    route = trip.route or {} if trip else {}
    return RideRequestSummary(
        id=ride.id,
        status=ride.status.value,
        pickup_address=ride.pickup_address,
        destination_address=ride.destination_address,
        scheduled_time=ride.scheduled_time,
        requested_at=ride.requested_at,
        estimated_wait_minutes=ride.estimated_wait_minutes,
        estimated_cost=ride.estimated_cost,
        trip_id=trip.id if trip else None,
        van_id=van.id if van else None,
        van_license_plate=van.license_plate if van else None,
        driver_name=driver.name if driver else None,
        pickup_latitude=pickup_coordinates[0] if pickup_coordinates else None,
        pickup_longitude=pickup_coordinates[1] if pickup_coordinates else None,
        destination_latitude=destination_coordinates[0] if destination_coordinates else None,
        destination_longitude=destination_coordinates[1] if destination_coordinates else None,
        van_latitude=van_coordinates[0] if van_coordinates else None,
        van_longitude=van_coordinates[1] if van_coordinates else None,
        van_last_location_update=van.last_location_update if van else None,
        route_polyline=route.get("encoded_polyline"),
        route_distance_meters=(route.get("distance_meters") or trip.total_distance_meters) if trip else None,
        route_duration_minutes=(route.get("duration_minutes") or trip.estimated_duration_minutes) if trip else None,
        next_stop_address=_resolve_next_stop_address(route),
    )


def _resolve_next_stop_address(route: dict) -> str | None:
    for item in route.get("pickup_sequence", []):
        if item.get("status") in {
            PassengerStatus.ASSIGNED.value,
            PassengerStatus.NOTIFIED.value,
        }:
            return item.get("pickup_address")
    return route.get("destination_address")


def _trip_destination_coordinates(trip: Trip) -> tuple[float, float] | None:
    route = trip.route or {}
    latitude = route.get("destination_latitude")
    longitude = route.get("destination_longitude")
    if latitude is not None and longitude is not None:
        return float(latitude), float(longitude)

    for item in trip.trip_passengers:
        if item.ride_request is not None:
            coordinates = parse_point(item.ride_request.destination)
            if coordinates is not None:
                return coordinates
    return None


def _scheduled_time_compatible(trip: Trip, scheduled_time: datetime | None) -> bool:
    if scheduled_time is None:
        return True
    trip_times = [
        item.ride_request.scheduled_time
        for item in trip.trip_passengers
        if item.ride_request is not None and item.ride_request.scheduled_time is not None
    ]
    if not trip_times:
        return True
    anchor = min(trip_times)
    return abs((anchor - scheduled_time).total_seconds()) <= (
        settings.MATCHING_SCHEDULE_COMPATIBILITY_MINUTES * 60
    )


def _van_heartbeat_age_seconds(van: Van, now: datetime) -> float:
    if van.last_location_update is None:
        return float("inf")
    return max(0.0, (now - van.last_location_update).total_seconds())


def _van_readiness_score(van: Van, now: datetime) -> float:
    heartbeat_age = _van_heartbeat_age_seconds(van, now)
    heartbeat_ratio = min(
        1.0,
        heartbeat_age / max(1, settings.MATCHING_STALE_DRIVER_HEARTBEAT_SECONDS),
    )
    if van.status in {VanStatus.OFFLINE, VanStatus.MAINTENANCE} or van.driver_id is None:
        return 1.0
    base_penalty = 0.35 if van.status == VanStatus.ON_TRIP else 0.0
    if parse_point(van.current_location) is None:
        base_penalty = max(base_penalty, 0.65)
    return min(1.0, base_penalty + (heartbeat_ratio * 0.65))


def _estimate_detour_metrics(
    pickup_distance: float,
    destination_distance: float,
) -> tuple[float, float]:
    extra_distance = pickup_distance + (destination_distance * 0.35)
    extra_minutes = extra_distance / AVERAGE_SPEED_METERS_PER_MINUTE
    return extra_distance, extra_minutes


def _pool_candidate_score(
    trip: Trip,
    pickup_distance: float,
    destination_distance: float,
    now: datetime,
) -> float:
    extra_distance, extra_minutes = _estimate_detour_metrics(
        pickup_distance,
        destination_distance,
    )
    pickup_score = min(1.0, pickup_distance / max(1, settings.MATCHING_PICKUP_RADIUS_METERS))
    destination_score = min(
        1.0,
        destination_distance / max(1, settings.MATCHING_DESTINATION_CLUSTER_RADIUS_METERS),
    )
    detour_distance_score = min(
        1.0,
        extra_distance / max(1, settings.MATCHING_MAX_EXTRA_DISTANCE_METERS),
    )
    detour_time_score = min(
        1.0,
        extra_minutes / max(1, settings.MATCHING_MAX_DETOUR_MINUTES),
    )
    detour_score = (detour_distance_score + detour_time_score) / 2
    readiness_score = _van_readiness_score(trip.van, now)
    return (
        pickup_score * settings.MATCHING_SCORE_PICKUP_WEIGHT
        + destination_score * settings.MATCHING_SCORE_DESTINATION_WEIGHT
        + detour_score * settings.MATCHING_SCORE_DETOUR_WEIGHT
        + readiness_score * settings.MATCHING_SCORE_READINESS_WEIGHT
    )


def _new_trip_van_score(van: Van, pickup_distance: float, now: datetime) -> float:
    pickup_score = min(1.0, pickup_distance / max(1, settings.MATCHING_PICKUP_RADIUS_METERS))
    readiness_score = _van_readiness_score(van, now)
    return (
        pickup_score * settings.MATCHING_SCORE_PICKUP_WEIGHT
        + readiness_score * settings.MATCHING_SCORE_READINESS_WEIGHT
    )


def _find_poolable_trip(
    db: Session,
    ride: RideRequest,
) -> Trip | None:
    destination_coordinates = parse_point(ride.destination)
    pickup_coordinates = parse_point(ride.pickup_location)
    if destination_coordinates is None or pickup_coordinates is None:
        return None

    now = _utc_now()
    trips = db.scalars(
        select(Trip)
        .join(Van, Trip.van_id == Van.id)
        .where(
            Trip.company_id == ride.company_id,
            Trip.status.in_(list(TRIP_POOLABLE_STATUSES)),
            Van.driver_id.is_not(None),
            Van.status.in_([VanStatus.AVAILABLE, VanStatus.ON_TRIP]),
            Van.current_occupancy < Van.capacity,
        )
        .order_by(Trip.created_at.asc())
    ).all()

    best_trip: Trip | None = None
    best_score = float("inf")
    for trip in trips:
        if trip.van is None or trip_is_blocking(trip):
            continue
        if _van_heartbeat_age_seconds(trip.van, now) > settings.MATCHING_STALE_DRIVER_HEARTBEAT_SECONDS:
            continue

        trip_destination = _trip_destination_coordinates(trip)
        van_coordinates = parse_point(trip.van.current_location)
        if trip_destination is None or van_coordinates is None:
            continue

        destination_distance = haversine_distance_meters(
            destination_coordinates[0],
            destination_coordinates[1],
            trip_destination[0],
            trip_destination[1],
        )
        if destination_distance > settings.MATCHING_DESTINATION_CLUSTER_RADIUS_METERS:
            continue

        if not _scheduled_time_compatible(trip, ride.scheduled_time):
            continue

        pickup_distance = haversine_distance_meters(
            pickup_coordinates[0],
            pickup_coordinates[1],
            van_coordinates[0],
            van_coordinates[1],
        )
        if pickup_distance > settings.MATCHING_PICKUP_RADIUS_METERS:
            continue

        extra_distance, extra_minutes = _estimate_detour_metrics(
            pickup_distance,
            destination_distance,
        )
        if extra_distance > settings.MATCHING_MAX_EXTRA_DISTANCE_METERS:
            continue
        if extra_minutes > settings.MATCHING_MAX_DETOUR_MINUTES:
            continue

        score = _pool_candidate_score(
            trip,
            pickup_distance=pickup_distance,
            destination_distance=destination_distance,
            now=now,
        )
        if score < best_score:
            best_trip = trip
            best_score = score

    return best_trip


def _find_best_available_van(
    db: Session,
    company_id,
    pickup_point,
) -> Van | None:
    pickup_coordinates = parse_point(pickup_point)
    vans = db.scalars(
        select(Van).where(
            Van.company_id == company_id,
            Van.status == VanStatus.AVAILABLE,
            Van.driver_id.is_not(None),
            Van.current_occupancy < Van.capacity,
        )
    ).all()
    if pickup_coordinates is None:
        return vans[0] if vans else None

    now = _utc_now()
    pickup_latitude, pickup_longitude = pickup_coordinates
    scored_candidates: list[tuple[float, Van]] = []
    for van in vans:
        if _van_heartbeat_age_seconds(van, now) > settings.MATCHING_STALE_DRIVER_HEARTBEAT_SECONDS:
            continue
        van_coordinates = parse_point(van.current_location)
        if van_coordinates is None:
            continue
        pickup_distance = haversine_distance_meters(
            pickup_latitude,
            pickup_longitude,
            van_coordinates[0],
            van_coordinates[1],
        )
        if pickup_distance > settings.MATCHING_PICKUP_RADIUS_METERS:
            continue
        scored_candidates.append(
            (_new_trip_van_score(van, pickup_distance, now), van)
        )

    scored_candidates.sort(key=lambda item: item[0])
    return scored_candidates[0][1] if scored_candidates else None


def _attach_assignment_to_trip(
    trip: Trip,
    ride: RideRequest,
    current_user: User,
) -> TripPassenger:
    next_pickup_index = max(
        [item.pickup_stop_index for item in trip.trip_passengers],
        default=0,
    ) + 1
    next_dropoff_index = max(
        [item.dropoff_stop_index for item in trip.trip_passengers],
        default=1,
    ) + 1
    return TripPassenger(
        trip=trip,
        ride_request=ride,
        user=current_user,
        pickup_stop_index=next_pickup_index,
        dropoff_stop_index=next_dropoff_index,
        status=PassengerStatus.ASSIGNED,
    )


def _notify_ride_assignment(db: Session, ride: RideRequest, trip: Trip) -> None:
    if ride.user_id is not None:
        queue_notification(
            db,
            ride.user_id,
            title="Ride assigned",
            message=(
                f"Your ride is now linked to van {trip.van.license_plate if trip.van else 'the assigned vehicle'}."
            ),
            metadata={"ride_id": str(ride.id), "trip_id": str(trip.id)},
        )
    if trip.van is not None and trip.van.driver_id is not None:
        queue_notification(
            db,
            trip.van.driver_id,
            title="New rider added",
            message=f"A rider was added to trip {str(trip.id)[:8]}.",
            metadata={"ride_id": str(ride.id), "trip_id": str(trip.id)},
        )


def _assign_ride_to_trip(
    db: Session,
    trip: Trip,
    ride: RideRequest,
    current_user: User,
) -> None:
    if trip.van is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Trip has no assigned van.",
        )

    assignment = _attach_assignment_to_trip(trip, ride, current_user)
    previous_ride_status = ride.status.value
    trip.van.current_occupancy = min(
        trip.van.capacity,
        (trip.van.current_occupancy or 0) + 1,
    )
    trip.van.status = VanStatus.ON_TRIP
    ride.status = RideRequestStatus.MATCHED
    db.add_all([assignment, trip.van, trip, ride])
    db.flush()
    synchronize_trip_lifecycle(trip)
    rebuild_trip_route(db, trip)
    ride.estimated_wait_minutes = min(ride.estimated_wait_minutes or 8, 8)
    record_dispatch_event(
        db,
        company_id=ride.company_id,
        event_type="ride.matched",
        actor_type="system",
        ride_id=ride.id,
        trip_id=trip.id,
        from_state=previous_ride_status,
        to_state=ride.status.value,
        metadata={
            "assignment_type": "pooled",
            "van_id": str(trip.van_id),
            "van_license_plate": trip.van.license_plate if trip.van else None,
        },
    )
    record_dispatch_event(
        db,
        company_id=ride.company_id,
        event_type="trip.rider_added",
        actor_type="system",
        ride_id=ride.id,
        trip_id=trip.id,
        from_state=None,
        to_state=trip.status.value,
        metadata={
            "assignment_type": "pooled",
            "passenger_count": len(trip.trip_passengers),
        },
    )
    _notify_ride_assignment(db, ride, trip)


def _create_trip_for_ride(
    db: Session,
    current_user: User,
    ride: RideRequest,
    van: Van,
) -> None:
    previous_ride_status = ride.status.value
    trip = Trip(
        van=van,
        company_id=current_user.company_id,
        status=TripStatus.DISPATCH_READY,
        route={},
        estimated_duration_minutes=20,
    )
    assignment = TripPassenger(
        trip=trip,
        ride_request=ride,
        user=current_user,
        pickup_stop_index=1,
        dropoff_stop_index=2,
        status=PassengerStatus.ASSIGNED,
    )

    van.current_occupancy = min(van.capacity, (van.current_occupancy or 0) + 1)
    van.status = VanStatus.ON_TRIP
    ride.status = RideRequestStatus.MATCHED

    db.add_all([trip, assignment, van, ride])
    db.flush()
    synchronize_trip_lifecycle(trip)
    rebuild_trip_route(db, trip)
    if trip.estimated_duration_minutes:
        ride.estimated_wait_minutes = min(
            ride.estimated_wait_minutes or 6,
            trip.estimated_duration_minutes,
        )
    record_dispatch_event(
        db,
        company_id=current_user.company_id,
        event_type="trip.created",
        actor_type="system",
        ride_id=ride.id,
        trip_id=trip.id,
        from_state=None,
        to_state=trip.status.value,
        metadata={
            "van_id": str(van.id),
            "van_license_plate": van.license_plate,
            "passenger_count": len(trip.trip_passengers),
        },
    )
    record_dispatch_event(
        db,
        company_id=current_user.company_id,
        event_type="ride.matched",
        actor_type="system",
        ride_id=ride.id,
        trip_id=trip.id,
        from_state=previous_ride_status,
        to_state=ride.status.value,
        metadata={
            "assignment_type": "new_trip",
            "van_id": str(van.id),
            "van_license_plate": van.license_plate,
        },
    )
    _notify_ride_assignment(db, ride, trip)


def is_dispatch_window_open(ride: RideRequest, reference_time: datetime | None = None) -> bool:
    """Return whether a scheduled ride should enter matching now."""
    if ride.scheduled_time is None:
        return True
    now = reference_time or _utc_now()
    dispatch_opens_at = ride.scheduled_time - timedelta(
        minutes=settings.SCHEDULED_RIDE_DISPATCH_LEAD_MINUTES
    )
    return now >= dispatch_opens_at


def attempt_match_ride(db: Session, ride: RideRequest) -> bool:
    """Try to assign a ride to an existing trip or create a new one."""
    if ride_is_terminal(ride.status) or ride.trip_passenger is not None:
        return ride.trip_passenger is not None

    current_user = db.get(User, ride.user_id)
    if current_user is None:
        ride.status = RideRequestStatus.FAILED_OPERATIONAL_ISSUE
        return False

    if ride.scheduled_time is not None:
        if not is_dispatch_window_open(ride):
            ride.status = RideRequestStatus.SCHEDULED_QUEUED
            return False
        ride.status = RideRequestStatus.MATCHING_AT_DISPATCH_WINDOW
    else:
        ride.status = RideRequestStatus.MATCHING

    pooled_trip = _find_poolable_trip(db, ride)
    if pooled_trip is not None:
        _assign_ride_to_trip(db, pooled_trip, ride, current_user)
        return True

    van = _find_best_available_van(db, ride.company_id, ride.pickup_location)
    if van is not None:
        _create_trip_for_ride(db, current_user, ride, van)
        return True

    ride.estimated_wait_minutes = max(ride.estimated_wait_minutes or 10, 10)
    return False


def create_ride_request(
    db: Session,
    current_user: User,
    payload: RideRequestCreate,
) -> RideRequestSummary:
    """Create a ride request and attempt dispatch when appropriate."""
    if current_user.company_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not attached to a company.",
        )

    pickup_point = _point(payload.pickup.longitude, payload.pickup.latitude)
    destination_point = _point(payload.destination.longitude, payload.destination.latitude)
    scheduled_time = _normalize_datetime(payload.scheduled_time)
    now = _utc_now()
    is_scheduled = scheduled_time is not None and scheduled_time > now

    available_vans = db.scalar(
        select(func.count(Van.id)).where(
            Van.company_id == current_user.company_id,
            Van.status == VanStatus.AVAILABLE,
        )
    ) or 0

    ride = RideRequest(
        user_id=current_user.id,
        company_id=current_user.company_id,
        pickup_location=pickup_point,
        pickup_address=payload.pickup.address,
        destination=destination_point,
        destination_address=payload.destination.address,
        status=(
            RideRequestStatus.SCHEDULED_QUEUED
            if is_scheduled
            else RideRequestStatus.REQUESTED
        ),
        scheduled_time=scheduled_time,
        expires_at=(
            scheduled_time
            if is_scheduled
            else now
            + timedelta(
                seconds=(
                    settings.MATCHING_AGGREGATION_WINDOW_SECONDS
                    + settings.MATCHING_RECOVERY_GRACE_SECONDS
                )
            )
        ),
        estimated_wait_minutes=(
            max(1, int((scheduled_time - now).total_seconds() // 60))
            if is_scheduled and scheduled_time is not None
            else (6 if available_vans else 12)
        ),
        estimated_cost=Decimal("0.00"),
    )

    db.add(ride)
    db.flush()
    record_dispatch_event(
        db,
        company_id=current_user.company_id,
        event_type="ride.requested",
        actor_type=current_user.role.value,
        actor_user_id=current_user.id,
        ride_id=ride.id,
        from_state=None,
        to_state=ride.status.value,
        metadata={
            "scheduled": is_scheduled,
            "pickup_address": ride.pickup_address,
            "destination_address": ride.destination_address,
        },
    )

    matched = False
    if not is_scheduled:
        matched = attempt_match_ride(db, ride)
        if not matched:
            create_admin_alert(
                db,
                current_user.company_id,
                title="Dispatch pressure rising",
                message="A new ride request is waiting because no eligible van is available right now.",
                severity="high",
                metadata={
                    "ride_id": str(ride.id),
                    "entity_type": "ride",
                    "entity_id": str(ride.id),
                },
            )
    else:
        queue_notification(
            db,
            current_user.id,
            title="Scheduled ride queued",
            message="Your ride is scheduled and will enter dispatch near the requested pickup window.",
            metadata={"ride_id": str(ride.id), "scheduled_time": scheduled_time.isoformat()},
        )

    db.commit()
    db.refresh(ride)
    return serialize_ride_request(ride)


def cancel_ride_request(
    db: Session,
    ride_id: UUID,
    current_user: User,
) -> RideRequestSummary:
    """Cancel a ride before pickup and release any reserved capacity."""
    ride = db.scalar(
        select(RideRequest).where(
            RideRequest.id == ride_id,
            RideRequest.company_id == current_user.company_id,
            RideRequest.user_id == current_user.id,
        )
    )
    if ride is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ride not found.",
        )
    if not ride_is_cancellable(ride.status):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This ride can no longer be cancelled.",
        )

    assignment = ride.trip_passenger
    trip = assignment.trip if assignment else None
    previous_ride_status = ride.status.value
    previous_trip_status = trip.status.value if trip is not None else None
    if assignment is not None:
        remaining_assignments = [
            item for item in trip.trip_passengers if item.id != assignment.id
        ] if trip is not None else []
        if trip is not None and trip.van is not None:
            trip.van.current_occupancy = max(0, (trip.van.current_occupancy or 0) - 1)
            if trip.van.current_occupancy == 0 and trip.status != TripStatus.COMPLETED:
                trip.van.status = VanStatus.AVAILABLE
            db.add(trip.van)
        if trip is not None and assignment in trip.trip_passengers:
            trip.trip_passengers.remove(assignment)
        if ride.trip_passenger is assignment:
            ride.trip_passenger = None
        db.delete(assignment)
        db.flush()
        if trip is not None:
            if remaining_assignments:
                synchronize_trip_lifecycle(trip)
                rebuild_trip_route(db, trip)
            if not remaining_assignments:
                trip.status = TripStatus.CANCELLED
                if trip.van is not None:
                    trip.van.status = VanStatus.AVAILABLE
                    trip.van.current_occupancy = 0
                    db.add(trip.van)
            db.add(trip)

    ride.status = RideRequestStatus.CANCELLED_BY_EMPLOYEE
    record_dispatch_event(
        db,
        company_id=current_user.company_id,
        event_type="ride.cancelled_by_employee",
        actor_type=current_user.role.value,
        actor_user_id=current_user.id,
        ride_id=ride.id,
        trip_id=trip.id if trip is not None else None,
        from_state=previous_ride_status,
        to_state=ride.status.value,
        reason="Cancelled by rider before pickup.",
    )
    if trip is not None and trip.status.value != previous_trip_status:
        record_dispatch_event(
            db,
            company_id=current_user.company_id,
            event_type="trip.cancelled",
            actor_type=current_user.role.value,
            actor_user_id=current_user.id,
            ride_id=ride.id,
            trip_id=trip.id,
            from_state=previous_trip_status,
            to_state=trip.status.value,
            reason="Trip cancelled because the last remaining rider cancelled before pickup.",
        )
    queue_notification(
        db,
        current_user.id,
        title="Ride cancelled",
        message="Your ride request was cancelled before pickup.",
        metadata={"ride_id": str(ride.id)},
    )
    db.add(ride)
    db.commit()
    db.refresh(ride)
    return serialize_ride_request(ride)


def fail_ride_request(
    db: Session,
    ride: RideRequest,
    failure_status: RideRequestStatus,
    reason: str,
) -> None:
    """Move a ride into a terminal failure state and notify admins/rider."""
    previous_ride_status = ride.status.value
    ride.status = failure_status
    record_dispatch_event(
        db,
        company_id=ride.company_id,
        event_type="ride.dispatch_failed",
        actor_type="system",
        ride_id=ride.id,
        trip_id=ride.trip_passenger.trip_id if ride.trip_passenger else None,
        from_state=previous_ride_status,
        to_state=failure_status.value,
        reason=reason,
        metadata={"failure_status": failure_status.value},
    )
    if ride.user_id is not None:
        queue_notification(
            db,
            ride.user_id,
            title="Ride dispatch issue",
            message=reason,
            metadata={"ride_id": str(ride.id), "status": failure_status.value},
        )
    create_admin_alert(
        db,
        ride.company_id,
        title="Ride dispatch failed",
        message=reason,
        severity="high",
        metadata={
            "ride_id": str(ride.id),
            "status": failure_status.value,
            "entity_type": "ride",
            "entity_id": str(ride.id),
        },
    )


def list_user_rides(db: Session, current_user: User) -> list[RideRequestSummary]:
    """Return ride history for the current user."""
    rides = db.scalars(
        select(RideRequest)
        .where(
            RideRequest.user_id == current_user.id,
            RideRequest.company_id == current_user.company_id,
        )
        .order_by(desc(RideRequest.requested_at))
    ).all()
    return [serialize_ride_request(ride) for ride in rides]


def get_active_ride(db: Session, current_user: User) -> RideRequestSummary | None:
    """Return the most recent open ride, if any."""
    ride = db.scalars(
        select(RideRequest)
        .where(
            RideRequest.user_id == current_user.id,
            RideRequest.company_id == current_user.company_id,
            RideRequest.status.in_(list(RIDE_OPEN_STATUSES)),
        )
        .order_by(desc(RideRequest.requested_at))
    ).first()
    if ride is None:
        return None
    return serialize_ride_request(ride)
