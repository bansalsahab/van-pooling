"""Operational alert schemas."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class AlertSummary(BaseModel):
    """Admin-facing operational alert."""

    id: UUID
    title: str | None = None
    message: str
    status: str
    severity: str = "medium"
    kind: str = "operational_alert"
    entity_type: str | None = None
    entity_id: str | None = None
    ride_id: UUID | None = None
    trip_id: UUID | None = None
    created_at: datetime | None = None
    resolved_at: datetime | None = None
