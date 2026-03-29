"""Policy engine services for commute governance."""
from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from app.database import engine
from app.models.company import Company
from app.models.ride_request import RideRequest
from app.models.user import User
from app.schemas.policy import (
    CommutePolicyConfig,
    PolicySimulationRequest,
    PolicySimulationResponse,
    PolicyViolation,
    PolicyZoneBounds,
)


DEFAULT_POLICY_CONFIG = CommutePolicyConfig()


def ensure_company_policy_schema() -> None:
    """Backfill policy_config column for local development databases."""
    with engine.begin() as connection:
        inspector = inspect(connection)
        if "companies" not in inspector.get_table_names():
            return

        columns = {column["name"] for column in inspector.get_columns("companies")}
        if "policy_config" not in columns:
            connection.execute(text("ALTER TABLE companies ADD COLUMN policy_config JSON"))


def get_company_policy(db: Session, company_id) -> CommutePolicyConfig:
    """Return normalized policy config for one company."""
    company = db.get(Company, company_id)
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found.",
        )
    return _normalized_policy_from_company(company)


def update_company_policy(
    db: Session,
    company_id,
    payload: CommutePolicyConfig,
    *,
    actor_user_id=None,
) -> CommutePolicyConfig:
    """Persist company policy updates."""
    company = db.get(Company, company_id)
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found.",
        )

    policy_payload = payload.model_dump(mode="json", exclude_none=True)
    policy_payload["updated_at"] = datetime.utcnow().isoformat()
    policy_payload["updated_by_user_id"] = str(actor_user_id) if actor_user_id else None
    normalized_policy = _normalized_policy(policy_payload)
    company.policy_config = normalized_policy.model_dump(mode="json", exclude_none=True)
    db.add(company)
    db.commit()
    db.refresh(company)
    return _normalized_policy_from_company(company)


def evaluate_policy_for_ride_request(
    policy: CommutePolicyConfig,
    *,
    pickup_latitude: float,
    pickup_longitude: float,
    destination_latitude: float,
    destination_longitude: float,
    scheduled_time: datetime | None,
    reference_time: datetime | None = None,
    role: str = "employee",
    team: str | None = None,
    is_women_rider: bool = False,
) -> list[PolicyViolation]:
    """Evaluate policy rules for one candidate ride request."""
    now = _normalize_datetime(reference_time or datetime.utcnow())
    scheduled_time = _normalize_datetime(scheduled_time)
    violations: list[PolicyViolation] = []

    if policy.service_zone.enabled:
        pickup_bounds = policy.service_zone.pickup_bounds
        if _bounds_configured(pickup_bounds) and not _coordinate_in_bounds(
            pickup_latitude,
            pickup_longitude,
            pickup_bounds,
        ):
            violations.append(
                PolicyViolation(
                    code="pickup_outside_service_zone",
                    message="Pickup location is outside the configured company service zone.",
                    field="pickup",
                )
            )

        destination_bounds = policy.service_zone.destination_bounds
        if _bounds_configured(destination_bounds) and not _coordinate_in_bounds(
            destination_latitude,
            destination_longitude,
            destination_bounds,
        ):
            violations.append(
                PolicyViolation(
                    code="destination_outside_service_zone",
                    message=(
                        "Destination location is outside the configured company service zone."
                    ),
                    field="destination",
                )
            )

    if scheduled_time is not None:
        min_lead_cutoff = now + timedelta(minutes=policy.schedule.min_lead_minutes)
        if scheduled_time < min_lead_cutoff:
            violations.append(
                PolicyViolation(
                    code="scheduled_min_lead_violation",
                    message=(
                        "Scheduled pickup is too soon for company policy. Increase lead time."
                    ),
                    field="scheduled_time",
                )
            )

        max_schedule_cutoff = now + timedelta(days=policy.schedule.max_days_ahead)
        if scheduled_time > max_schedule_cutoff:
            violations.append(
                PolicyViolation(
                    code="scheduled_max_horizon_violation",
                    message=(
                        "Scheduled pickup is beyond the policy horizon. Choose an earlier date."
                    ),
                    field="scheduled_time",
                )
            )

    if _women_safety_window_active_for_request(
        policy,
        reference_time=now,
        is_women_rider=is_women_rider,
    ):
        if policy.women_safety_window.requires_scheduled_rides and scheduled_time is None:
            violations.append(
                PolicyViolation(
                    code="women_safety_window_requires_schedule",
                    message=(
                        "Immediate requests are restricted during the configured safety window."
                    ),
                    field="scheduled_time",
                )
            )

    _ = role  # Role and team are currently used for dispatch prioritization only.
    _ = team
    return violations


def describe_policy_violations(violations: list[PolicyViolation]) -> str:
    """Summarize policy violations into a user-safe API error detail."""
    if not violations:
        return "Request blocked by policy."
    if len(violations) == 1:
        return violations[0].message
    first = violations[0].message.rstrip(".")
    return f"{first}. ({len(violations) - 1} additional policy rule(s) also failed.)"


def simulate_company_policy(
    db: Session,
    company_id,
    payload: PolicySimulationRequest,
) -> PolicySimulationResponse:
    """Evaluate company policy for a simulated ride request."""
    policy = get_company_policy(db, company_id)
    violations = evaluate_policy_for_ride_request(
        policy,
        pickup_latitude=payload.pickup_latitude,
        pickup_longitude=payload.pickup_longitude,
        destination_latitude=payload.destination_latitude,
        destination_longitude=payload.destination_longitude,
        scheduled_time=payload.scheduled_time,
        role=payload.role,
        team=payload.team,
        is_women_rider=payload.is_women_rider,
    )
    return PolicySimulationResponse(
        allowed=not bool(violations),
        dispatch_priority=dispatch_priority_for_context(
            policy,
            role=payload.role,
            team=payload.team,
        ),
        violations=violations,
        policy=policy,
    )


