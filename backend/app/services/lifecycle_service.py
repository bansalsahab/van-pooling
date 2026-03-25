"""Shared lifecycle helpers for rides, trips, and dispatch decisions."""
from __future__ import annotations

from app.models.ride_request import RideRequestStatus
from app.models.trip import Trip, TripStatus
from app.models.trip_passenger import PassengerStatus
from app.models.van import VanStatus


LEGACY_RIDE_STATUS_MAP = {
    "PENDING": RideRequestStatus.REQUESTED.name,
    "pending": RideRequestStatus.REQUESTED.name,
    "MATCHED": RideRequestStatus.MATCHED.name,
    "matched": RideRequestStatus.MATCHED.name,
    "DRIVER_ASSIGNED": RideRequestStatus.MATCHED.name,
    "driver_assigned": RideRequestStatus.MATCHED.name,
    "DRIVER_ENROUTE": RideRequestStatus.DRIVER_EN_ROUTE.name,
    "driver_enroute": RideRequestStatus.DRIVER_EN_ROUTE.name,
    "PICKED_UP": RideRequestStatus.IN_TRANSIT.name,
    "picked_up": RideRequestStatus.IN_TRANSIT.name,
    "COMPLETED": RideRequestStatus.COMPLETED.name,
    "completed": RideRequestStatus.COMPLETED.name,
    "CANCELLED": RideRequestStatus.CANCELLED_BY_ADMIN.name,
    "cancelled": RideRequestStatus.CANCELLED_BY_ADMIN.name,
    "EXPIRED": RideRequestStatus.FAILED_OPERATIONAL_ISSUE.name,
    "expired": RideRequestStatus.FAILED_OPERATIONAL_ISSUE.name,
}

LEGACY_TRIP_STATUS_MAP = {
    "PLANNED": TripStatus.DISPATCH_READY.name,
    "planned": TripStatus.DISPATCH_READY.name,
    "ACTIVE": TripStatus.ACTIVE_TO_PICKUP.name,
    "active": TripStatus.ACTIVE_TO_PICKUP.name,
    "COMPLETED": TripStatus.COMPLETED.name,
    "completed": TripStatus.COMPLETED.name,
    "CANCELLED": TripStatus.CANCELLED.name,
    "cancelled": TripStatus.CANCELLED.name,
}

RIDE_TERMINAL_STATUSES = {
    RideRequestStatus.COMPLETED,
    RideRequestStatus.CANCELLED_BY_EMPLOYEE,
    RideRequestStatus.CANCELLED_BY_ADMIN,
    RideRequestStatus.NO_SHOW,
    RideRequestStatus.REASSIGNED,
    RideRequestStatus.FAILED_NO_CAPACITY,
    RideRequestStatus.FAILED_DRIVER_UNREACHABLE,
    RideRequestStatus.FAILED_OPERATIONAL_ISSUE,
}

RIDE_CANCELLABLE_STATUSES = {
    RideRequestStatus.REQUESTED,
    RideRequestStatus.MATCHING,
    RideRequestStatus.MATCHED,
    RideRequestStatus.DRIVER_EN_ROUTE,
    RideRequestStatus.ARRIVED_AT_PICKUP,
    RideRequestStatus.SCHEDULED_REQUESTED,
    RideRequestStatus.SCHEDULED_QUEUED,
    RideRequestStatus.MATCHING_AT_DISPATCH_WINDOW,
}

RIDE_OPEN_STATUSES = {
    RideRequestStatus.REQUESTED,
    RideRequestStatus.MATCHING,
    RideRequestStatus.MATCHED,
    RideRequestStatus.DRIVER_EN_ROUTE,
    RideRequestStatus.ARRIVED_AT_PICKUP,
    RideRequestStatus.PICKED_UP,
    RideRequestStatus.IN_TRANSIT,
    RideRequestStatus.ARRIVED_AT_DESTINATION,
    RideRequestStatus.DROPPED_OFF,
    RideRequestStatus.SCHEDULED_REQUESTED,
    RideRequestStatus.SCHEDULED_QUEUED,
    RideRequestStatus.MATCHING_AT_DISPATCH_WINDOW,
}

RIDE_PENDING_MATCH_STATUSES = {
    RideRequestStatus.REQUESTED,
    RideRequestStatus.MATCHING,
}

RIDE_PENDING_SCHEDULED_STATUSES = {
    RideRequestStatus.SCHEDULED_REQUESTED,
    RideRequestStatus.SCHEDULED_QUEUED,
    RideRequestStatus.MATCHING_AT_DISPATCH_WINDOW,
}

TRIP_TERMINAL_STATUSES = {
    TripStatus.COMPLETED,
    TripStatus.REASSIGNED,
    TripStatus.CANCELLED,
    TripStatus.FAILED_OPERATIONAL_ISSUE,
}

TRIP_ACTIVE_STATUSES = {
    TripStatus.DISPATCH_READY,
    TripStatus.ACTIVE_TO_PICKUP,
    TripStatus.ACTIVE_IN_TRANSIT,
    TripStatus.ACTIVE_MIXED,
}

