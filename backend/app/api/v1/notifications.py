"""Notification inbox routes."""
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.notification import NotificationFeed, NotificationSummary
from app.services.notification_service import (
    list_notification_feed,
    mark_all_notifications_read,
    mark_notification_read,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationFeed)
def list_notifications(
    limit: int = 12,
    include_alerts: bool | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationFeed:
    """Return the signed-in user's notification inbox."""
    return list_notification_feed(
        db,
        current_user,
        limit=limit,
        include_alerts=include_alerts,
    )


@router.post("/{notification_id}/read", response_model=NotificationSummary)
def read_notification(
    notification_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationSummary:
    """Mark a single notification as read."""
    return mark_notification_read(db, notification_id, current_user)


@router.post("/read-all", response_model=NotificationFeed)
def read_all_notifications(
    limit: int = 12,
    include_alerts: bool | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationFeed:
    """Mark the signed-in user's visible notifications as read."""
    return mark_all_notifications_read(
        db,
        current_user,
        limit=limit,
        include_alerts=include_alerts,
    )
