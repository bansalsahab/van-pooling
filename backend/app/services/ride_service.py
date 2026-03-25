"""Ride request service helpers."""
from datetime import datetime, timedelta
from decimal import Decimal

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
from app.services.routing_service import rebuild_trip_route


def _point(longitude: float, latitude: float):
    """Create a PostGIS-compatible geography point."""
    return point_value(longitude, latitude, settings.is_sqlite)


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
        route_distance_meters=route.get("distance_meters") or trip.total_distance_meters if trip else None,
        route_duration_minutes=route.get("duration_minutes") or trip.estimated_duration_minutes if trip else None,
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


def _find_poolable_trip(
    db: Session,
    current_user: User,
    destination_point,
    pickup_point,
    scheduled_time: datetime | None,
) -> Trip | None:
    """Find a compatible trip with spare capacity and aligned direction."""
    destination_coordinates = parse_point(destination_point)
    pickup_coordinates = parse_point(pickup_point)
    if destination_coordinates is None or pickup_coordinates is None:
        return None

    trips = db.scalars(
        select(Trip)
        .join(Van, Trip.van_id == Van.id)
        .where(
            Trip.company_id == current_user.company_id,
            Trip.status.in_([TripStatus.PLANNED, TripStatus.ACTIVE]),
            Van.current_occupancy < Van.capacity,
        )
        .order_by(Trip.created_at.asc())
    ).all()

    best_trip: Trip | None = None
    best_score = float("inf")
    for trip in trips:
        trip_destination = _trip_destination_coordinates(trip)
        van_coordinates = parse_point(trip.van.current_location) if trip.van is not None else None
        if trip_destination is None or van_coordinates is None:
            continue

        destination_distance = haversine_distance_meters(
            destination_coordinates[0],
            destination_coordinates[1],
            trip_destination[0],
            trip_destination[1],
        )
        if destination_distance > 1_200:
            continue

        if not _scheduled_time_compatible(trip, scheduled_time):
            continue

        pickup_distance = haversine_distance_meters(
            pickup_coordinates[0],
            pickup_coordinates[1],
            van_coordinates[0],
            van_coordinates[1],
        )
        if pickup_distance > settings.MATCHING_PICKUP_RADIUS_METERS * 4:
            continue

        score = (destination_distance * 2) + pickup_distance
        if score < best_score:
            best_trip = trip
            best_score = score

    return best_trip


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
    return abs((anchor - scheduled_time).total_seconds()) <= 20 * 60


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


def _find_best_available_van(
    db: Session,
    company_id,
    pickup_point,
) -> Van | None:
    """Pick the nearest available van for a new trip."""
    if settings.is_sqlite:
        pickup_coordinates = parse_point(pickup_point)
        vans = db.scalars(
            select(Van).where(
                Van.company_id == company_id,
                Van.status == VanStatus.AVAILABLE,
                Van.current_occupancy < Van.capacity,
            )
        ).all()
        if pickup_coordinates is None:
            return vans[0] if vans else None

        pickup_latitude, pickup_longitude = pickup_coordinates
        sorted_vans = sorted(
            vans,
            key=lambda van: _distance_to_van(
                van,
                pickup_latitude,
                pickup_longitude,
            ),
        )
        return sorted_vans[0] if sorted_vans else None

    return db.scalars(
        select(Van)
        .where(
            Van.company_id == company_id,
            Van.status == VanStatus.AVAILABLE,
            Van.current_occupancy < Van.capacity,
        )
        .order_by(func.ST_Distance(Van.current_location, pickup_point))
    ).first()


def _distance_to_van(van: Van, pickup_latitude: float, pickup_longitude: float) -> float:
    """Return the distance between a pickup and a van location."""
    van_coordinates = parse_point(van.current_location)
    if van_coordinates is None:
        return float("inf")
    van_latitude, van_longitude = van_coordinates
    return haversine_distance_meters(
        pickup_latitude,
        pickup_longitude,
        van_latitude,
        van_longitude,
    )


