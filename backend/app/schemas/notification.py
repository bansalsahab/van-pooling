"""Notification schemas."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class NotificationSummary(BaseModel):
    """User-facing notification summary."""

    id: UUID
    type: str
    title: str | None = None
    message: str
    status: str
    kind: str | None = None
    breach_type: str | None = None
    severity: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None
    ride_id: UUID | None = None
    trip_id: UUID | None = None
    created_at: datetime | None = None
    sent_at: datetime | None = None
    read_at: datetime | None = None


class NotificationFeed(BaseModel):
    """Notification inbox payload with unread count."""

    items: list[NotificationSummary]
    unread_count: int
