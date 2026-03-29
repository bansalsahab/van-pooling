"""Schemas for driver shifts and vehicle checks."""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class DriverShiftStartInput(BaseModel):
    """Payload to start a driver shift."""

    planned_end_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=1000)


class DriverShiftSummary(BaseModel):
    """Driver shift summary."""

    id: UUID
    company_id: UUID | None = None
    driver_id: UUID
    status: str
    scheduled_start_at: datetime | None = None
    scheduled_end_at: datetime | None = None
    clocked_in_at: datetime | None = None
    clocked_out_at: datetime | None = None
    duration_minutes: int | None = None
    notes: str | None = None
    source: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class DriverVehicleCheckCreate(BaseModel):
    """Payload to submit a vehicle check."""

    checklist: dict[str, bool]
    notes: str | None = Field(default=None, max_length=1500)
    status: str | None = Field(default=None, pattern="^(passed|failed)$")


class DriverVehicleCheckSummary(BaseModel):
    """Vehicle check submission summary."""

    id: UUID
    company_id: UUID | None = None
    driver_id: UUID
    van_id: UUID | None = None
    shift_id: UUID | None = None
    status: str
    checklist: dict[str, Any]
    failed_items: list[str]
    notes: str | None = None
    submitted_at: datetime | None = None
    source: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
