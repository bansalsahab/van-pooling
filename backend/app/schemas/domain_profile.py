"""Schemas for runtime API domain profiling snapshots."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


DomainName = Literal["employee", "driver", "admin"]


class DomainProfileSummary(BaseModel):
    """Aggregated request profile for one product domain."""

    domain: DomainName
    sample_size: int
    request_count: int
    error_count: int
    slow_request_count: int
    error_rate_percent: float = Field(ge=0)
    slow_request_rate_percent: float = Field(ge=0)
    average_latency_ms: float | None = None
    p50_latency_ms: float | None = None
    p95_latency_ms: float | None = None
    last_updated_at: datetime | None = None


class DomainProfilingSnapshot(BaseModel):
    """Snapshot for all tracked domains."""

    generated_at: datetime
    max_samples_per_domain: int
    slow_request_threshold_ms: int
    profiles: list[DomainProfileSummary]

