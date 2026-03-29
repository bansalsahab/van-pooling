"""SLA monitoring and incident timeline helpers."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Iterable
from uuid import UUID

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.notification import Notification, NotificationStatus, NotificationType
from app.models.ride_request import RideRequest, RideRequestStatus
from app.models.user import User
from app.models.van import Van, VanStatus
from app.schemas.sla import IncidentTimelineItem, SLABreachSummary, SLASnapshotSummary
from app.services.notification_service import create_admin_alert_once


RIDER_WAIT_SLA_MINUTES = 8
DISPATCH_DECISION_SLA_SECONDS = settings.MATCHING_AGGREGATION_WINDOW_SECONDS + 10
SLA_INCIDENT_KINDS = {"operational_alert", "sla_breach"}


def collect_company_sla_snapshot(db: Session, company_id) -> SLASnapshotSummary:
    """Build a current SLA snapshot for one tenant company."""
    now = datetime.utcnow()
    breaches: list[SLABreachSummary] = []

    dispatch_delay_rides = _list_dispatch_delay_breach_rides(db, company_id, now)
    if dispatch_delay_rides:
        breaches.append(
            SLABreachSummary(
                breach_type="dispatch_delay",
                title="Dispatch decision delay",
                severity="high",
                count=len(dispatch_delay_rides),
                threshold_label=f">{DISPATCH_DECISION_SLA_SECONDS}s from request",
                note=(
                    "Pending rides stayed in requested/matching longer than the dispatch SLA "
                    "after aggregation."
                ),
                sample_entity_id=str(dispatch_delay_rides[0].id),
                entity_type="ride",
            )
        )

    wait_breach_rides = _list_wait_time_breach_rides(db, company_id, now)
    if wait_breach_rides:
        breaches.append(
            SLABreachSummary(
                breach_type="wait_time",
                title="Rider wait time risk",
                severity="high",
                count=len(wait_breach_rides),
                threshold_label=f">{RIDER_WAIT_SLA_MINUTES} minutes before pickup",
                note=(
                    "Matched rides have been waiting beyond the target wait-time SLA before pickup."
                ),
                sample_entity_id=str(wait_breach_rides[0].id),
                entity_type="ride",
            )
        )

    stale_vans = _list_stale_location_breach_vans(db, company_id, now)
    if stale_vans:
        breaches.append(
            SLABreachSummary(
                breach_type="location_freshness",
                title="Location freshness breach",
                severity="medium",
                count=len(stale_vans),
                threshold_label=f">{settings.VAN_STALE_ALERT_SECONDS}s without van ping",
                note=(
                    "Fleet telemetry is stale for active/available vans, degrading tracking trust."
                ),
                sample_entity_id=str(stale_vans[0].id),
                entity_type="van",
            )
        )

    open_breach_count = sum(item.count for item in breaches)
    health = "healthy"
    if open_breach_count > 0:
        health = "warning" if open_breach_count <= 3 else "critical"

    return SLASnapshotSummary(
        company_id=company_id,
        generated_at=now,
        open_breach_count=open_breach_count,
        health=health,
        breaches=breaches,
    )


def create_sla_alerts_for_company(db: Session, company_id) -> int:
    """Emit de-duplicated admin alerts for active SLA breaches."""
    snapshot = collect_company_sla_snapshot(db, company_id)
    if snapshot.open_breach_count <= 0:
        return 0

    created = 0
    now = datetime.utcnow()
    hour_bucket = now.strftime("%Y%m%d%H")
    for breach in snapshot.breaches:
        create_admin_alert_once(
            db,
            company_id,
            title=f"SLA breach: {breach.title}",
            message=f"{breach.count} item(s) breached ({breach.threshold_label}).",
            severity=breach.severity,
            metadata={
                "kind": "sla_breach",
                "breach_type": breach.breach_type,
                "entity_type": breach.entity_type,
                "entity_id": breach.sample_entity_id,
                "threshold_label": breach.threshold_label,
                "note": breach.note,
                "count": breach.count,
                "generated_at": now.isoformat(),
            },
            dedupe_key=f"sla:{company_id}:{breach.breach_type}:{hour_bucket}",
        )
        created += 1
    return created


def list_admin_incidents(
    db: Session,
    admin_user: User,
    *,
    include_resolved: bool = False,
    limit: int = 60,
) -> list[IncidentTimelineItem]:
    """Return the admin's incident timeline from notification-backed alerts."""
    notifications = db.scalars(
        select(Notification)
        .where(
            Notification.user_id == admin_user.id,
            Notification.type == NotificationType.PUSH,
        )
        .order_by(desc(Notification.created_at))
        .limit(max(1, min(limit, 200)))
    ).all()
    incidents: list[IncidentTimelineItem] = []
    for notification in notifications:
        metadata = notification.metadata_json or {}
        kind = str(metadata.get("kind") or "")
        if kind not in SLA_INCIDENT_KINDS:
            continue
        if not include_resolved and notification.status != NotificationStatus.PENDING:
            continue
        incidents.append(
            IncidentTimelineItem(
                id=notification.id,
                title=notification.title,
                message=notification.message,
                status=notification.status.value,
                severity=str(metadata.get("severity") or "medium"),
                kind=kind,
                breach_type=_string_or_none(metadata.get("breach_type")),
                entity_type=_string_or_none(metadata.get("entity_type")),
                entity_id=_string_or_none(metadata.get("entity_id")),
                ride_id=_uuid_or_none(metadata.get("ride_id")),
                trip_id=_uuid_or_none(metadata.get("trip_id")),
                created_at=notification.created_at,
                resolved_at=notification.sent_at,
            )
        )
    return incidents


