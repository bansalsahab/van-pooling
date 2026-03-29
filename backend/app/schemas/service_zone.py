"""Service zone API schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class ServiceZoneCreate(BaseModel):
    """Payload to create a service-zone polygon."""

    name: str = Field(min_length=2, max_length=255)
    zone_type: str = Field(pattern="^(pickup|destination)$")
    polygon_geojson: dict[str, Any]
    notes: str | None = Field(default=None, max_length=1000)
    is_active: bool = True


class ServiceZoneUpdate(BaseModel):
    """Payload to update a service-zone polygon."""

    name: str | None = Field(default=None, min_length=2, max_length=255)
    polygon_geojson: dict[str, Any] | None = None
    notes: str | None = Field(default=None, max_length=1000)
    is_active: bool | None = None


class ServiceZoneSummary(BaseModel):
    """Response payload for service-zone polygons."""

    id: UUID
    company_id: UUID | None = None
    name: str
    zone_type: str
    polygon_geojson: dict[str, Any]
    notes: str | None = None
    is_active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None
