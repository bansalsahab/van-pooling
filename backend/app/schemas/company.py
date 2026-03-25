"""Company schemas."""
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class CompanySummary(BaseModel):
    """Company snapshot returned to clients."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    domain: str
    max_pickup_radius_meters: int
    max_detour_minutes: int
