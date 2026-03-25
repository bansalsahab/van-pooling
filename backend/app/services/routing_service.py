"""Trip route assembly helpers."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.geo import parse_point
from app.models.trip import Trip
from app.models.trip_passenger import PassengerStatus
from app.schemas.maps import RouteWaypoint
from app.services.maps_service import compute_route_plan


def rebuild_trip_route(db: Session, trip: Trip) -> None:
    """Recalculate a trip route payload from current assignments and van state."""
    del db  # Route calculation only needs ORM-loaded objects for now.

    assignments = sorted(
        [
            item
            for item in trip.trip_passengers
            if item.ride_request is not None and item.status != PassengerStatus.DROPPED_OFF
        ],
        key=lambda item: item.pickup_stop_index,
    )

    if not assignments:
        trip.route = {
            "source": "heuristic",
            "travel_mode": "DRIVE",
            "traffic_aware": False,
            "distance_meters": 0,
            "duration_seconds": 0,
            "duration_minutes": 0,
            "origin": None,
            "destination": None,
            "waypoints": [],
            "steps": [],
            "pickup_sequence": [],
            "passenger_count": 0,
            "updated_at": datetime.utcnow().isoformat(),
        }
        trip.total_distance_meters = 0
        trip.estimated_duration_minutes = 0
        return

    destination_request = assignments[0].ride_request
    destination_coordinates = parse_point(destination_request.destination)
    first_pickup_coordinates = parse_point(assignments[0].ride_request.pickup_location)
    van_coordinates = parse_point(trip.van.current_location) if trip.van is not None else None
    if destination_coordinates is None or first_pickup_coordinates is None:
        trip.route = {
            "source": "heuristic",
            "travel_mode": "DRIVE",
            "traffic_aware": False,
            "distance_meters": 0,
            "duration_seconds": 0,
            "duration_minutes": 0,
            "origin": None,
            "destination": None,
            "waypoints": [],
            "steps": [],
            "pickup_sequence": [],
            "passenger_count": len(assignments),
            "updated_at": datetime.utcnow().isoformat(),
            "warnings": ["Trip routing data is incomplete for one or more ride requests."],
        }
        trip.total_distance_meters = 0
        trip.estimated_duration_minutes = 0
        return

    origin = _waypoint_from_coordinates(
        latitude=(van_coordinates[0] if van_coordinates else first_pickup_coordinates[0]),
        longitude=(van_coordinates[1] if van_coordinates else first_pickup_coordinates[1]),
        address=trip.van.license_plate if trip.van is not None else assignments[0].ride_request.pickup_address,
        label="Current van position" if trip.van is not None else "Trip origin",
        kind="van" if trip.van is not None else "origin",
        status=trip.status.value,
    )
    destination = _waypoint_from_coordinates(
        latitude=destination_coordinates[0],
        longitude=destination_coordinates[1],
        address=destination_request.destination_address,
        label="Shared destination",
        kind="destination",
        status=destination_request.status.value,
    )

    pending_pickups = [
        _waypoint_from_coordinates(
            latitude=pickup_coordinates[0],
            longitude=pickup_coordinates[1],
            address=item.ride_request.pickup_address,
            label=item.user.name if item.user is not None else "Passenger pickup",
            kind="pickup",
            status=item.status.value,
        )
        for item in assignments
        if item.status in {PassengerStatus.ASSIGNED, PassengerStatus.NOTIFIED}
        and (pickup_coordinates := parse_point(item.ride_request.pickup_location)) is not None
    ]

    route_plan = compute_route_plan(
        origin=origin,
        destination=destination,
        intermediates=pending_pickups,
    )

    trip.route = {
        **route_plan.model_dump(mode="json"),
        "destination_address": destination.address,
        "destination_latitude": destination.latitude,
        "destination_longitude": destination.longitude,
        "pickup_sequence": [
            {
                "ride_request_id": str(item.ride_request_id),
                "user_id": str(item.user_id),
                "passenger_name": item.user.name if item.user else None,
                "pickup_address": item.ride_request.pickup_address,
                "pickup_latitude": (parse_point(item.ride_request.pickup_location) or (None, None))[0],
                "pickup_longitude": (parse_point(item.ride_request.pickup_location) or (None, None))[1],
                "destination_address": item.ride_request.destination_address,
                "destination_latitude": (parse_point(item.ride_request.destination) or (None, None))[0],
                "destination_longitude": (parse_point(item.ride_request.destination) or (None, None))[1],
                "status": item.status.value,
            }
            for item in assignments
        ],
        "passenger_count": len(assignments),
        "updated_at": datetime.utcnow().isoformat(),
    }
    trip.total_distance_meters = route_plan.distance_meters
    trip.estimated_duration_minutes = route_plan.duration_minutes


def _waypoint_from_coordinates(
    latitude: float,
    longitude: float,
    address: str,
    label: str,
    kind: str,
    status: str | None = None,
) -> RouteWaypoint:
    return RouteWaypoint(
        latitude=latitude,
        longitude=longitude,
        address=address,
        label=label,
        kind=kind,
        status=status,
    )