def list_sla_monitor_company_ids(db: Session) -> list[UUID]:
    """Return company ids that should be scanned for SLA breaches this cycle."""
    ride_company_ids = db.scalars(
        select(RideRequest.company_id)
        .where(
            RideRequest.status.in_(
                [
                    RideRequestStatus.REQUESTED,
                    RideRequestStatus.MATCHING,
                    RideRequestStatus.MATCHED,
                    RideRequestStatus.DRIVER_EN_ROUTE,
                    RideRequestStatus.ARRIVED_AT_PICKUP,
                ]
            )
        )
        .distinct()
    ).all()
    van_company_ids = db.scalars(
        select(Van.company_id)
        .where(Van.status.in_([VanStatus.AVAILABLE, VanStatus.ON_TRIP]))
        .distinct()
    ).all()
    return list(_unique_company_ids([*ride_company_ids, *van_company_ids]))


def _list_dispatch_delay_breach_rides(
    db: Session,
    company_id,
    now: datetime,
) -> list[RideRequest]:
    threshold = now - timedelta(seconds=DISPATCH_DECISION_SLA_SECONDS)
    return db.scalars(
        select(RideRequest)
        .where(
            RideRequest.company_id == company_id,
            RideRequest.requested_at.is_not(None),
            RideRequest.requested_at <= threshold,
            RideRequest.status.in_(
                [
                    RideRequestStatus.REQUESTED,
                    RideRequestStatus.MATCHING,
                ]
            ),
        )
        .order_by(RideRequest.requested_at.asc())
        .limit(50)
    ).all()


def _list_wait_time_breach_rides(
    db: Session,
    company_id,
    now: datetime,
) -> list[RideRequest]:
    threshold = now - timedelta(minutes=RIDER_WAIT_SLA_MINUTES)
    return db.scalars(
        select(RideRequest)
        .where(
            RideRequest.company_id == company_id,
            RideRequest.requested_at.is_not(None),
            RideRequest.requested_at <= threshold,
            RideRequest.actual_pickup_time.is_(None),
            RideRequest.status.in_(
                [
                    RideRequestStatus.MATCHED,
                    RideRequestStatus.DRIVER_EN_ROUTE,
                    RideRequestStatus.ARRIVED_AT_PICKUP,
                ]
            ),
        )
        .order_by(RideRequest.requested_at.asc())
        .limit(50)
    ).all()


def _list_stale_location_breach_vans(
    db: Session,
    company_id,
    now: datetime,
) -> list[Van]:
    threshold = now - timedelta(seconds=settings.VAN_STALE_ALERT_SECONDS)
    return db.scalars(
        select(Van)
        .where(
            Van.company_id == company_id,
            Van.status.in_([VanStatus.AVAILABLE, VanStatus.ON_TRIP]),
            (Van.last_location_update.is_(None) | (Van.last_location_update <= threshold)),
        )
        .order_by(Van.last_location_update.asc())
        .limit(50)
    ).all()


def _unique_company_ids(company_ids: Iterable) -> Iterable[UUID]:
    seen: set[str] = set()
    for company_id in company_ids:
        if company_id is None:
            continue
        normalized = str(company_id)
        if normalized in seen:
            continue
        seen.add(normalized)
        yield company_id


def _string_or_none(value) -> str | None:
    if value is None:
        return None
    return str(value)


def _uuid_or_none(value) -> UUID | None:
    if value is None:
        return None
    if isinstance(value, UUID):
        return value
    if isinstance(value, str):
        try:
            return UUID(value)
        except ValueError:
            return None
    return None
