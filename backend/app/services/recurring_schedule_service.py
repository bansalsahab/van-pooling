"""Recurring ride schedule management and materialization."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.geo import point_value
from app.models.recurring_ride_rule import RecurringRideRule, RecurringRideRuleStatus
from app.models.ride_request import RideRequest, RideRequestStatus
from app.models.user import User
from app.schemas.recurring_schedule import (
    RecurringLocationInput,
    RecurringRideRuleCreate,
    RecurringRideRuleSummary,
    RecurringRideRuleUpdate,
)
from app.services.audit_service import record_dispatch_event
from app.services.notification_service import create_admin_alert, queue_notification
from app.services.policy_service import (
    describe_policy_violations,
    evaluate_policy_for_ride_request,
    get_company_policy,
    resolve_user_is_women_rider,
    resolve_user_team,
)
from app.services.service_zone_service import point_allowed_in_active_zones
from app.services.lifecycle_service import RIDE_OPEN_STATUSES


def _parse_status(value: str) -> RecurringRideRuleStatus:
    try:
        return RecurringRideRuleStatus(value.lower())
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="status must be either active or paused.",
        ) from exc


def _parse_weekdays(values: list[int]) -> list[int]:
    unique = sorted({int(value) for value in values})
    if any(value < 0 or value > 6 for value in unique):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="weekdays values must be in range 0..6 where 0 is Monday.",
        )
    if not unique:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one weekday must be selected.",
        )
    return unique


def _serialize_weekdays(value: str) -> list[int]:
    if not value.strip():
        return []
    parsed = []
    for item in value.split(","):
        item = item.strip()
        if not item:
            continue
        try:
            parsed.append(int(item))
        except ValueError:
            continue
    return _parse_weekdays(parsed) if parsed else []


def _format_weekdays(values: list[int]) -> str:
    return ",".join(str(value) for value in _parse_weekdays(values))


def _parse_pickup_time(value: str) -> time:
    try:
        hour_text, minute_text = value.split(":", 1)
        hour = int(hour_text)
        minute = int(minute_text)
        return time(hour=hour, minute=minute)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="pickup_time_local must be in HH:MM format.",
        ) from exc


def _normalize_timezone(value: str) -> str:
    normalized = str(value or "").strip().replace(" ", "_")
    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Timezone is required for recurring schedule.",
        )
    return normalized


def _resolve_timezone(value: str) -> ZoneInfo:
    normalized = _normalize_timezone(value)
    try:
        return ZoneInfo(normalized)
    except ZoneInfoNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid timezone value for recurring schedule. Use values like Asia/Kolkata.",
        ) from exc


def _next_pickup_for_rule(
    rule: RecurringRideRule,
    reference_utc: datetime,
) -> tuple[datetime | None, date | None]:
    weekdays = _serialize_weekdays(rule.weekdays)
    if not weekdays:
        return None, None

    timezone_info = _resolve_timezone(rule.timezone)
    pickup_local_time = _parse_pickup_time(rule.pickup_time_local)
    reference_local = reference_utc.replace(tzinfo=timezone.utc).astimezone(timezone_info)

    for day_offset in range(0, 8):
        local_date = reference_local.date() + timedelta(days=day_offset)
        if local_date.weekday() not in weekdays:
            continue
        local_pickup = datetime.combine(
            local_date,
            pickup_local_time,
            tzinfo=timezone_info,
        )
        pickup_utc = local_pickup.astimezone(timezone.utc).replace(tzinfo=None)
        if pickup_utc > reference_utc:
            return pickup_utc, local_date
    return None, None


def _user_has_open_ride(db: Session, user_id, company_id) -> bool:
    ride = db.scalars(
        select(RideRequest.id).where(
            RideRequest.user_id == user_id,
            RideRequest.company_id == company_id,
            RideRequest.status.in_(list(RIDE_OPEN_STATUSES)),
        )
    ).first()
    return ride is not None


def serialize_recurring_rule(
    rule: RecurringRideRule,
    *,
    reference_time: datetime | None = None,
) -> RecurringRideRuleSummary:
    """Serialize recurring rule with computed next pickup."""
    now = reference_time or datetime.utcnow()
    next_pickup, _ = _next_pickup_for_rule(rule, now)
    return RecurringRideRuleSummary(
        id=rule.id,
        user_id=rule.user_id,
        company_id=rule.company_id,
        name=rule.name,
        status=rule.status.value,
        weekdays=_serialize_weekdays(rule.weekdays),
        pickup_time_local=rule.pickup_time_local,
        timezone=rule.timezone,
        pickup=RecurringLocationInput(
            address=rule.pickup_address,
            latitude=rule.pickup_latitude,
            longitude=rule.pickup_longitude,
        ),
        destination=RecurringLocationInput(
            address=rule.destination_address,
            latitude=rule.destination_latitude,
            longitude=rule.destination_longitude,
        ),
        last_generated_for_date=rule.last_generated_for_date,
        next_pickup_at=next_pickup,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


def list_user_recurring_rules(db: Session, user: User) -> list[RecurringRideRuleSummary]:
    """List recurring schedules for a user."""
    rules = db.scalars(
        select(RecurringRideRule)
        .where(
            RecurringRideRule.user_id == user.id,
            RecurringRideRule.company_id == user.company_id,
        )
        .order_by(RecurringRideRule.created_at.desc())
    ).all()
    return [serialize_recurring_rule(rule) for rule in rules]


def create_user_recurring_rule(
    db: Session,
    user: User,
    payload: RecurringRideRuleCreate,
) -> RecurringRideRuleSummary:
    """Create recurring weekday schedule for a user."""
    weekdays = _format_weekdays(payload.weekdays)
    _parse_pickup_time(payload.pickup_time_local)
    timezone_name = _normalize_timezone(payload.timezone)
    _resolve_timezone(timezone_name)
    rule = RecurringRideRule(
        user_id=user.id,
        company_id=user.company_id,
        name=payload.name.strip(),
        status=RecurringRideRuleStatus.ACTIVE,
        weekdays=weekdays,
        pickup_time_local=payload.pickup_time_local,
        timezone=timezone_name,
        pickup_address=payload.pickup.address,
        pickup_latitude=payload.pickup.latitude,
        pickup_longitude=payload.pickup.longitude,
        destination_address=payload.destination.address,
        destination_latitude=payload.destination.latitude,
        destination_longitude=payload.destination.longitude,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return serialize_recurring_rule(rule)


def update_user_recurring_rule(
    db: Session,
    user: User,
    rule_id,
    payload: RecurringRideRuleUpdate,
) -> RecurringRideRuleSummary:
    """Update recurring weekday schedule for a user."""
    rule = db.scalar(
        select(RecurringRideRule).where(
            RecurringRideRule.id == rule_id,
            RecurringRideRule.user_id == user.id,
            RecurringRideRule.company_id == user.company_id,
        )
    )
    if rule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recurring schedule not found.",
        )

    fields = payload.model_fields_set
    if "name" in fields and payload.name is not None:
        rule.name = payload.name.strip()
    if "weekdays" in fields and payload.weekdays is not None:
        rule.weekdays = _format_weekdays(payload.weekdays)
    if "pickup_time_local" in fields and payload.pickup_time_local is not None:
        _parse_pickup_time(payload.pickup_time_local)
        rule.pickup_time_local = payload.pickup_time_local
    if "timezone" in fields and payload.timezone is not None:
        timezone_name = _normalize_timezone(payload.timezone)
        _resolve_timezone(timezone_name)
        rule.timezone = timezone_name
    if "status" in fields and payload.status is not None:
        rule.status = _parse_status(payload.status)
    if "pickup" in fields and payload.pickup is not None:
        rule.pickup_address = payload.pickup.address
        rule.pickup_latitude = payload.pickup.latitude
        rule.pickup_longitude = payload.pickup.longitude
    if "destination" in fields and payload.destination is not None:
        rule.destination_address = payload.destination.address
        rule.destination_latitude = payload.destination.latitude
        rule.destination_longitude = payload.destination.longitude

    db.add(rule)
    db.commit()
    db.refresh(rule)
    return serialize_recurring_rule(rule)


def materialize_due_recurring_rides(db: Session, *, now: datetime | None = None) -> int:
    """
    Create scheduled ride requests for active recurring templates that are inside lookahead.

    Returns the number of newly created rides.
    """
    reference_time = now or datetime.utcnow()
    lookahead = timedelta(minutes=settings.RECURRING_RIDE_LOOKAHEAD_MINUTES)
    created_count = 0
    rules = db.scalars(
        select(RecurringRideRule).where(
            RecurringRideRule.status == RecurringRideRuleStatus.ACTIVE
        )
    ).all()

    for rule in rules:
        next_pickup_at, local_date = _next_pickup_for_rule(rule, reference_time)
        if next_pickup_at is None or local_date is None:
            continue
        if next_pickup_at > (reference_time + lookahead):
            continue
        if rule.last_generated_for_date == local_date:
            continue

        rider = db.get(User, rule.user_id)
        if rider is None:
            continue
        if _user_has_open_ride(db, rider.id, rider.company_id):
            continue

        company_policy = get_company_policy(db, rider.company_id)
        violations = evaluate_policy_for_ride_request(
            company_policy,
            pickup_latitude=rule.pickup_latitude,
            pickup_longitude=rule.pickup_longitude,
            destination_latitude=rule.destination_latitude,
            destination_longitude=rule.destination_longitude,
            scheduled_time=next_pickup_at,
            reference_time=reference_time,
            role=rider.role.value,
            team=resolve_user_team(rider),
            is_women_rider=resolve_user_is_women_rider(rider),
            pickup_in_active_zone=point_allowed_in_active_zones(
                db,
                rider.company_id,
                zone_type="pickup",
                latitude=rule.pickup_latitude,
                longitude=rule.pickup_longitude,
            ),
            destination_in_active_zone=point_allowed_in_active_zones(
                db,
                rider.company_id,
                zone_type="destination",
                latitude=rule.destination_latitude,
                longitude=rule.destination_longitude,
            ),
        )
        if violations:
            create_admin_alert(
                db,
                rider.company_id,
                title="Recurring schedule policy conflict",
                message=describe_policy_violations(violations),
                severity="high",
                metadata={
                    "user_id": str(rider.id),
                    "rule_id": str(rule.id),
                    "entity_type": "recurring_rule",
                    "entity_id": str(rule.id),
                },
            )
            continue

        ride = RideRequest(
            user_id=rider.id,
            company_id=rider.company_id,
            pickup_location=point_value(
                rule.pickup_longitude,
                rule.pickup_latitude,
                settings.is_sqlite,
            ),
            pickup_address=rule.pickup_address,
            destination=point_value(
                rule.destination_longitude,
                rule.destination_latitude,
                settings.is_sqlite,
            ),
            destination_address=rule.destination_address,
            status=RideRequestStatus.SCHEDULED_QUEUED,
            scheduled_time=next_pickup_at,
            expires_at=next_pickup_at,
            estimated_wait_minutes=max(
                1, int((next_pickup_at - reference_time).total_seconds() // 60)
            ),
            dispatch_metadata={
                "outcome": "scheduled_queued",
                "note": "Created from recurring schedule template.",
                "rule_id": str(rule.id),
                "candidate_counts": {"pool": 0, "van": 0},
            },
        )
        db.add(ride)
        db.flush()

        record_dispatch_event(
            db,
            company_id=rider.company_id,
            event_type="ride.requested_recurring",
            actor_type="system",
            ride_id=ride.id,
            from_state=None,
            to_state=ride.status.value,
            metadata={
                "rule_id": str(rule.id),
                "scheduled_time": next_pickup_at.isoformat(),
            },
        )
        queue_notification(
            db,
            rider.id,
            title="Recurring ride queued",
            message=(
                "A scheduled ride was created from your recurring commute template and "
                "will dispatch near pickup time."
            ),
            metadata={
                "ride_id": str(ride.id),
                "rule_id": str(rule.id),
                "scheduled_time": next_pickup_at.isoformat(),
            },
        )
        rule.last_generated_for_date = local_date
        db.add(rule)
        created_count += 1

    return created_count
