"""Google Maps and heuristic routing helpers."""
from __future__ import annotations

import json
import math
from datetime import datetime, timedelta
from typing import Any
from urllib import error, parse, request

from app.core.config import settings
from app.geo import haversine_distance_meters
from app.schemas.maps import GeocodeResponse, RoutePlan, RouteStep, RouteWaypoint


_CACHE_TTL = timedelta(minutes=10)
_maps_cache: dict[str, tuple[datetime, Any]] = {}


def geocode_address(address: str) -> GeocodeResponse | None:
    """Resolve an address through Google Maps when configured."""
    normalized = address.strip()
    if not normalized:
        return None

    cache_key = f"geocode::{normalized.lower()}"
    cached = _read_cache(cache_key)
    if cached is not None:
        return GeocodeResponse(**cached)

    if not settings.google_maps_enabled:
        return None

    query = parse.urlencode(
        {
            "address": normalized,
            "key": settings.GOOGLE_MAPS_API_KEY,
            "language": settings.GOOGLE_MAPS_LANGUAGE,
            "region": settings.GOOGLE_MAPS_REGION,
        }
    )
    url = f"https://maps.googleapis.com/maps/api/geocode/json?{query}"
    try:
        payload = _read_json(url)
    except RuntimeError:
        return None

    results = payload.get("results") or []
    if not results:
        return None

    first = results[0]
    location = ((first.get("geometry") or {}).get("location")) or {}
    geocode = GeocodeResponse(
        address=first.get("formatted_address") or normalized,
        latitude=float(location["lat"]),
        longitude=float(location["lng"]),
        place_id=first.get("place_id"),
        source="google_maps",
    )
    _write_cache(cache_key, geocode.model_dump(mode="json"))
    return geocode


def compute_route_plan(
    origin: RouteWaypoint,
    destination: RouteWaypoint,
    intermediates: list[RouteWaypoint] | None = None,
    travel_mode: str = "DRIVE",
) -> RoutePlan:
    """Compute a route plan using Google Maps, with a deterministic fallback."""
    stops = [origin, *(intermediates or []), destination]
    cache_key = "route::" + json.dumps(
        {
            "travel_mode": travel_mode,
            "stops": [stop.model_dump(mode="json") for stop in stops],
        },
        separators=(",", ":"),
        sort_keys=True,
    )
    cached = _read_cache(cache_key)
    if cached is not None:
        return RoutePlan(**cached)

    if settings.google_maps_enabled:
        google_route = _compute_google_route(origin, destination, intermediates or [], travel_mode)
        if google_route is not None:
            _write_cache(cache_key, google_route.model_dump(mode="json"))
            return google_route

    fallback = _build_fallback_route(origin, destination, intermediates or [], travel_mode)
    _write_cache(cache_key, fallback.model_dump(mode="json"))
    return fallback


def _compute_google_route(
    origin: RouteWaypoint,
    destination: RouteWaypoint,
    intermediates: list[RouteWaypoint],
    travel_mode: str,
) -> RoutePlan | None:
    """Call the Google Routes API."""
    body: dict[str, Any] = {
        "origin": _location_payload(origin),
        "destination": _location_payload(destination),
        "intermediates": [_location_payload(item) for item in intermediates],
        "travelMode": travel_mode.upper(),
        "languageCode": settings.GOOGLE_MAPS_LANGUAGE,
        "units": "METRIC",
    }
    if travel_mode.upper() == "DRIVE" and settings.GOOGLE_MAPS_USE_TRAFFIC:
        body["routingPreference"] = "TRAFFIC_AWARE_OPTIMAL"

    try:
        payload = _post_json(
            "https://routes.googleapis.com/directions/v2:computeRoutes",
            body,
            headers={
                "X-Goog-Api-Key": settings.GOOGLE_MAPS_API_KEY,
                "X-Goog-FieldMask": (
                    "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,"
                    "routes.legs.distanceMeters,routes.legs.duration,"
                    "routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration,"
                    "routes.legs.steps.navigationInstruction.instructions,"
                    "routes.legs.steps.polyline.encodedPolyline"
                ),
            },
        )
    except RuntimeError:
        return None

    routes = payload.get("routes") or []
    if not routes:
        return None

    selected = routes[0]
    legs = selected.get("legs") or []
    steps: list[RouteStep] = []
    for leg in legs:
        for step in leg.get("steps") or []:
            steps.append(
                RouteStep(
                    instruction=((step.get("navigationInstruction") or {}).get("instructions"))
                    or "Continue",
                    distance_meters=int(step.get("distanceMeters") or 0),
                    duration_seconds=_parse_google_duration(step.get("staticDuration") or step.get("duration")),
                    encoded_polyline=((step.get("polyline") or {}).get("encodedPolyline")),
                )
            )

    return RoutePlan(
        source="google_maps",
        travel_mode=travel_mode.upper(),
        traffic_aware=travel_mode.upper() == "DRIVE" and settings.GOOGLE_MAPS_USE_TRAFFIC,
        distance_meters=int(selected.get("distanceMeters") or 0),
        duration_seconds=_parse_google_duration(selected.get("duration")),
        duration_minutes=max(1, math.ceil(_parse_google_duration(selected.get("duration")) / 60)),
        encoded_polyline=((selected.get("polyline") or {}).get("encodedPolyline")),
        origin=origin,
        destination=destination,
        waypoints=intermediates,
        steps=steps,
    )


