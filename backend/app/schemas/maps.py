"""Maps and routing schemas."""
from typing import Literal

from pydantic import BaseModel, Field


class Coordinate(BaseModel):
    """Latitude/longitude pair."""

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class RouteWaypoint(BaseModel):
    """A named point used in routing."""

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    address: str
    label: str | None = None
    kind: Literal["origin", "pickup", "destination", "van", "stop"] = "stop"
    status: str | None = None


class RouteStep(BaseModel):
    """Single instruction item from a route response."""

    instruction: str
    distance_meters: int = 0
    duration_seconds: int = 0
    encoded_polyline: str | None = None


class RoutePlan(BaseModel):
    """Normalized route payload shared with the frontend."""

    source: Literal["google_maps", "heuristic"]
    travel_mode: str = "DRIVE"
    traffic_aware: bool = False
    distance_meters: int = 0
    duration_seconds: int = 0
    duration_minutes: int = 0
    encoded_polyline: str | None = None
    origin: RouteWaypoint | None = None
    destination: RouteWaypoint | None = None
    waypoints: list[RouteWaypoint] = Field(default_factory=list)
    steps: list[RouteStep] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class GeocodeRequest(BaseModel):
    """Resolve a free-form address into coordinates."""

    address: str = Field(min_length=3, max_length=500)


class GeocodeResponse(BaseModel):
    """Geocoding result."""

    address: str
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    place_id: str | None = None
    source: Literal["google_maps", "fallback"]


class RoutePreviewRequest(BaseModel):
    """Preview a route between user-selected points."""

    origin: RouteWaypoint
    destination: RouteWaypoint
    intermediates: list[RouteWaypoint] = Field(default_factory=list)
    travel_mode: str = "DRIVE"
