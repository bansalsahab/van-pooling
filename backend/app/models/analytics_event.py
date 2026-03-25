"""Analytics event model."""
import enum
import uuid

from sqlalchemy import Column, Enum, ForeignKey, TIMESTAMP, func
from sqlalchemy.orm import relationship

from app.database import Base
from app.db_types import GeographyOrText, JSONType, UUIDType


class EventType(str, enum.Enum):
    """Tracked analytics event categories."""

    RIDE_REQUESTED = "ride_requested"
    RIDE_MATCHED = "ride_matched"
    RIDE_STARTED = "ride_started"
    RIDE_COMPLETED = "ride_completed"
    RIDE_CANCELLED = "ride_cancelled"
    VAN_ONLINE = "van_online"
    VAN_OFFLINE = "van_offline"
    DEMAND_SURGE = "demand_surge"


class AnalyticsEvent(Base):
    """Operational analytics event."""

    __tablename__ = "analytics_events"

    id = Column(UUIDType, primary_key=True, default=uuid.uuid4)
    company_id = Column(UUIDType, ForeignKey("companies.id", ondelete="CASCADE"))
    event_type = Column(Enum(EventType, name="event_type"), nullable=False, index=True)
    payload = Column(JSONType, nullable=False, default=dict)
    location = Column(GeographyOrText(geometry_type="POINT", srid=4326))
    created_at = Column(TIMESTAMP, server_default=func.now())

    company = relationship("Company", back_populates="analytics_events")
