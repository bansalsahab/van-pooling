"""Dashboard schemas."""
from uuid import UUID

from pydantic import BaseModel

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


class DriverDashboardSummary(BaseModel):
    """Driver home-screen snapshot."""

    driver_id: UUID
    driver_name: str
    van: VanSummary | None = None
    active_trip: DriverTripSummary | None = None
