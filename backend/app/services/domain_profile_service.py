"""In-memory latency and error profiling for core API domains."""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Lock
from time import perf_counter
from typing import Iterable

from fastapi import FastAPI, Request
from starlette.responses import Response

from app.core.config import settings
from app.schemas.domain_profile import (
    DomainProfileSummary,
    DomainProfilingSnapshot,
)


TRACKED_DOMAINS: tuple[str, str, str] = ("employee", "driver", "admin")
MAX_SAMPLES_PER_DOMAIN = 600
SLOW_REQUEST_THRESHOLD_MS = 1200


@dataclass
class _DomainRuntimeProfile:
    samples_ms: deque[float] = field(default_factory=lambda: deque(maxlen=MAX_SAMPLES_PER_DOMAIN))
    request_count: int = 0
    error_count: int = 0
    slow_request_count: int = 0
    last_updated_at: datetime | None = None


_LOCK = Lock()
_PROFILE_STATE: dict[str, _DomainRuntimeProfile] = {
    domain: _DomainRuntimeProfile() for domain in TRACKED_DOMAINS
}


def reset_domain_profiles() -> None:
    """Reset in-memory profiles (used by tests)."""
    with _LOCK:
        for domain in TRACKED_DOMAINS:
            _PROFILE_STATE[domain] = _DomainRuntimeProfile()


def resolve_domain_from_path(path: str) -> str | None:
    """Map request path to a tracked product domain."""
    api_root = settings.API_V1_STR
    if path.startswith(f"{api_root}/rides"):
        return "employee"
    if path.startswith(f"{api_root}/driver"):
        return "driver"
    if path.startswith(f"{api_root}/admin"):
        return "admin"
    return None


def record_domain_request(domain: str, *, duration_ms: float, status_code: int) -> None:
    """Record one request sample for a domain."""
    if domain not in _PROFILE_STATE:
        return
    with _LOCK:
        profile = _PROFILE_STATE[domain]
        profile.samples_ms.append(duration_ms)
        profile.request_count += 1
        if status_code >= 400:
            profile.error_count += 1
        if duration_ms >= SLOW_REQUEST_THRESHOLD_MS:
            profile.slow_request_count += 1
        profile.last_updated_at = datetime.now(timezone.utc)


def snapshot_domain_profiles() -> DomainProfilingSnapshot:
    """Build a profiling snapshot for all tracked domains."""
    with _LOCK:
        profiles = [_build_profile_summary(domain, _PROFILE_STATE[domain]) for domain in TRACKED_DOMAINS]
    return DomainProfilingSnapshot(
        generated_at=datetime.now(timezone.utc),
        max_samples_per_domain=MAX_SAMPLES_PER_DOMAIN,
        slow_request_threshold_ms=SLOW_REQUEST_THRESHOLD_MS,
        profiles=profiles,
    )


def register_domain_profiling_middleware(app: FastAPI) -> None:
    """Attach latency/error profiling middleware to the API app."""

    @app.middleware("http")
    async def domain_profiling_middleware(request: Request, call_next) -> Response:
        domain = resolve_domain_from_path(request.url.path)
        if domain is None:
            return await call_next(request)

        started = perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        except Exception:
            status_code = 500
            raise
        finally:
            elapsed_ms = max((perf_counter() - started) * 1000.0, 0.0)
            record_domain_request(domain, duration_ms=elapsed_ms, status_code=status_code)


def _build_profile_summary(domain: str, profile: _DomainRuntimeProfile) -> DomainProfileSummary:
    request_count = profile.request_count
    error_count = profile.error_count
    slow_count = profile.slow_request_count
    sample_values = list(profile.samples_ms)
    return DomainProfileSummary(
        domain=domain,  # type: ignore[arg-type]
        sample_size=len(sample_values),
        request_count=request_count,
        error_count=error_count,
        slow_request_count=slow_count,
        error_rate_percent=_safe_percent(error_count, request_count),
        slow_request_rate_percent=_safe_percent(slow_count, request_count),
        average_latency_ms=_mean(sample_values),
        p50_latency_ms=_percentile(sample_values, 0.50),
        p95_latency_ms=_percentile(sample_values, 0.95),
        last_updated_at=profile.last_updated_at,
    )


def _safe_percent(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return round((numerator / denominator) * 100.0, 2)


def _mean(values: Iterable[float]) -> float | None:
    items = list(values)
    if not items:
        return None
    return round(sum(items) / len(items), 2)


def _percentile(values: list[float], ratio: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return round(ordered[0], 2)
    rank = (len(ordered) - 1) * ratio
    lower = int(rank)
    upper = min(lower + 1, len(ordered) - 1)
    if lower == upper:
        return round(ordered[lower], 2)
    weight = rank - lower
    interpolated = ordered[lower] + ((ordered[upper] - ordered[lower]) * weight)
    return round(interpolated, 2)