TRIP_POOLABLE_STATUSES = {
    TripStatus.DISPATCH_READY,
    TripStatus.ACTIVE_TO_PICKUP,
    TripStatus.ACTIVE_IN_TRANSIT,
    TripStatus.ACTIVE_MIXED,
}


def ride_is_terminal(status: RideRequestStatus | str) -> bool:
    """Return whether a ride status is terminal."""
    return _coerce_ride_status(status) in RIDE_TERMINAL_STATUSES


def ride_is_cancellable(status: RideRequestStatus | str) -> bool:
    """Return whether a ride can still be cancelled."""
    return _coerce_ride_status(status) in RIDE_CANCELLABLE_STATUSES


def trip_is_active(status: TripStatus | str) -> bool:
    """Return whether a trip should be treated as active in dashboards."""
    return _coerce_trip_status(status) in TRIP_ACTIVE_STATUSES


def trip_is_poolable(status: TripStatus | str) -> bool:
    """Return whether a trip is a candidate for additional pooled riders."""
    return _coerce_trip_status(status) in TRIP_POOLABLE_STATUSES


def trip_is_blocking(trip: Trip) -> bool:
    """A trip blocks new pooling only when it is active and the van is full."""
    if trip.van is None or not trip_is_active(trip.status):
        return False
    return (trip.van.current_occupancy or 0) >= trip.van.capacity


def synchronize_trip_lifecycle(trip: Trip) -> None:
    """Derive trip and ride states from the current assignment set."""
    if trip.status in TRIP_TERMINAL_STATUSES:
        return

    assignments = [
        item
        for item in trip.trip_passengers
        if item.ride_request is not None
        and not ride_is_terminal(item.ride_request.status)
    ]
    if not assignments:
        historical_statuses = {item.status for item in trip.trip_passengers}
        if (
            PassengerStatus.DROPPED_OFF in historical_statuses
            or (
                trip.started_at is not None
                and PassengerStatus.NO_SHOW in historical_statuses
            )
        ):
            close_trip(trip)
        else:
            trip.status = TripStatus.CANCELLED
            if trip.van is not None:
                trip.van.status = VanStatus.AVAILABLE
                trip.van.current_occupancy = 0
        return

    pending_pickups = [
        item for item in assignments if item.status in {PassengerStatus.ASSIGNED, PassengerStatus.NOTIFIED}
    ]
    onboard = [item for item in assignments if item.status == PassengerStatus.PICKED_UP]
    dropped = [item for item in assignments if item.status == PassengerStatus.DROPPED_OFF]

    if trip.started_at is None:
        trip.status = TripStatus.DISPATCH_READY
    elif pending_pickups and onboard:
        trip.status = TripStatus.ACTIVE_MIXED
    elif pending_pickups:
        trip.status = TripStatus.ACTIVE_TO_PICKUP
    elif onboard or dropped:
        trip.status = TripStatus.ACTIVE_IN_TRANSIT
    else:
        trip.status = TripStatus.DISPATCH_READY

    has_pending_pickups = bool(pending_pickups)
    for assignment in assignments:
        ride = assignment.ride_request
        if assignment.status == PassengerStatus.DROPPED_OFF:
            if ride.status != RideRequestStatus.COMPLETED:
                ride.status = RideRequestStatus.DROPPED_OFF
            continue

        if assignment.status == PassengerStatus.PICKED_UP:
            if ride.status == RideRequestStatus.ARRIVED_AT_DESTINATION:
                ride.status = RideRequestStatus.ARRIVED_AT_DESTINATION
            elif has_pending_pickups:
                ride.status = RideRequestStatus.PICKED_UP
            else:
                ride.status = RideRequestStatus.IN_TRANSIT
            if assignment.actual_pickup_time and ride.actual_pickup_time is None:
                ride.actual_pickup_time = assignment.actual_pickup_time
            continue

        if assignment.status == PassengerStatus.NOTIFIED:
            ride.status = RideRequestStatus.ARRIVED_AT_PICKUP
            continue

        if trip.started_at is None:
            ride.status = RideRequestStatus.MATCHED
        else:
            ride.status = RideRequestStatus.DRIVER_EN_ROUTE


def close_trip(trip: Trip) -> None:
    """Mark a trip complete and release its van."""
    trip.status = TripStatus.COMPLETED
    if trip.van is not None:
        trip.van.status = VanStatus.AVAILABLE
        trip.van.current_occupancy = 0
    for assignment in trip.trip_passengers:
        if assignment.ride_request is None:
            continue
        if assignment.status == PassengerStatus.DROPPED_OFF:
            assignment.ride_request.status = RideRequestStatus.COMPLETED


def _coerce_ride_status(status: RideRequestStatus | str) -> RideRequestStatus:
    if isinstance(status, RideRequestStatus):
        return status
    return RideRequestStatus(status)


def _coerce_trip_status(status: TripStatus | str) -> TripStatus:
    if isinstance(status, TripStatus):
        return status
    return TripStatus(status)
