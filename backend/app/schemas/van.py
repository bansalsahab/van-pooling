"""Van schemas."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class VanSummary(BaseModel):
    """Fleet item summary for admin and driver views."""

    id: UUID
    license_plate: str
    capacity: int
    current_occupancy: int
    status: str
    driver_id: UUID | None = None
    driver_name: str | None = None
    last_location_update: datetime | None = None
    latitude: float | None = None
    longitude: float | None = None


class DriverLocationUpdate(BaseModel):
    """Driver location ping."""

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class DriverStatusUpdate(BaseModel):
    """Driver availability state update."""

    status: str


class AdminVanCreate(BaseModel):
    """Admin payload for creating a van."""

    license_plate: str = Field(min_length=3, max_length=20)
    capacity: int = Field(default=8, ge=1, le=40)
    driver_id: UUID | None = None
    status: str = "offline"
