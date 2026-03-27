"""Ride request and dispatch helpers."""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.geo import haversine_distance_meters, parse_point, point_value
from app.models.company import Company
from app.models.ride_request import RideRequest, RideRequestStatus
from app.models.trip import Trip, TripStatus
from app.models.trip_passenger import PassengerStatus, TripPassenger
from app.models.user import User
from app.models.van import Van, VanStatus
from app.schemas.ride_request import (
    AdminPendingRideSummary,
    RideRequestCreate,
    RideRequestSummary,
)
from app.services.audit_service import record_dispatch_event
from app.services.lifecycle_service import (
    RIDE_OPEN_STATUSES,
    RIDE_PENDING_MATCH_STATUSES,
    RIDE_PENDING_SCHEDULED_STATUSES,
    TRIP_POOLABLE_STATUSES,
    ride_is_cancellable,
    ride_is_terminal,
    synchronize_trip_lifecycle,
    trip_is_blocking,
)
from app.services.notification_service import create_admin_alert, queue_notification
from app.services.routing_service import rebuild_trip_route


AVERAGE_SPEED_METERS_PER_MINUTE = 400.0
REJECTION_REASON_MESSAGES = {
    "trip_missing_van": "Trip is missing an assigned van.",
    "trip_is_blocking": "Trip is already full and cannot take another rider.",
    "driver_heartbeat_stale": "Driver location feed is stale.",
    "missing_trip_destination": "Trip destination data is incomplete.",
    "missing_van_coordinates": "Van does not have a live location fix.",
    "destination_outside_cluster": "Destination is too far from the pooled trip destination.",
    "schedule_incompatible": "Scheduled pickup windows do not overlap enough.",
    "pickup_outside_radius": "Pickup is outside the configured dispatch radius.",
    "detour_distance_too_high": "Pooling would add too much extra distance.",
    "detour_time_too_high": "Pooling would add too much detour time.",
    "van_status_ineligible": "Van is not in an eligible status.",
    "driver_missing": "Van does not have a driver assigned.",
    "van_full": "Van is already at full capacity.",
}


def _point(longitude: float, latitude: float):
    """Create a PostGIS-compatible geography point."""
    return point_value(longitude, latitude, settings.is_sqlite)


def _utc_now() -> datetime:
    """Return a naive UTC timestamp consistent with the existing schema."""
    return datetime.utcnow()


def _round_metric(value: float | None, digits: int = 4) -> float | None:
    if value is None:
        return None
    return round(value, digits)


def _resolve_matching_policy(db: Session, company_id) -> dict[str, Any]:
    """Resolve effective matching thresholds and weights for the company."""
    company = db.get(Company, company_id) if company_id else None
    return {
        "pickup_radius_meters": int(
            company.max_pickup_radius_meters
            if company and company.max_pickup_radius_meters
            else settings.MATCHING_PICKUP_RADIUS_METERS
        ),
        "destination_cluster_radius_meters": settings.MATCHING_DESTINATION_CLUSTER_RADIUS_METERS,
        "max_detour_minutes": int(
            company.max_detour_minutes
            if company and company.max_detour_minutes
            else settings.MATCHING_MAX_DETOUR_MINUTES
        ),
        "max_extra_distance_meters": settings.MATCHING_MAX_EXTRA_DISTANCE_METERS,
        "schedule_compatibility_minutes": settings.MATCHING_SCHEDULE_COMPATIBILITY_MINUTES,
        "stale_driver_heartbeat_seconds": settings.MATCHING_STALE_DRIVER_HEARTBEAT_SECONDS,
        "weights": {
            "pickup": settings.MATCHING_SCORE_PICKUP_WEIGHT,
            "destination": settings.MATCHING_SCORE_DESTINATION_WEIGHT,
            "detour": settings.MATCHING_SCORE_DETOUR_WEIGHT,
            "readiness": settings.MATCHING_SCORE_READINESS_WEIGHT,
        },
        "service_zone_configured": bool(company and company.service_zone),
        "service_zone_enforced": False,
        "policy_source": "company_override" if company else "global_defaults",
    }


