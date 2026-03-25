"""Admin dispatch operation schemas."""
from uuid import UUID

from pydantic import BaseModel, Field


class OptionalReasonInput(BaseModel):
    """Optional free-text reason for an operational action."""

    reason: str | None = Field(default=None, max_length=500)


class TripReassignInput(BaseModel):
    """Payload for moving a trip to another van."""

    van_id: UUID
    reason: str | None = Field(default=None, max_length=500)
