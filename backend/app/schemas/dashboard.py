"""Dashboard schemas."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.trip import DriverTripSummary
from app.schemas.van import VanSummary


class AdminDashboardSummary(BaseModel):
    """Operational metrics for admins."""

    company_id: UUID
    employees_count: int
    drivers_count: int
    total_vans: int
    available_vans: int
    active_vans: int
    pending_requests: int
    active_trips: int
    open_alerts: int


class DriverScheduledWorkSummary(BaseModel):
    """Scheduled rides visible to a driver before pickup starts."""

    ride_id: UUID
    trip_id: UUID
    ride_status: str
    pickup_address: str
    destination_address: str
    scheduled_time: datetime | None = None
    dispatch_window_opens_at: datetime | None = None
    minutes_until_dispatch_window: int | None = None
    minutes_until_pickup: int | None = None
    schedule_phase: str | None = None
    assignment_timing_note: str | None = None
    delay_explanation: str | None = None
    passenger_name: str | None = None


class DriverDashboardSummary(BaseModel):
    """Driver home-screen snapshot."""

    driver_id: UUID
    driver_name: str
    van: VanSummary | None = None
    active_trip: DriverTripSummary | None = None
    upcoming_scheduled_work: list[DriverScheduledWorkSummary] = Field(default_factory=list)
