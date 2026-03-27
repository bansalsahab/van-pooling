"""Persisted dispatch event helpers."""
from __future__ import annotations

from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.dispatch_event import DispatchEvent
from app.models.user import User
from app.schemas.dispatch_event import DispatchEventSummary


def record_dispatch_event(
    db: Session,
    *,
    company_id,
    event_type: str,
    actor_type: str,
    actor_user_id=None,
    ride_id=None,
    trip_id=None,
    from_state: str | None = None,
    to_state: str | None = None,
    reason: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> DispatchEvent:
    """Persist an audit event for a dispatch operation."""
    event = DispatchEvent(
        company_id=company_id,
        ride_id=ride_id,
        trip_id=trip_id,
        actor_user_id=actor_user_id,
        actor_type=actor_type,
        event_type=event_type,
        from_state=from_state,
        to_state=to_state,
        reason=reason,
        metadata_json=metadata or {},
    )
    db.add(event)
    return event


def list_trip_dispatch_events(
    db: Session,
    company_id,
    trip_id,
    *,
    limit: int = 50,
) -> list[DispatchEventSummary]:
    """Return recent persisted events for a trip."""
    rows = db.execute(
        select(DispatchEvent, User.name)
        .outerjoin(User, DispatchEvent.actor_user_id == User.id)
        .where(
            DispatchEvent.company_id == company_id,
            DispatchEvent.trip_id == trip_id,
        )
        .order_by(desc(DispatchEvent.created_at))
        .limit(limit)
    ).all()
    return [serialize_dispatch_event(event, actor_name) for event, actor_name in rows]


def list_ride_dispatch_events(
    db: Session,
    company_id,
    ride_id,
    *,
    limit: int = 30,
) -> list[DispatchEventSummary]:
    """Return recent persisted events for a ride."""
    rows = db.execute(
        select(DispatchEvent, User.name)
        .outerjoin(User, DispatchEvent.actor_user_id == User.id)
        .where(
            DispatchEvent.company_id == company_id,
            DispatchEvent.ride_id == ride_id,
        )
        .order_by(desc(DispatchEvent.created_at))
        .limit(limit)
    ).all()
    return [serialize_dispatch_event(event, actor_name) for event, actor_name in rows]


def list_company_dispatch_events(
    db: Session,
    company_id,
    *,
    limit: int = 25,
) -> list[DispatchEventSummary]:
    """Return recent persisted events for a company."""
    rows = db.execute(
        select(DispatchEvent, User.name)
        .outerjoin(User, DispatchEvent.actor_user_id == User.id)
        .where(DispatchEvent.company_id == company_id)
        .order_by(desc(DispatchEvent.created_at))
        .limit(limit)
    ).all()
    return [serialize_dispatch_event(event, actor_name) for event, actor_name in rows]


def serialize_dispatch_event(
    event: DispatchEvent,
    actor_name: str | None = None,
) -> DispatchEventSummary:
    """Convert a persisted dispatch event into API output."""
    return DispatchEventSummary(
        id=event.id,
        company_id=event.company_id,
        ride_id=event.ride_id,
        trip_id=event.trip_id,
        actor_user_id=event.actor_user_id,
        actor_name=actor_name,
        actor_type=event.actor_type,
        event_type=event.event_type,
        from_state=event.from_state,
        to_state=event.to_state,
        reason=event.reason,
        metadata=event.metadata_json or {},
        created_at=event.created_at,
    )
