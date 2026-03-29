"""Dashboard schemas."""
import enum
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


class KPIWindow(str, enum.Enum):
    """Supported admin KPI time windows."""

    TODAY = "today"
    SEVEN_DAYS = "7d"
    THIRTY_DAYS = "30d"


class AdminKPIValues(BaseModel):
    """Core operational KPI values for the selected window."""

    p95_wait_time_minutes: float | None = None
    on_time_pickup_percent: float | None = None
    seat_utilization_percent: float | None = None
    deadhead_km_per_trip: float | None = None
    dispatch_success_percent: float | None = None


class AdminKPICounters(BaseModel):
    """Denominator counters behind each KPI calculation."""

    rides_considered: int = 0
    scheduled_pickups_considered: int = 0
    trips_considered: int = 0
    dispatch_decisions_considered: int = 0


class AdminKPISummary(BaseModel):
    """Admin KPI snapshot response."""

    company_id: UUID
    window: KPIWindow
    window_start: datetime
    window_end: datetime
    generated_at: datetime
    metrics: AdminKPIValues
    counters: AdminKPICounters


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