def resolve_user_team(user: User | None) -> str | None:
    """Resolve optional team metadata for dispatch priority checks."""
    if user is None:
        return None
    preferences = user.notification_preferences
    if isinstance(preferences, dict):
        team = preferences.get("team")
        if isinstance(team, str) and team.strip():
            return team.strip()
    return None


def resolve_user_is_women_rider(user: User | None) -> bool:
    """Resolve women-safety flag from optional user metadata."""
    if user is None:
        return False
    preferences = user.notification_preferences
    if isinstance(preferences, dict):
        return bool(preferences.get("is_women_rider"))
    return False


def dispatch_priority_for_context(
    policy: CommutePolicyConfig,
    *,
    role: str,
    team: str | None = None,
) -> int:
    """Resolve dispatch priority for role/team context (lower is higher priority)."""
    role_key = (role or "employee").strip().lower()
    role_priority = int(policy.priority_by_user_role.get(role_key, 50))
    if team and team.strip():
        team_priority_map = {
            key.strip().lower(): int(value)
            for key, value in policy.priority_by_team.items()
            if key is not None
        }
        team_priority = team_priority_map.get(team.strip().lower())
        if team_priority is not None:
            return team_priority
    return role_priority


def sort_rides_by_policy_priority(db: Session, rides: list[RideRequest]) -> list[RideRequest]:
    """Sort pending rides using company role/team priority policy."""
    if len(rides) <= 1:
        return rides

    company_ids = {ride.company_id for ride in rides if ride.company_id is not None}
    user_ids = {ride.user_id for ride in rides if ride.user_id is not None}
    users = {}
    if user_ids:
        rows = db.scalars(select(User).where(User.id.in_(user_ids))).all()
        users = {row.id: row for row in rows}
    company_policy_map = {}
    for company_id in company_ids:
        company = db.get(Company, company_id)
        company_policy_map[str(company_id)] = (
            _normalized_policy_from_company(company)
            if company is not None
            else DEFAULT_POLICY_CONFIG
        )

    def _key(ride: RideRequest) -> tuple[int, datetime]:
        user = users.get(ride.user_id)
        role = user.role.value if user is not None else "employee"
        team = resolve_user_team(user)
        policy = company_policy_map.get(str(ride.company_id), DEFAULT_POLICY_CONFIG)
        priority = dispatch_priority_for_context(policy, role=role, team=team)
        requested_at = ride.requested_at or datetime.min
        return (priority, requested_at)

    return sorted(rides, key=_key)


def _normalized_policy_from_company(company: Company) -> CommutePolicyConfig:
    raw_config = company.policy_config if isinstance(company.policy_config, dict) else {}
    return _normalized_policy(raw_config)


def _normalized_policy(raw_config: dict[str, Any] | None) -> CommutePolicyConfig:
    baseline = DEFAULT_POLICY_CONFIG.model_dump(mode="json", exclude_none=True)
    merged = _deep_merge(baseline, raw_config or {})
    return CommutePolicyConfig.model_validate(merged)


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    result = dict(base)
    for key, value in override.items():
        if (
            key in result
            and isinstance(result[key], dict)
            and isinstance(value, dict)
        ):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def _bounds_configured(bounds: PolicyZoneBounds | None) -> bool:
    if bounds is None:
        return False
    return all(
        value is not None
        for value in [
            bounds.min_latitude,
            bounds.max_latitude,
            bounds.min_longitude,
            bounds.max_longitude,
        ]
    )


def _coordinate_in_bounds(
    latitude: float,
    longitude: float,
    bounds: PolicyZoneBounds | None,
) -> bool:
    if not _bounds_configured(bounds):
        return True
    return (
        float(bounds.min_latitude) <= latitude <= float(bounds.max_latitude)
        and float(bounds.min_longitude) <= longitude <= float(bounds.max_longitude)
    )


def _women_safety_window_active_for_request(
    policy: CommutePolicyConfig,
    *,
    reference_time: datetime,
    is_women_rider: bool,
) -> bool:
    window = policy.women_safety_window
    if not window.enabled:
        return False
    if not (window.apply_to_all_riders or is_women_rider):
        return False
    local_time = _to_local_time(reference_time, window.timezone)
    start = _parse_local_time(window.start_local_time)
    end = _parse_local_time(window.end_local_time)
    return _time_in_window(local_time, start, end)


def _parse_local_time(value: str) -> time:
    try:
        hour_text, minute_text = value.split(":", 1)
        hour = int(hour_text)
        minute = int(minute_text)
        return time(hour=hour, minute=minute)
    except (ValueError, TypeError):
        return time(hour=0, minute=0)


def _to_local_time(reference_time: datetime, timezone_name: str) -> time:
    if reference_time.tzinfo is None:
        reference_time = reference_time.replace(tzinfo=timezone.utc)
    try:
        tz = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        tz = timezone.utc
    return reference_time.astimezone(tz).time()


def _time_in_window(current: time, start: time, end: time) -> bool:
    if start <= end:
        return start <= current <= end
    return current >= start or current <= end


def _normalize_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)