def _build_fallback_route(
    origin: RouteWaypoint,
    destination: RouteWaypoint,
    intermediates: list[RouteWaypoint],
    travel_mode: str,
) -> RoutePlan:
    """Build a deterministic route approximation without third-party calls."""
    ordered = [origin, *intermediates, destination]
    distance_meters = 0
    for current, following in zip(ordered, ordered[1:]):
        distance_meters += int(
            haversine_distance_meters(
                current.latitude,
                current.longitude,
                following.latitude,
                following.longitude,
            )
        )
    duration_seconds = max(180, int(distance_meters / 8.3))
    return RoutePlan(
        source="heuristic",
        travel_mode=travel_mode.upper(),
        traffic_aware=False,
        distance_meters=distance_meters,
        duration_seconds=duration_seconds,
        duration_minutes=max(1, math.ceil(duration_seconds / 60)),
        encoded_polyline=_encode_polyline(ordered),
        origin=origin,
        destination=destination,
        waypoints=intermediates,
        steps=[
            RouteStep(
                instruction=f"Proceed toward {stop.address}",
                distance_meters=int(
                    haversine_distance_meters(
                        current.latitude,
                        current.longitude,
                        stop.latitude,
                        stop.longitude,
                    )
                ),
                duration_seconds=max(
                    60,
                    int(
                        haversine_distance_meters(
                            current.latitude,
                            current.longitude,
                            stop.latitude,
                            stop.longitude,
                        )
                        / 8.3
                    ),
                ),
            )
            for current, stop in zip(ordered, ordered[1:])
        ],
        warnings=["Using heuristic route estimation because Google Maps routing is unavailable."],
    )


def _location_payload(point: RouteWaypoint) -> dict[str, Any]:
    return {
        "location": {
            "latLng": {
                "latitude": point.latitude,
                "longitude": point.longitude,
            }
        }
    }


def _read_json(url: str) -> dict[str, Any]:
    try:
        with request.urlopen(url, timeout=12) as response:
            return json.loads(response.read().decode("utf-8"))
    except (error.HTTPError, error.URLError, TimeoutError, ValueError) as exc:
        raise RuntimeError("Google Maps request failed.") from exc


def _post_json(url: str, body: dict[str, Any], headers: dict[str, str] | None = None) -> dict[str, Any]:
    payload = json.dumps(body).encode("utf-8")
    request_headers = {"Content-Type": "application/json", **(headers or {})}
    req = request.Request(url, data=payload, headers=request_headers, method="POST")
    try:
        with request.urlopen(req, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))
    except (error.HTTPError, error.URLError, TimeoutError, ValueError) as exc:
        raise RuntimeError("HTTP JSON request failed.") from exc


def _parse_google_duration(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        return int(value)
    text = str(value).strip()
    if text.endswith("s"):
        text = text[:-1]
    try:
        return int(float(text))
    except ValueError:
        return 0


def _encode_polyline(points: list[RouteWaypoint]) -> str | None:
    if len(points) < 2:
        return None

    result: list[str] = []
    previous_lat = 0
    previous_lng = 0
    for point in points:
        lat = int(round(point.latitude * 1e5))
        lng = int(round(point.longitude * 1e5))
        for delta in (lat - previous_lat, lng - previous_lng):
            shifted = delta << 1
            if delta < 0:
                shifted = ~shifted
            while shifted >= 0x20:
                result.append(chr((0x20 | (shifted & 0x1F)) + 63))
                shifted >>= 5
            result.append(chr(shifted + 63))
        previous_lat = lat
        previous_lng = lng
    return "".join(result)


def _read_cache(cache_key: str) -> Any | None:
    cached = _maps_cache.get(cache_key)
    if not cached:
        return None
    expires_at, payload = cached
    if datetime.utcnow() > expires_at:
        _maps_cache.pop(cache_key, None)
        return None
    return payload


def _write_cache(cache_key: str, payload: Any) -> None:
    _maps_cache[cache_key] = (datetime.utcnow() + _CACHE_TTL, payload)
