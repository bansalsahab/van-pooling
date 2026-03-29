"""Audit export schemas."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class AuditExportFormat(str, Enum):
    """Supported audit export output formats."""

    JSON = "json"
    CSV = "csv"


class AuditExportRecord(BaseModel):
    """Single tenant-scoped audit record entry."""

    source: str
    occurred_at: datetime | None = None
    event_type: str
    actor_type: str | None = None
    actor_user_id: UUID | None = None
    ride_id: UUID | None = None
    trip_id: UUID | None = None
    status: str | None = None
    severity: str | None = None
    reason: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class AuditExportResponse(BaseModel):
    """Signed JSON response for audit export downloads."""

    company_id: UUID
    generated_at: datetime
    record_count: int
    signature: str
    signature_algorithm: str = "hmac-sha256"
    records: list[AuditExportRecord]

