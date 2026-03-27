"""Ride request schemas."""
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class LocationInput(BaseModel):
    """Lat/lng plus label for a pickup or destination."""

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    address: str = Field(min_length=3, max_length=500)


class RideRequestCreate(BaseModel):
    """Payload for creating a ride request."""

    pickup: LocationInput
    destination: LocationInput
    scheduled_time: datetime | None = None


class RideRequestSummary(BaseModel):
    """Simplified ride request response."""

    id: UUID
    status: str
    pickup_address: str
    destination_address: str
    scheduled_time: datetime | None = None
    requested_at: datetime | None = None
    estimated_wait_minutes: int | None = None
    estimated_cost: Decimal | None = None
    trip_id: UUID | None = None
    van_id: UUID | None = None
    van_license_plate: str | None = None
    driver_name: str | None = None
    pickup_latitude: float | None = None
    pickup_longitude: float | None = None
    destination_latitude: float | None = None
    destination_longitude: float | None = None
    van_latitude: float | None = None
    van_longitude: float | None = None
    van_last_location_update: datetime | None = None
    route_polyline: str | None = None
    route_distance_meters: int | None = None
    route_duration_minutes: int | None = None
    next_stop_address: str | None = None
    driver_acknowledged_at: datetime | None = None


class AdminPendingRideSummary(RideRequestSummary):
    """Admin-facing summary for unmatched or queued ride requests."""

    rider_name: str | None = None
    rider_email: str | None = None
    rider_phone: str | None = None
    age_minutes: int = 0
    request_kind: str = "immediate"
    dispatch_note: str | None = None
