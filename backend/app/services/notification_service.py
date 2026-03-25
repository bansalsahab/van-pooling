"""Notification and operational alert helpers."""
from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.notification import Notification, NotificationStatus, NotificationType
from app.models.user import User, UserRole
from app.schemas.alert import AlertSummary


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
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return serialize_alert(notification)


def _string_or_none(value) -> str | None:
    if value is None:
        return None
    return str(value)


def _uuid_or_none(value):
    if value is None:
        return None
    return value
