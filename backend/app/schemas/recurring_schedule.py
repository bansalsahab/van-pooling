"""Recurring ride schedule schemas."""
from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class RecurringLocationInput(BaseModel):
    """Address and coordinates for recurring route endpoints."""

    address: str = Field(min_length=3, max_length=500)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class RecurringRideRuleCreate(BaseModel):
    """Payload to create a recurring weekday schedule."""

    name: str = Field(min_length=2, max_length=255)
    weekdays: list[int] = Field(min_length=1, max_length=7)
    pickup_time_local: str = Field(pattern=r"^\d{2}:\d{2}$")
    timezone: str = Field(default="Asia/Kolkata", min_length=3, max_length=64)
    pickup: RecurringLocationInput
    destination: RecurringLocationInput


class RecurringRideRuleUpdate(BaseModel):
    """Payload to update recurring weekday schedule."""

    name: str | None = Field(default=None, min_length=2, max_length=255)
    weekdays: list[int] | None = Field(default=None, min_length=1, max_length=7)
    pickup_time_local: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    timezone: str | None = Field(default=None, min_length=3, max_length=64)
    status: str | None = Field(default=None, pattern="^(active|paused)$")
    pickup: RecurringLocationInput | None = None
    destination: RecurringLocationInput | None = None


class RecurringRideRuleSummary(BaseModel):
    """Recurring schedule response payload."""

    id: UUID
    user_id: UUID
    company_id: UUID | None = None
    name: str
    status: str
    weekdays: list[int]
    pickup_time_local: str
    timezone: str
    pickup: RecurringLocationInput
    destination: RecurringLocationInput
    last_generated_for_date: date | None = None
    next_pickup_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