def _assign_ride_to_trip(
    db: Session,
    trip: Trip,
    ride: RideRequest,
    current_user: User,
) -> None:
    """Attach a ride request to an existing trip."""
    van = trip.van
    if van is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Trip has no assigned van.",
        )

    next_pickup_index = max(
        [item.pickup_stop_index for item in trip.trip_passengers],
        default=0,
    ) + 1
    next_dropoff_index = max(
        [item.dropoff_stop_index for item in trip.trip_passengers],
        default=1,
    ) + 1

    assignment = TripPassenger(
        trip_id=trip.id,
        ride_request_id=ride.id,
        user_id=current_user.id,
        pickup_stop_index=next_pickup_index,
        dropoff_stop_index=next_dropoff_index,
        status=PassengerStatus.ASSIGNED,
    )

    van.current_occupancy = min(van.capacity, (van.current_occupancy or 0) + 1)
    van.status = VanStatus.ON_TRIP

    ride.status = RideRequestStatus.MATCHED
    ride.estimated_wait_minutes = min(ride.estimated_wait_minutes or 8, 8)

    db.add(assignment)
    db.add(van)
    db.add(trip)
    db.add(ride)
    db.flush()
    rebuild_trip_route(db, trip)


def _create_trip_for_ride(
    db: Session,
    current_user: User,
    ride: RideRequest,
    van: Van,
) -> None:
    """Create a fresh trip for a new ride request."""
    trip = Trip(
        van_id=van.id,
        company_id=current_user.company_id,
        status=TripStatus.PLANNED,
        route={},
        estimated_duration_minutes=20,
    )
    db.add(trip)
    db.flush()

    assignment = TripPassenger(
        trip_id=trip.id,
        ride_request_id=ride.id,
        user_id=current_user.id,
        pickup_stop_index=1,
        dropoff_stop_index=2,
        status=PassengerStatus.ASSIGNED,
    )

    van.current_occupancy = 1
    van.status = VanStatus.ON_TRIP

    ride.status = RideRequestStatus.DRIVER_ASSIGNED
    ride.estimated_wait_minutes = min(ride.estimated_wait_minutes or 6, 6)

    db.add(assignment)
    db.add(van)
    db.add(trip)
    db.add(ride)
    db.flush()
    rebuild_trip_route(db, trip)
    if trip.estimated_duration_minutes:
        ride.estimated_wait_minutes = min(ride.estimated_wait_minutes or 6, trip.estimated_duration_minutes)


def create_ride_request(
    db: Session,
    current_user: User,
    payload: RideRequestCreate,
) -> RideRequestSummary:
    """Create a pending ride request for a signed-in employee."""
    if current_user.company_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not attached to a company.",
        )

    pickup_point = _point(payload.pickup.longitude, payload.pickup.latitude)
    destination_point = _point(payload.destination.longitude, payload.destination.latitude)

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
        status=RideRequestStatus.PENDING,
        scheduled_time=payload.scheduled_time,
        expires_at=datetime.utcnow()
        + timedelta(seconds=settings.MATCHING_AGGREGATION_WINDOW_SECONDS),
        estimated_wait_minutes=6 if available_vans else 12,
        estimated_cost=Decimal("0.00"),
    )

    db.add(ride)
    db.flush()

    pooled_trip = _find_poolable_trip(
        db,
        current_user,
        destination_point=destination_point,
        pickup_point=pickup_point,
        scheduled_time=payload.scheduled_time,
    )
    if pooled_trip is not None:
        _assign_ride_to_trip(db, pooled_trip, ride, current_user)
    else:
        van = _find_best_available_van(db, current_user.company_id, pickup_point)
        if van is not None:
            _create_trip_for_ride(db, current_user, ride, van)

    db.commit()
    db.refresh(ride)
    return serialize_ride_request(ride)


def list_user_rides(db: Session, current_user: User) -> list[RideRequestSummary]:
    """Return ride history for the current user."""
    rides = db.scalars(
        select(RideRequest)
        .where(RideRequest.user_id == current_user.id)
        .order_by(desc(RideRequest.requested_at))
    ).all()
    return [serialize_ride_request(ride) for ride in rides]


def get_active_ride(db: Session, current_user: User) -> RideRequestSummary | None:
    """Return the most recent active ride, if any."""
    ride = db.scalars(
        select(RideRequest)
        .where(
            RideRequest.user_id == current_user.id,
            RideRequest.status.in_(
                [
                    RideRequestStatus.PENDING,
                    RideRequestStatus.MATCHED,
                    RideRequestStatus.DRIVER_ASSIGNED,
                    RideRequestStatus.DRIVER_ENROUTE,
                    RideRequestStatus.PICKED_UP,
                ]
            ),
        )
        .order_by(desc(RideRequest.requested_at))
    ).first()
    if ride is None:
        return None
    return serialize_ride_request(ride)
