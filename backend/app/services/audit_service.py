"""Persisted dispatch event helpers."""
from __future__ import annotations

import csv
from datetime import datetime
import hashlib
import hmac
import io
import json
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.dispatch_event import DispatchEvent
from app.models.notification import Notification
from app.models.user import User
from app.schemas.audit import AuditExportRecord, AuditExportResponse
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


def collect_company_audit_records(
    db: Session,
    company_id,
    *,
    limit: int = 500,
    include_alerts: bool = True,
) -> list[AuditExportRecord]:
    """Collect tenant-scoped audit records from dispatch events and alerts."""
    normalized_limit = max(1, min(limit, 5000))
    dispatch_rows = db.execute(
        select(DispatchEvent)
        .where(DispatchEvent.company_id == company_id)
        .order_by(desc(DispatchEvent.created_at))
        .limit(normalized_limit)
    ).scalars().all()

    records = [
        AuditExportRecord(
            source="dispatch_event",
            occurred_at=event.created_at,
            event_type=event.event_type,
            actor_type=event.actor_type,
            actor_user_id=event.actor_user_id,
            ride_id=event.ride_id,
            trip_id=event.trip_id,
            status=event.to_state or event.from_state,
            reason=event.reason,
            details=event.metadata_json or {},
        )
        for event in dispatch_rows
    ]

    if include_alerts:
        alert_rows = db.execute(
            select(Notification)
            .join(User, Notification.user_id == User.id)
            .where(
                User.company_id == company_id,
                Notification.metadata_json.is_not(None),
            )
            .order_by(desc(Notification.created_at))
            .limit(normalized_limit)
        ).scalars().all()

        for notification in alert_rows:
            metadata = notification.metadata_json or {}
            if metadata.get("kind") != "operational_alert":
                continue
            records.append(
                AuditExportRecord(
                    source="notification_alert",
                    occurred_at=notification.created_at,
                    event_type="alert.created"
                    if notification.status.value == "pending"
                    else "alert.resolved",
                    actor_type="system",
                    actor_user_id=notification.user_id,
                    ride_id=_uuid_or_none(metadata.get("ride_id")),
                    trip_id=_uuid_or_none(metadata.get("trip_id")),
                    status=notification.status.value,
                    severity=_string_or_none(metadata.get("severity")),
                    reason=_string_or_none(metadata.get("resolved_reason")),
                    details={
                        "title": notification.title,
                        "message": notification.message,
                        "kind": metadata.get("kind"),
                        "entity_type": metadata.get("entity_type"),
                        "entity_id": metadata.get("entity_id"),
                        "breach_type": metadata.get("breach_type"),
                    },
                )
            )

    records.sort(key=lambda item: item.occurred_at or datetime.min, reverse=True)
    return records[:normalized_limit]


def build_company_audit_export(
    db: Session,
    company_id,
    *,
    limit: int = 500,
    include_alerts: bool = True,
) -> AuditExportResponse:
    """Build a signed audit export payload for JSON responses."""
    generated_at = datetime.utcnow()
    records = collect_company_audit_records(
        db,
        company_id,
        limit=limit,
        include_alerts=include_alerts,
    )
    signature = _sign_records(company_id, records)
    return AuditExportResponse(
        company_id=company_id,
        generated_at=generated_at,
        record_count=len(records),
        signature=signature,
        records=records,
    )


def render_audit_csv(records: list[AuditExportRecord]) -> str:
    """Render audit export records as CSV text."""
    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=[
            "source",
            "occurred_at",
            "event_type",
            "actor_type",
            "actor_user_id",
            "ride_id",
            "trip_id",
            "status",
            "severity",
            "reason",
            "details",
        ],
    )
    writer.writeheader()
    for record in records:
        payload = record.model_dump(mode="json")
        payload["details"] = json.dumps(payload.get("details") or {}, sort_keys=True)
        writer.writerow(payload)
    return output.getvalue()


def _sign_records(company_id, records: list[AuditExportRecord]) -> str:
    payload = {
        "company_id": str(company_id),
        "records": [record.model_dump(mode="json") for record in records],
    }
    serialized = json.dumps(payload, separators=(",", ":"), sort_keys=True)
    return hmac.new(
        settings.JWT_SECRET_KEY.encode("utf-8"),
        serialized.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _string_or_none(value) -> str | None:
    if value is None:
        return None
    return str(value)


def _uuid_or_none(value):
    if value is None:
        return None
    return value