def _score_breakdown(
    *,
    pickup_distance: float,
    destination_distance: float | None,
    extra_distance: float | None,
    extra_minutes: float | None,
    readiness_score: float,
    policy: dict[str, Any],
) -> dict[str, Any]:
    pickup_score = min(1.0, pickup_distance / max(1, policy["pickup_radius_meters"]))
    destination_score = (
        min(1.0, destination_distance / max(1, policy["destination_cluster_radius_meters"]))
        if destination_distance is not None
        else None
    )
    detour_score = None
    if extra_distance is not None and extra_minutes is not None:
        detour_distance_score = min(
            1.0,
            extra_distance / max(1, policy["max_extra_distance_meters"]),
        )
        detour_time_score = min(
            1.0,
            extra_minutes / max(1, policy["max_detour_minutes"]),
        )
        detour_score = (detour_distance_score + detour_time_score) / 2

    weights = policy["weights"]
    total_score = (
        pickup_score * weights["pickup"]
        + (destination_score or 0.0) * weights["destination"]
        + (detour_score or 0.0) * weights["detour"]
        + readiness_score * weights["readiness"]
    )
    return {
        "pickup_score": _round_metric(pickup_score),
        "destination_score": _round_metric(destination_score),
        "detour_score": _round_metric(detour_score),
        "readiness_score": _round_metric(readiness_score),
        "total_score": _round_metric(total_score),
    }


def _reason_labels(reasons: list[str]) -> list[str]:
    return [REJECTION_REASON_MESSAGES.get(reason, reason.replace("_", " ")) for reason in reasons]


def _matching_note(metadata: dict[str, Any]) -> str:
    outcome = metadata.get("outcome")
    selected = metadata.get("selected_candidate") or {}
    top_reasons = metadata.get("top_rejection_reasons") or []
    if outcome == "matched_pool":
        return (
            f"Pooled onto {selected.get('label') or 'an active trip'} because it had spare capacity "
            f"and the best combined score."
        )
    if outcome == "matched_new_trip":
        return (
            f"Assigned {selected.get('label') or 'the nearest eligible van'} as the best available vehicle."
        )
    if outcome == "scheduled_queued":
        return "Ride is queued until its scheduled dispatch window opens."
    if top_reasons:
        top_label = str(
            top_reasons[0].get("label", "no eligible candidate is available")
        ).strip()
        return f"Still waiting because {top_label.rstrip('.').lower()}."
    return "Waiting for an eligible van or pooled trip."


def _summarize_rejection_reasons(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counter: Counter[str] = Counter()
    for candidate in candidates:
        for reason in candidate.get("rejection_reasons", []):
            counter[reason] += 1
    return [
        {
            "reason": reason,
            "label": REJECTION_REASON_MESSAGES.get(reason, reason.replace("_", " ")),
            "count": count,
        }
        for reason, count in counter.most_common(4)
    ]


def _matching_metadata_base(
    ride: RideRequest,
    policy: dict[str, Any],
    *,
    dispatch_window_open: bool | None = None,
) -> dict[str, Any]:
    return {
        "evaluated_at": _utc_now().isoformat(),
        "scheduled": ride.scheduled_time is not None,
        "dispatch_window_open": dispatch_window_open,
        "pickup_address": ride.pickup_address,
        "destination_address": ride.destination_address,
        "policy": policy,
        "pool_candidates": [],
        "van_candidates": [],
        "selected_candidate": None,
        "top_rejection_reasons": [],
        "outcome": "pending_unmatched",
    }


def _apply_policy_advisories(metadata: dict[str, Any]) -> None:
    policy = metadata.get("policy") or {}
    advisories: list[str] = []
    if policy.get("service_zone_configured") and not policy.get("service_zone_enforced"):
        advisories.append(
            "Company service zones are configured but not yet enforced in matching."
        )
    if advisories:
        metadata["advisories"] = advisories


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
        dispatch_metadata=ride.dispatch_metadata or {},
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
        driver_acknowledged_at=(trip.accepted_at or trip.started_at) if trip else None,
    )


def _resolve_next_stop_address(route: dict) -> str | None:
    for item in route.get("pickup_sequence", []):
        if item.get("status") in {
            PassengerStatus.ASSIGNED.value,
            PassengerStatus.NOTIFIED.value,
        }:
            return item.get("pickup_address")
    return route.get("destination_address")


