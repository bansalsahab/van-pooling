"""Notification model."""
import enum
import uuid

from sqlalchemy import Column, Enum, ForeignKey, String, Text, TIMESTAMP, func
from sqlalchemy.orm import relationship

from app.database import Base
from app.db_types import JSONType, UUIDType


class NotificationType(str, enum.Enum):
    """Supported outbound notification channels."""

    PUSH = "push"
    SMS = "sms"
    EMAIL = "email"


class NotificationStatus(str, enum.Enum):
    """Delivery status for notifications."""

    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"


class Notification(Base):
    """Queued notification for a user."""

    __tablename__ = "notifications"

    id = Column(UUIDType, primary_key=True, default=uuid.uuid4)
    user_id = Column(UUIDType, ForeignKey("users.id", ondelete="CASCADE"))
    type = Column(Enum(NotificationType, name="notification_type"), nullable=False)
    title = Column(String(255))
    message = Column(Text, nullable=False)
    status = Column(
        Enum(NotificationStatus, name="notification_status"),
        default=NotificationStatus.PENDING,
    )
    metadata_json = Column("metadata", JSONType)
    sent_at = Column(TIMESTAMP)
    created_at = Column(TIMESTAMP, server_default=func.now())

    user = relationship("User", back_populates="notifications")
