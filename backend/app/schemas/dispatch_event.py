"""Dispatch event schemas."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class DispatchEventSummary(BaseModel):
    """Admin-facing summary of a persisted dispatch event."""

    id: UUID
    company_id: UUID
    ride_id: UUID | None = None
    trip_id: UUID | None = None
    actor_user_id: UUID | None = None
    actor_name: str | None = None
    actor_type: str
    event_type: str
    from_state: str | None = None
    to_state: str | None = None
    reason: str | None = None
    metadata: dict = Field(default_factory=dict)
    created_at: datetime | None = None