def _request_age_minutes(ride: RideRequest) -> int:
    if ride.requested_at is None:
        return 0
    return max(0, int((_utc_now() - ride.requested_at).total_seconds() // 60))


def _pending_dispatch_note(ride: RideRequest) -> str:
    if ride.dispatch_metadata and isinstance(ride.dispatch_metadata, dict):
        note = ride.dispatch_metadata.get("note")
        if isinstance(note, str) and note.strip():
            return note.strip()
    if ride.status in {
        RideRequestStatus.SCHEDULED_REQUESTED,
        RideRequestStatus.SCHEDULED_QUEUED,
    }:
        if ride.scheduled_time is not None:
            return "Waiting for the dispatch window to open."
        return "Scheduled ride is queued for later dispatch."
    if ride.status == RideRequestStatus.MATCHING_AT_DISPATCH_WINDOW:
        return "Dispatch window is open and the matcher is searching for a van."
    return "Waiting for an eligible van or pooled trip."


def serialize_admin_pending_ride(ride: RideRequest) -> AdminPendingRideSummary:
    """Convert a pending ride request into an admin operations summary."""
    summary = serialize_ride_request(ride)
    return AdminPendingRideSummary(
        **summary.model_dump(),
        rider_name=ride.user.name if ride.user else None,
        rider_email=ride.user.email if ride.user else None,
        rider_phone=ride.user.phone if ride.user else None,
        age_minutes=_request_age_minutes(ride),
        request_kind="scheduled" if ride.scheduled_time else "immediate",
        dispatch_note=_pending_dispatch_note(ride),
    )


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
    return _scheduled_time_compatible_with_policy(
        trip,
        scheduled_time,
        {
            "schedule_compatibility_minutes": settings.MATCHING_SCHEDULE_COMPATIBILITY_MINUTES,
        },
    )


def _scheduled_time_compatible_with_policy(
    trip: Trip,
    scheduled_time: datetime | None,
    policy: dict[str, Any],
) -> bool:
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
        int(policy["schedule_compatibility_minutes"]) * 60
    )


def _van_heartbeat_age_seconds(van: Van, now: datetime) -> float:
    if van.last_location_update is None:
        return float("inf")
    return max(0.0, (now - van.last_location_update).total_seconds())


def _van_readiness_score(van: Van, now: datetime, policy: dict[str, Any]) -> float:
    heartbeat_age = _van_heartbeat_age_seconds(van, now)
    heartbeat_ratio = min(
        1.0,
        heartbeat_age / max(1, int(policy["stale_driver_heartbeat_seconds"])),
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
    van: Van,
    pickup_distance: float,
    destination_distance: float,
    now: datetime,
) -> float:
    return _pool_candidate_score_with_policy(
        van,
        pickup_distance,
        destination_distance,
        now,
        {
            "pickup_radius_meters": settings.MATCHING_PICKUP_RADIUS_METERS,
            "destination_cluster_radius_meters": settings.MATCHING_DESTINATION_CLUSTER_RADIUS_METERS,
            "max_extra_distance_meters": settings.MATCHING_MAX_EXTRA_DISTANCE_METERS,
            "max_detour_minutes": settings.MATCHING_MAX_DETOUR_MINUTES,
            "stale_driver_heartbeat_seconds": settings.MATCHING_STALE_DRIVER_HEARTBEAT_SECONDS,
            "weights": {
                "pickup": settings.MATCHING_SCORE_PICKUP_WEIGHT,
                "destination": settings.MATCHING_SCORE_DESTINATION_WEIGHT,
                "detour": settings.MATCHING_SCORE_DETOUR_WEIGHT,
                "readiness": settings.MATCHING_SCORE_READINESS_WEIGHT,
            },
        },
    )


def _pool_candidate_score_with_policy(
    van: Van,
    pickup_distance: float,
    destination_distance: float,
    now: datetime,
    policy: dict[str, Any],
) -> float:
    extra_distance, extra_minutes = _estimate_detour_metrics(
        pickup_distance,
        destination_distance,
    )
    pickup_score = min(1.0, pickup_distance / max(1, int(policy["pickup_radius_meters"])))
    destination_score = min(
        1.0,
        destination_distance / max(1, int(policy["destination_cluster_radius_meters"])),
    )
    detour_distance_score = min(
        1.0,
        extra_distance / max(1, int(policy["max_extra_distance_meters"])),
    )
    detour_time_score = min(
        1.0,
        extra_minutes / max(1, int(policy["max_detour_minutes"])),
    )
    detour_score = (detour_distance_score + detour_time_score) / 2
    readiness_score = _van_readiness_score(van, now, policy)
    return (
        pickup_score * float(policy["weights"]["pickup"])
        + destination_score * float(policy["weights"]["destination"])
        + detour_score * float(policy["weights"]["detour"])
        + readiness_score * float(policy["weights"]["readiness"])
    )


def _new_trip_van_score(van: Van, pickup_distance: float, now: datetime) -> float:
    return _new_trip_van_score_with_policy(
        van,
        pickup_distance,
        now,
        {
            "pickup_radius_meters": settings.MATCHING_PICKUP_RADIUS_METERS,
            "stale_driver_heartbeat_seconds": settings.MATCHING_STALE_DRIVER_HEARTBEAT_SECONDS,
            "weights": {
                "pickup": settings.MATCHING_SCORE_PICKUP_WEIGHT,
                "readiness": settings.MATCHING_SCORE_READINESS_WEIGHT,
            },
        },
    )


def _new_trip_van_score_with_policy(
    van: Van,
    pickup_distance: float,
    now: datetime,
    policy: dict[str, Any],
) -> float:
    pickup_score = min(1.0, pickup_distance / max(1, int(policy["pickup_radius_meters"])))
    readiness_score = _van_readiness_score(van, now, policy)
    return (
        pickup_score * float(policy["weights"]["pickup"])
        + readiness_score * float(policy["weights"]["readiness"])
    )


def _compact_candidate(candidate: dict[str, Any] | None) -> dict[str, Any] | None:
    if not candidate:
        return None
    compact = {
        "candidate_type": candidate.get("candidate_type"),
        "label": candidate.get("label"),
        "trip_id": candidate.get("trip_id"),
        "van_id": candidate.get("van_id"),
        "score_breakdown": candidate.get("score_breakdown"),
        "metrics": candidate.get("metrics"),
    }
    return {key: value for key, value in compact.items() if value is not None}


def _compact_dispatch_event_metadata(metadata: dict[str, Any] | None) -> dict[str, Any]:
    if not metadata:
        return {}
    return {
        "outcome": metadata.get("outcome"),
        "note": metadata.get("note"),
        "selected_candidate": _compact_candidate(metadata.get("selected_candidate")),
        "top_rejection_reasons": metadata.get("top_rejection_reasons") or [],
        "policy": metadata.get("policy") or {},
        "candidate_counts": {
            "pool": len(metadata.get("pool_candidates") or []),
            "van": len(metadata.get("van_candidates") or []),
        },
    }


def _build_pool_candidate_record(
    trip: Trip,
    ride: RideRequest,
    policy: dict[str, Any],
    now: datetime,
) -> dict[str, Any]:
    ride_destination = parse_point(ride.destination)
    ride_pickup = parse_point(ride.pickup_location)
    van = trip.van
    heartbeat_age = _van_heartbeat_age_seconds(van, now) if van is not None else None
    candidate = {
        "candidate_type": "pooled_trip",
        "trip_id": str(trip.id),
        "van_id": str(trip.van_id) if trip.van_id is not None else None,
        "label": (
            f"{van.license_plate} on trip {str(trip.id)[:8]}"
            if van is not None
            else f"trip {str(trip.id)[:8]}"
        ),
        "trip_status": trip.status.value,
        "rejection_reasons": [],
        "accepted": False,
        "metrics": {
            "heartbeat_age_seconds": _round_metric(heartbeat_age, 2),
            "occupancy": van.current_occupancy if van is not None else None,
            "capacity": van.capacity if van is not None else None,
        },
    }
    reasons: list[str] = []
    if van is None:
        reasons.append("trip_missing_van")
    else:
        if van.status not in {VanStatus.AVAILABLE, VanStatus.ON_TRIP}:
            reasons.append("van_status_ineligible")
        if van.driver_id is None:
            reasons.append("driver_missing")
        if (van.current_occupancy or 0) >= van.capacity:
            reasons.append("van_full")
        if trip_is_blocking(trip):
            reasons.append("trip_is_blocking")
        if heartbeat_age is None or heartbeat_age > policy["stale_driver_heartbeat_seconds"]:
            reasons.append("driver_heartbeat_stale")

    trip_destination = _trip_destination_coordinates(trip)
    van_coordinates = parse_point(van.current_location) if van is not None else None
    if trip_destination is None:
        reasons.append("missing_trip_destination")
    if van_coordinates is None:
        reasons.append("missing_van_coordinates")

    destination_distance = None
    if ride_destination is not None and trip_destination is not None:
        destination_distance = haversine_distance_meters(
            ride_destination[0],
            ride_destination[1],
            trip_destination[0],
            trip_destination[1],
        )
        candidate["metrics"]["destination_distance_meters"] = _round_metric(
            destination_distance, 2
        )
        if destination_distance > policy["destination_cluster_radius_meters"]:
            reasons.append("destination_outside_cluster")

    if not _scheduled_time_compatible_with_policy(trip, ride.scheduled_time, policy):
        reasons.append("schedule_incompatible")

    pickup_distance = None
    if ride_pickup is not None and van_coordinates is not None:
        pickup_distance = haversine_distance_meters(
            ride_pickup[0],
            ride_pickup[1],
            van_coordinates[0],
            van_coordinates[1],
        )
        candidate["metrics"]["pickup_distance_meters"] = _round_metric(pickup_distance, 2)
        if pickup_distance > policy["pickup_radius_meters"]:
            reasons.append("pickup_outside_radius")

    extra_distance = None
    extra_minutes = None
    if pickup_distance is not None and destination_distance is not None:
        extra_distance, extra_minutes = _estimate_detour_metrics(
            pickup_distance,
            destination_distance,
        )
        candidate["metrics"]["extra_distance_meters"] = _round_metric(extra_distance, 2)
        candidate["metrics"]["extra_minutes"] = _round_metric(extra_minutes, 2)
        if extra_distance > policy["max_extra_distance_meters"]:
            reasons.append("detour_distance_too_high")
        if extra_minutes > policy["max_detour_minutes"]:
            reasons.append("detour_time_too_high")

    if not reasons and van is not None and pickup_distance is not None and destination_distance is not None:
        readiness_score = _van_readiness_score(van, now, policy)
        score_breakdown = _score_breakdown(
            pickup_distance=pickup_distance,
            destination_distance=destination_distance,
            extra_distance=extra_distance,
            extra_minutes=extra_minutes,
            readiness_score=readiness_score,
            policy=policy,
        )
        candidate["accepted"] = True
        candidate["score_breakdown"] = score_breakdown
    candidate["rejection_reasons"] = sorted(set(reasons))
    candidate["rejection_labels"] = _reason_labels(candidate["rejection_reasons"])
    return candidate


def _build_van_candidate_record(
    van: Van,
    ride: RideRequest,
    policy: dict[str, Any],
    now: datetime,
) -> dict[str, Any]:
    ride_pickup = parse_point(ride.pickup_location)
    heartbeat_age = _van_heartbeat_age_seconds(van, now)
    candidate = {
        "candidate_type": "available_van",
        "van_id": str(van.id),
        "label": van.license_plate,
        "van_status": van.status.value,
        "rejection_reasons": [],
        "accepted": False,
        "metrics": {
            "heartbeat_age_seconds": _round_metric(heartbeat_age, 2),
            "occupancy": van.current_occupancy,
            "capacity": van.capacity,
        },
    }
    reasons: list[str] = []
    if van.status != VanStatus.AVAILABLE:
        reasons.append("van_status_ineligible")
    if van.driver_id is None:
        reasons.append("driver_missing")
    if (van.current_occupancy or 0) >= van.capacity:
        reasons.append("van_full")
    if heartbeat_age > policy["stale_driver_heartbeat_seconds"]:
        reasons.append("driver_heartbeat_stale")

    van_coordinates = parse_point(van.current_location)
    if van_coordinates is None:
        reasons.append("missing_van_coordinates")

    pickup_distance = None
    if ride_pickup is not None and van_coordinates is not None:
        pickup_distance = haversine_distance_meters(
            ride_pickup[0],
            ride_pickup[1],
            van_coordinates[0],
            van_coordinates[1],
        )
        candidate["metrics"]["pickup_distance_meters"] = _round_metric(pickup_distance, 2)
        if pickup_distance > policy["pickup_radius_meters"]:
            reasons.append("pickup_outside_radius")

    if not reasons and pickup_distance is not None:
        readiness_score = _van_readiness_score(van, now, policy)
        candidate["accepted"] = True
        candidate["score_breakdown"] = _score_breakdown(
            pickup_distance=pickup_distance,
            destination_distance=None,
            extra_distance=None,
            extra_minutes=None,
            readiness_score=readiness_score,
            policy=policy,
        )
    candidate["rejection_reasons"] = sorted(set(reasons))
    candidate["rejection_labels"] = _reason_labels(candidate["rejection_reasons"])
    return candidate


def _find_poolable_trip(
    db: Session,
    ride: RideRequest,
    policy: dict[str, Any],
) -> tuple[Trip | None, list[dict[str, Any]], dict[str, Any] | None]:
    destination_coordinates = parse_point(ride.destination)
    pickup_coordinates = parse_point(ride.pickup_location)
    if destination_coordinates is None or pickup_coordinates is None:
        return None, [], None

    now = _utc_now()
    trips = db.scalars(
        select(Trip)
        .join(Van, Trip.van_id == Van.id)
        .where(
            Trip.company_id == ride.company_id,
            Trip.status.in_(list(TRIP_POOLABLE_STATUSES)),
        )
        .order_by(Trip.created_at.asc())
    ).all()

    best_trip: Trip | None = None
    best_candidate: dict[str, Any] | None = None
    best_score = float("inf")
    candidates: list[dict[str, Any]] = []
    for trip in trips:
        candidate = _build_pool_candidate_record(trip, ride, policy, now)
        candidates.append(candidate)
        if not candidate.get("accepted"):
            continue
        score = float((candidate.get("score_breakdown") or {}).get("total_score") or 0.0)
        if score < best_score:
            best_trip = trip
            best_candidate = candidate
            best_score = score

    return best_trip, candidates, best_candidate


def _find_best_available_van(
    db: Session,
    company_id,
    pickup_point,
    policy: dict[str, Any],
) -> tuple[Van | None, list[dict[str, Any]], dict[str, Any] | None]:
    ride = RideRequest(company_id=company_id, pickup_location=pickup_point)
    vans = db.scalars(
        select(Van).where(Van.company_id == company_id)
    ).all()
    if not vans:
        return None, [], None

    now = _utc_now()
    best_van: Van | None = None
    best_candidate: dict[str, Any] | None = None
    best_score = float("inf")
    candidates: list[dict[str, Any]] = []
    for van in vans:
        candidate = _build_van_candidate_record(van, ride, policy, now)
        candidates.append(candidate)
        if not candidate.get("accepted"):
            continue
        score = float((candidate.get("score_breakdown") or {}).get("total_score") or 0.0)
        if score < best_score:
            best_van = van
            best_candidate = candidate
            best_score = score

    return best_van, candidates, best_candidate


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
    decision_metadata: dict[str, Any] | None = None,
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
    if decision_metadata is not None:
        ride.dispatch_metadata = decision_metadata
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
            "dispatch_decision": _compact_dispatch_event_metadata(decision_metadata),
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
            "dispatch_decision": _compact_dispatch_event_metadata(decision_metadata),
        },
    )
    _notify_ride_assignment(db, ride, trip)


