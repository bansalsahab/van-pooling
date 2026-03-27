"""Persisted dispatch and lifecycle audit events."""
import uuid

from sqlalchemy import Column, ForeignKey, String, TIMESTAMP, Text, func
from sqlalchemy.orm import relationship

from app.database import Base
from app.db_types import JSONType, UUIDType


class DispatchEvent(Base):
    """Audit event for ride, trip, and dispatch operations."""

    __tablename__ = "dispatch_events"

    id = Column(UUIDType, primary_key=True, default=uuid.uuid4)
    company_id = Column(UUIDType, ForeignKey("companies.id", ondelete="CASCADE"))
    ride_id = Column(UUIDType, ForeignKey("ride_requests.id", ondelete="SET NULL"))
    trip_id = Column(UUIDType, ForeignKey("trips.id", ondelete="SET NULL"))
    actor_user_id = Column(UUIDType, ForeignKey("users.id", ondelete="SET NULL"))
    actor_type = Column(String(50), nullable=False, index=True)
    event_type = Column(String(100), nullable=False, index=True)
    from_state = Column(String(100))
    to_state = Column(String(100))
    reason = Column(Text)
    metadata_json = Column("metadata", JSONType, default=dict)
    created_at = Column(TIMESTAMP, server_default=func.now(), index=True)

    actor = relationship("User", foreign_keys=[actor_user_id])
    ride = relationship("RideRequest", foreign_keys=[ride_id])
    trip = relationship("Trip", foreign_keys=[trip_id])
