"""Trip schemas."""
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.maps import RoutePlan


class TripPassengerSummary(BaseModel):
    """Passenger stop data for a driver-facing trip."""

    ride_request_id: UUID
    user_id: UUID
    passenger_name: str | None = None
    status: str
    pickup_address: str | None = None
    destination_address: str | None = None
    pickup_stop_index: int
    dropoff_stop_index: int


class DriverTripSummary(BaseModel):
    """Trip summary shown to drivers."""

    id: UUID
    status: str
    van_id: UUID
    route: RoutePlan | dict[str, Any]
    estimated_duration_minutes: int | None = None
    started_at: datetime | None = None
    passenger_count: int = 0
    passengers: list[TripPassengerSummary] = Field(default_factory=list)


class TripSummary(BaseModel):
    """Admin-friendly summary of a trip."""

    id: UUID
    status: str
    van_id: UUID
    van_license_plate: str | None = None
    route: RoutePlan | dict[str, Any]
    estimated_duration_minutes: int | None = None
    started_at: datetime | None = None
    created_at: datetime | None = None
    passenger_count: int = 0