def _create_trip_for_ride(
    db: Session,
    current_user: User,
    ride: RideRequest,
    van: Van,
    decision_metadata: dict[str, Any] | None = None,
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
    if decision_metadata is not None:
        ride.dispatch_metadata = decision_metadata

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
            "dispatch_decision": _compact_dispatch_event_metadata(decision_metadata),
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
            "dispatch_decision": _compact_dispatch_event_metadata(decision_metadata),
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
    policy = _resolve_matching_policy(db, ride.company_id)
    dispatch_window_open = is_dispatch_window_open(ride)
    metadata = _matching_metadata_base(
        ride,
        policy,
        dispatch_window_open=dispatch_window_open,
    )
    _apply_policy_advisories(metadata)
    if current_user is None:
        ride.status = RideRequestStatus.FAILED_OPERATIONAL_ISSUE
        metadata["outcome"] = RideRequestStatus.FAILED_OPERATIONAL_ISSUE.value
        metadata["note"] = "Ride could not be matched because the rider account is missing."
        ride.dispatch_metadata = metadata
        return False

    if ride.scheduled_time is not None:
        if not dispatch_window_open:
            ride.status = RideRequestStatus.SCHEDULED_QUEUED
            metadata["outcome"] = "scheduled_queued"
            metadata["candidate_counts"] = {"pool": 0, "van": 0}
            metadata["note"] = _matching_note(metadata)
            ride.dispatch_metadata = metadata
            return False
        ride.status = RideRequestStatus.MATCHING_AT_DISPATCH_WINDOW
    else:
        ride.status = RideRequestStatus.MATCHING

    pooled_trip, pool_candidates, selected_pool_candidate = _find_poolable_trip(
        db,
        ride,
        policy,
    )
    metadata["pool_candidates"] = pool_candidates
    metadata["candidate_counts"] = {
        "pool": len(pool_candidates),
        "van": 0,
    }
    if pooled_trip is not None:
        metadata["selected_candidate"] = _compact_candidate(selected_pool_candidate)
        metadata["top_rejection_reasons"] = _summarize_rejection_reasons(pool_candidates)
        metadata["outcome"] = "matched_pool"
        metadata["note"] = _matching_note(metadata)
        ride.dispatch_metadata = metadata
        _assign_ride_to_trip(
            db,
            pooled_trip,
            ride,
            current_user,
            decision_metadata=metadata,
        )
        return True

    van, van_candidates, selected_van_candidate = _find_best_available_van(
        db,
        ride.company_id,
        ride.pickup_location,
        policy,
    )
    metadata["van_candidates"] = van_candidates
    metadata["candidate_counts"] = {
        "pool": len(pool_candidates),
        "van": len(van_candidates),
    }
    metadata["top_rejection_reasons"] = _summarize_rejection_reasons(
        pool_candidates + van_candidates
    )
    if van is not None:
        metadata["selected_candidate"] = _compact_candidate(selected_van_candidate)
        metadata["outcome"] = "matched_new_trip"
        metadata["note"] = _matching_note(metadata)
        ride.dispatch_metadata = metadata
        _create_trip_for_ride(
            db,
            current_user,
            ride,
            van,
            decision_metadata=metadata,
        )
        return True

    ride.estimated_wait_minutes = max(ride.estimated_wait_minutes or 10, 10)
    metadata["outcome"] = "pending_unmatched"
    metadata["note"] = _matching_note(metadata)
    ride.dispatch_metadata = metadata
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
    if is_scheduled:
        scheduled_metadata = _matching_metadata_base(
            ride,
            _resolve_matching_policy(db, current_user.company_id),
            dispatch_window_open=False,
        )
        scheduled_metadata["outcome"] = "scheduled_queued"
        scheduled_metadata["candidate_counts"] = {"pool": 0, "van": 0}
        _apply_policy_advisories(scheduled_metadata)
        scheduled_metadata["note"] = _matching_note(scheduled_metadata)
        ride.dispatch_metadata = scheduled_metadata
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
            "dispatch_decision": _compact_dispatch_event_metadata(ride.dispatch_metadata),
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
    metadata = (
        dict(ride.dispatch_metadata)
        if isinstance(ride.dispatch_metadata, dict)
        else _matching_metadata_base(
            ride,
            _resolve_matching_policy(db, ride.company_id),
            dispatch_window_open=is_dispatch_window_open(ride),
        )
    )
    metadata["evaluated_at"] = _utc_now().isoformat()
    metadata["outcome"] = failure_status.value
    metadata["failure_status"] = failure_status.value
    metadata["top_rejection_reasons"] = metadata.get("top_rejection_reasons") or _summarize_rejection_reasons(
        (metadata.get("pool_candidates") or []) + (metadata.get("van_candidates") or [])
    )
    metadata["candidate_counts"] = metadata.get("candidate_counts") or {
        "pool": len(metadata.get("pool_candidates") or []),
        "van": len(metadata.get("van_candidates") or []),
    }
    metadata["note"] = reason
    _apply_policy_advisories(metadata)
    ride.dispatch_metadata = metadata
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
        metadata={
            "failure_status": failure_status.value,
            "dispatch_decision": _compact_dispatch_event_metadata(metadata),
        },
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


def list_company_pending_requests(db: Session, company_id) -> list[AdminPendingRideSummary]:
    """Return unmatched or queued ride requests for admin dispatch review."""
    rides = db.scalars(
        select(RideRequest)
        .where(
            RideRequest.company_id == company_id,
            RideRequest.status.in_(
                list(RIDE_PENDING_MATCH_STATUSES | RIDE_PENDING_SCHEDULED_STATUSES)
            ),
        )
        .order_by(RideRequest.requested_at.asc())
    ).all()
    return [serialize_admin_pending_ride(ride) for ride in rides]


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
