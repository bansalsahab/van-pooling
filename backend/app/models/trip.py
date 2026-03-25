"""Trip SQLAlchemy model."""
import enum
import uuid

from sqlalchemy import Column, Enum, ForeignKey, Integer, TIMESTAMP, func
from sqlalchemy.orm import relationship

from app.database import Base
from app.db_types import JSONType, UUIDType


class TripStatus(str, enum.Enum):
    """Lifecycle states for trips."""

    PLANNED = "planned"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class Trip(Base):
    """Van trip with its optimized route payload."""

    __tablename__ = "trips"

    id = Column(UUIDType, primary_key=True, default=uuid.uuid4)
    van_id = Column(UUIDType, ForeignKey("vans.id", ondelete="CASCADE"))
    company_id = Column(UUIDType, ForeignKey("companies.id", ondelete="CASCADE"))
    status = Column(
        Enum(TripStatus, name="trip_status"),
        default=TripStatus.PLANNED,
        index=True,
    )
    route = Column(JSONType, nullable=False, default=dict)
    total_distance_meters = Column(Integer)
    estimated_duration_minutes = Column(Integer)
    actual_duration_minutes = Column(Integer)
    started_at = Column(TIMESTAMP)
    completed_at = Column(TIMESTAMP)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    van = relationship("Van", back_populates="trips")
    company = relationship("Company", back_populates="trips")
    trip_passengers = relationship(
        "TripPassenger",
        back_populates="trip",
        cascade="all, delete-orphan",
    )
