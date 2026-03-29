"""SLA monitoring and incident timeline schemas."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class SLABreachSummary(BaseModel):
    """Aggregated SLA breach information for one breach type."""

    breach_type: str
    title: str
    severity: str
    count: int
    threshold_label: str
    note: str
    sample_entity_id: str | None = None
    entity_type: str | None = None


class SLASnapshotSummary(BaseModel):
    """Current SLA monitoring snapshot for an admin company."""

    company_id: UUID
    generated_at: datetime
    open_breach_count: int
    health: str
    breaches: list[SLABreachSummary] = Field(default_factory=list)


class IncidentTimelineItem(BaseModel):
    """Admin timeline item for dispatch/SLA incidents."""

    id: UUID
    title: str | None = None
    message: str
    status: str
    severity: str
    kind: str
    breach_type: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None
    ride_id: UUID | None = None
    trip_id: UUID | None = None
    created_at: datetime | None = None
    resolved_at: datetime | None = None
