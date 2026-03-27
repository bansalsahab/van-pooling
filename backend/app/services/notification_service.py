"""Notification and operational alert helpers."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import desc, inspect, select, text
from sqlalchemy.orm import Session

from app.database import engine
from app.models.notification import Notification, NotificationStatus, NotificationType
from app.models.ride_request import RideRequest, RideRequestStatus
from app.models.user import User, UserRole
from app.schemas.alert import AlertSummary
from app.schemas.notification import NotificationFeed, NotificationSummary


DEFAULT_NOTIFICATION_LIMIT = 12
NOTIFICATION_DEDUPE_SCAN_LIMIT = 120
DISPATCH_ALERT_TITLES_AUTO_RESOLVABLE = {
    "Dispatch pressure rising",
    "Dispatch radius fallback used",
    "Scheduled dispatch window opened",
    "Scheduled ride needs intervention",
}
DISPATCH_ALERT_ACTIVE_RIDE_STATUSES = {
    RideRequestStatus.REQUESTED.value,
    RideRequestStatus.MATCHING.value,
    RideRequestStatus.SCHEDULED_REQUESTED.value,
    RideRequestStatus.SCHEDULED_QUEUED.value,
    RideRequestStatus.MATCHING_AT_DISPATCH_WINDOW.value,
}


def ensure_notification_schema() -> None:
    """Backfill lightweight notification schema changes for local development."""
    with engine.begin() as connection:
        inspector = inspect(connection)
        if "notifications" not in inspector.get_table_names():
            return

        columns = {column["name"] for column in inspector.get_columns("notifications")}
        if "read_at" not in columns:
            connection.execute(text("ALTER TABLE notifications ADD COLUMN read_at TIMESTAMP"))

        connection.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_notifications_user_read_at "
                "ON notifications(user_id, read_at)"
            )
        )


def queue_notification(
    db: Session,
    user_id,
    title: str,
    message: str,
    metadata: dict | None = None,
) -> Notification:
    """Persist a notification record for later delivery."""
    notification = Notification(
        user_id=user_id,
        type=NotificationType.PUSH,
        title=title,
        message=message,
        status=NotificationStatus.PENDING,
        metadata_json=metadata or {},
    )
    db.add(notification)
    return notification


def queue_notification_once(
    db: Session,
    user_id,
    title: str,
    message: str,
    metadata: dict | None = None,
    *,
    dedupe_key: str | None = None,
) -> Notification | None:
    """Queue a notification only if a matching dedupe key has not been used recently."""
    payload = dict(metadata or {})
    if dedupe_key:
        if _notification_has_dedupe_key(db, user_id, dedupe_key):
            return None
        payload["dedupe_key"] = dedupe_key

    return queue_notification(
        db,
        user_id,
        title=title,
        message=message,
        metadata=payload,
    )


def notify_company_admins(
    db: Session,
    company_id,
    title: str,
    message: str,
    metadata: dict | None = None,
) -> None:
    """Queue the same operational notice for every admin in the company."""
    admins = db.scalars(
        select(User.id).where(
            User.company_id == company_id,
            User.role == UserRole.ADMIN,
        )
    ).all()
    for admin_id in admins:
        queue_notification(db, admin_id, title, message, metadata)


def notify_company_admins_once(
    db: Session,
    company_id,
    title: str,
    message: str,
    metadata: dict | None = None,
    *,
    dedupe_key: str | None = None,
) -> None:
    """Queue a de-duplicated operational notice for all admins in the company."""
    admins = db.scalars(
        select(User.id).where(
            User.company_id == company_id,
            User.role == UserRole.ADMIN,
        )
    ).all()
    for admin_id in admins:
        queue_notification_once(
            db,
            admin_id,
            title=title,
            message=message,
            metadata=metadata,
            dedupe_key=dedupe_key,
        )


def create_admin_alert(
    db: Session,
    company_id,
    title: str,
    message: str,
    severity: str = "medium",
    metadata: dict | None = None,
) -> None:
    """Create a structured operational alert for all company admins."""
    payload = {
        "kind": "operational_alert",
        "severity": severity,
        **(metadata or {}),
    }
    notify_company_admins(db, company_id, title, message, payload)


def create_admin_alert_once(
    db: Session,
    company_id,
    title: str,
    message: str,
    severity: str = "medium",
    metadata: dict | None = None,
    *,
    dedupe_key: str | None = None,
) -> None:
    """Create an operational alert once per dedupe key for each company admin."""
    payload = {
        "kind": "operational_alert",
        "severity": severity,
        **(metadata or {}),
    }
    notify_company_admins_once(
        db,
        company_id,
        title,
        message,
        payload,
        dedupe_key=dedupe_key,
    )


def serialize_notification(notification: Notification) -> NotificationSummary:
    """Convert a notification row into a user-facing summary."""
    metadata = notification.metadata_json or {}
    return NotificationSummary(
        id=notification.id,
        type=notification.type.value,
        title=notification.title,
        message=notification.message,
        status=notification.status.value,
        kind=_string_or_none(metadata.get("kind")),
        severity=_string_or_none(metadata.get("severity")),
        entity_type=_string_or_none(metadata.get("entity_type")),
        entity_id=_string_or_none(metadata.get("entity_id")),
        ride_id=_uuid_or_none(metadata.get("ride_id")),
        trip_id=_uuid_or_none(metadata.get("trip_id")),
        created_at=notification.created_at,
        sent_at=notification.sent_at,
        read_at=notification.read_at,
    )


def list_recent_notifications(
    db: Session,
    user_id,
    *,
    limit: int = 12,
    include_alerts: bool = False,
) -> list[NotificationSummary]:
    """Return recent notifications for a user."""
    notifications = _filter_notifications(
        _list_user_notification_rows(db, user_id),
        include_alerts=include_alerts,
    )
    return [serialize_notification(item) for item in notifications[:limit]]


def count_unread_notifications(
    db: Session,
    user_id,
    *,
    include_alerts: bool = False,
) -> int:
    """Count unread notifications for a user."""
    notifications = _filter_notifications(
        _list_user_notification_rows(db, user_id),
        include_alerts=include_alerts,
    )
    return sum(1 for notification in notifications if notification.read_at is None)


def list_notification_feed(
    db: Session,
    current_user: User,
    *,
    limit: int = DEFAULT_NOTIFICATION_LIMIT,
    include_alerts: bool | None = None,
) -> NotificationFeed:
    """Return a notification inbox payload for the signed-in user."""
    effective_include_alerts = _effective_include_alerts(current_user, include_alerts)
    limit = max(1, min(limit, 50))
    notifications = _filter_notifications(
        _list_user_notification_rows(db, current_user.id),
        include_alerts=effective_include_alerts,
    )
    return NotificationFeed(
        items=[serialize_notification(item) for item in notifications[:limit]],
        unread_count=sum(1 for item in notifications if item.read_at is None),
    )


def serialize_alert(notification: Notification) -> AlertSummary:
    """Convert a notification row into an admin alert shape."""
    metadata = notification.metadata_json or {}
    return AlertSummary(
        id=notification.id,
        title=notification.title,
        message=notification.message,
        status=notification.status.value,
        severity=str(metadata.get("severity") or "medium"),
        kind=str(metadata.get("kind") or "operational_alert"),
        entity_type=_string_or_none(metadata.get("entity_type")),
        entity_id=_string_or_none(metadata.get("entity_id")),
        ride_id=_uuid_or_none(metadata.get("ride_id")),
        trip_id=_uuid_or_none(metadata.get("trip_id")),
        created_at=notification.created_at,
        resolved_at=notification.sent_at,
    )


def list_admin_alerts(
    db: Session,
    admin_user: User,
    include_resolved: bool = False,
) -> list[AlertSummary]:
    """List operational alerts for the signed-in admin."""
    query = (
        select(Notification)
        .where(
            Notification.user_id == admin_user.id,
            Notification.type == NotificationType.PUSH,
        )
        .order_by(desc(Notification.created_at))
    )
    notifications = db.scalars(query).all()
    alerts = [
        serialize_alert(item)
        for item in notifications
        if (item.metadata_json or {}).get("kind") == "operational_alert"
    ]
    if include_resolved:
        return alerts
    return [item for item in alerts if item.status == NotificationStatus.PENDING.value]


def count_open_alerts(db: Session, admin_user: User) -> int:
    """Count unresolved alerts for the signed-in admin."""
    return len(list_admin_alerts(db, admin_user))


def mark_notification_read(
    db: Session,
    notification_id,
    current_user: User,
) -> NotificationSummary:
    """Mark a single notification as read for the current user."""
    notification = _get_user_notification_or_404(db, notification_id, current_user)
    if notification.read_at is None:
        notification.read_at = datetime.utcnow()
        db.add(notification)
        db.commit()
        db.refresh(notification)
    return serialize_notification(notification)


def mark_all_notifications_read(
    db: Session,
    current_user: User,
    *,
    include_alerts: bool | None = None,
    limit: int = DEFAULT_NOTIFICATION_LIMIT,
) -> NotificationFeed:
    """Mark all visible notifications as read for the current user."""
    effective_include_alerts = _effective_include_alerts(current_user, include_alerts)
    notifications = _filter_notifications(
        _list_user_notification_rows(db, current_user.id),
        include_alerts=effective_include_alerts,
    )
    unread_notifications = [item for item in notifications if item.read_at is None]
    if unread_notifications:
        read_at = datetime.utcnow()
        for notification in unread_notifications:
            notification.read_at = read_at
            db.add(notification)
        db.commit()
    return list_notification_feed(
        db,
        current_user,
        limit=limit,
        include_alerts=effective_include_alerts,
    )


def resolve_admin_alert(
    db: Session,
    alert_id,
    admin_user: User,
) -> AlertSummary:
    """Resolve a single operational alert for the signed-in admin."""
    notification = db.scalar(
        select(Notification).where(
            Notification.id == alert_id,
            Notification.user_id == admin_user.id,
        )
    )
    if notification is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found.",
        )

    notification.status = NotificationStatus.SENT
    notification.sent_at = datetime.utcnow()
    if notification.read_at is None:
        notification.read_at = notification.sent_at
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return serialize_alert(notification)


def resolve_admin_alerts_for_ride(
    db: Session,
    company_id,
    ride_id,
    *,
    reason: str | None = None,
) -> int:
    """Resolve auto-resolvable dispatch alerts linked to a ride across company admins."""
    return _resolve_company_operational_alerts_for_ride(
        db,
        company_id,
        ride_id,
        reason=reason,
    )


def resolve_stale_dispatch_alerts(db: Session, company_id, *, scan_limit: int = 250) -> int:
    """Resolve stale dispatch alerts whose referenced rides are no longer pending dispatch."""
    pending_alerts = _list_company_pending_operational_alert_rows(
        db,
        company_id,
        limit=scan_limit,
    )
    candidate_ride_ids = {
        _notification_ride_id(alert)
        for alert in pending_alerts
        if (alert.title or "") in DISPATCH_ALERT_TITLES_AUTO_RESOLVABLE
    }
    normalized_ride_ids = {
        normalized
        for normalized in (
            _normalize_uuid_value(ride_id) for ride_id in candidate_ride_ids
        )
        if normalized is not None
    }
    if not normalized_ride_ids:
        return 0

    ride_rows = db.execute(
        select(RideRequest.id, RideRequest.status).where(RideRequest.id.in_(normalized_ride_ids))
    ).all()
    ride_status_by_id = {str(ride_id): status.value for ride_id, status in ride_rows}

    resolved = 0
    resolved_at = datetime.utcnow()
    for alert in pending_alerts:
        title = alert.title or ""
        if title not in DISPATCH_ALERT_TITLES_AUTO_RESOLVABLE:
            continue
        ride_id = _notification_ride_id(alert)
        if ride_id is None:
            continue
        ride_status = ride_status_by_id.get(str(ride_id))
        if ride_status in DISPATCH_ALERT_ACTIVE_RIDE_STATUSES:
            continue
        metadata = dict(alert.metadata_json or {})
        metadata["resolved_reason"] = (
            f"Auto-resolved after ride left pending dispatch ({ride_status or 'missing'})."
        )
        alert.metadata_json = metadata
        _mark_notification_resolved(alert, resolved_at)
        db.add(alert)
        resolved += 1
    return resolved


def _list_user_notification_rows(db: Session, user_id) -> list[Notification]:
    return db.scalars(
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(desc(Notification.created_at))
    ).all()


def _filter_notifications(
    notifications: list[Notification],
    *,
    include_alerts: bool,
) -> list[Notification]:
    if include_alerts:
        return notifications
    return [item for item in notifications if not _is_operational_alert(item)]


def _effective_include_alerts(current_user: User, include_alerts: bool | None) -> bool:
    if current_user.role != UserRole.ADMIN:
        return False
    if include_alerts is None:
        return True
    return include_alerts


def _get_user_notification_or_404(
    db: Session,
    notification_id,
    current_user: User,
) -> Notification:
    notification = db.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
    )
    if notification is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        )
    return notification


def _is_operational_alert(notification: Notification) -> bool:
    return (notification.metadata_json or {}).get("kind") == "operational_alert"


def _notification_has_dedupe_key(db: Session, user_id, dedupe_key: str) -> bool:
    notifications = db.scalars(
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(desc(Notification.created_at))
        .limit(NOTIFICATION_DEDUPE_SCAN_LIMIT)
    ).all()
    for notification in notifications:
        metadata = notification.metadata_json or {}
        if isinstance(metadata, dict) and metadata.get("dedupe_key") == dedupe_key:
            return True
    return False


def _resolve_company_operational_alerts_for_ride(
    db: Session,
    company_id,
    ride_id,
    *,
    reason: str | None = None,
) -> int:
    rows = _list_company_pending_operational_alert_rows(db, company_id, limit=300)
    resolved = 0
    resolved_at = datetime.utcnow()
    for notification in rows:
        if (notification.title or "") not in DISPATCH_ALERT_TITLES_AUTO_RESOLVABLE:
            continue
        metadata = notification.metadata_json or {}
        if not _metadata_matches_ride(metadata, ride_id):
            continue
        payload = dict(metadata)
        if reason:
            payload["resolved_reason"] = reason
        notification.metadata_json = payload
        _mark_notification_resolved(notification, resolved_at)
        db.add(notification)
        resolved += 1
    return resolved


def _list_company_pending_operational_alert_rows(
    db: Session,
    company_id,
    *,
    limit: int,
) -> list[Notification]:
    return db.scalars(
        select(Notification)
        .join(User, Notification.user_id == User.id)
        .where(
            User.company_id == company_id,
            User.role == UserRole.ADMIN,
            Notification.type == NotificationType.PUSH,
            Notification.status == NotificationStatus.PENDING,
        )
        .order_by(desc(Notification.created_at))
        .limit(limit)
    ).all()


def _metadata_matches_ride(metadata: dict, ride_id) -> bool:
    target = str(ride_id)
    ride_meta = metadata.get("ride_id")
    entity_meta = metadata.get("entity_id")
    entity_type = str(metadata.get("entity_type") or "")
    return (
        (ride_meta is not None and str(ride_meta) == target)
        or (entity_type == "ride" and entity_meta is not None and str(entity_meta) == target)
    )


def _notification_ride_id(notification: Notification):
    metadata = notification.metadata_json or {}
    ride_id = metadata.get("ride_id")
    if ride_id is not None:
        return ride_id
    if str(metadata.get("entity_type") or "") == "ride":
        return metadata.get("entity_id")
    return None


def _mark_notification_resolved(notification: Notification, resolved_at: datetime) -> None:
    notification.status = NotificationStatus.SENT
    notification.sent_at = resolved_at
    if notification.read_at is None:
        notification.read_at = resolved_at


def _normalize_uuid_value(value):
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


def _string_or_none(value) -> str | None:
    if value is None:
        return None
    return str(value)


def _uuid_or_none(value):
    if value is None:
        return None
    return value
