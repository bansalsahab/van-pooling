"""Policy engine schemas for commute governance."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import Latitude, Longitude


class PolicyZoneBounds(BaseModel):
    """Bounding box for pickup or destination service-zone enforcement."""

    min_latitude: Latitude | None = None
    max_latitude: Latitude | None = None
    min_longitude: Longitude | None = None
    max_longitude: Longitude | None = None


class ServiceZonePolicy(BaseModel):
    """Company service-zone policy block."""

    enabled: bool = False
    pickup_bounds: PolicyZoneBounds | None = None
    destination_bounds: PolicyZoneBounds | None = None


class SchedulePolicy(BaseModel):
    """Rules for scheduled rides and dispatch timing."""

    min_lead_minutes: int = Field(default=15, ge=0, le=24 * 60)
    max_days_ahead: int = Field(default=14, ge=1, le=180)
    dispatch_cutoff_minutes_before_pickup: int = Field(
        default=10,
        ge=0,
        le=24 * 60,
    )


class CancellationPolicy(BaseModel):
    """Rules for employee cancellation behavior."""

    employee_cutoff_minutes_before_pickup: int = Field(default=5, ge=0, le=24 * 60)


class WomenSafetyWindowPolicy(BaseModel):
    """
    Women-safety window policy.

    V1 uses optional rider profile flags (`notification_preferences.is_women_rider`)
    and can also be applied to all riders for strict enterprise controls.
    """

    enabled: bool = False
    start_local_time: str = Field(default="20:00")
    end_local_time: str = Field(default="06:00")
    timezone: str = Field(default="Asia/Kolkata")
    requires_scheduled_rides: bool = False
    apply_to_all_riders: bool = False


class CommutePolicyConfig(BaseModel):
    """Canonical policy config payload for a company tenant."""

    model_config = ConfigDict(from_attributes=True)

    priority_by_user_role: dict[str, int] = Field(
        default_factory=lambda: {"admin": 1, "employee": 5, "driver": 10}
    )
    priority_by_team: dict[str, int] = Field(default_factory=dict)
    service_zone: ServiceZonePolicy = Field(default_factory=ServiceZonePolicy)
    schedule: SchedulePolicy = Field(default_factory=SchedulePolicy)
    cancellation: CancellationPolicy = Field(default_factory=CancellationPolicy)
    women_safety_window: WomenSafetyWindowPolicy = Field(
        default_factory=WomenSafetyWindowPolicy
    )
    updated_at: datetime | None = None
    updated_by_user_id: UUID | None = None


class PolicyViolation(BaseModel):
    """Policy evaluation violation details."""

    code: str
    message: str
    field: str | None = None


class PolicySimulationRequest(BaseModel):
    """Admin payload to simulate policy behavior before go-live changes."""

    pickup_latitude: Latitude
    pickup_longitude: Longitude
    destination_latitude: Latitude
    destination_longitude: Longitude
    scheduled_time: datetime | None = None
    role: str = "employee"
    team: str | None = None
    is_women_rider: bool = False


class PolicySimulationResponse(BaseModel):
    """Simulation result with explicit allow/deny reasoning."""

    allowed: bool
    dispatch_priority: int
    violations: list[PolicyViolation]
    policy: CommutePolicyConfig
