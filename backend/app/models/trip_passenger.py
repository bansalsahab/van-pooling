"""Trip passenger join model."""
import enum
import uuid

from sqlalchemy import CheckConstraint, Column, Enum, ForeignKey, Integer, TIMESTAMP, func
from sqlalchemy.orm import relationship

from app.database import Base
from app.db_types import UUIDType


class PassengerStatus(str, enum.Enum):
    """Passenger states inside a trip."""

    ASSIGNED = "assigned"
    NOTIFIED = "notified"
    PICKED_UP = "picked_up"
    DROPPED_OFF = "dropped_off"
    NO_SHOW = "no_show"


class TripPassenger(Base):
    """Assignment of a rider to a trip."""

    __tablename__ = "trip_passengers"

    id = Column(UUIDType, primary_key=True, default=uuid.uuid4)
    trip_id = Column(UUIDType, ForeignKey("trips.id", ondelete="CASCADE"))
    ride_request_id = Column(
        UUIDType,
        ForeignKey("ride_requests.id", ondelete="CASCADE"),
    )
    user_id = Column(UUIDType, ForeignKey("users.id", ondelete="CASCADE"))
    pickup_stop_index = Column(Integer, nullable=False)
    dropoff_stop_index = Column(Integer, nullable=False)
    status = Column(
        Enum(PassengerStatus, name="passenger_status"),
        default=PassengerStatus.ASSIGNED,
    )
    pickup_eta = Column(TIMESTAMP)
    actual_pickup_time = Column(TIMESTAMP)
    actual_dropoff_time = Column(TIMESTAMP)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint(
            "pickup_stop_index < dropoff_stop_index",
            name="check_stop_order",
        ),
    )

    trip = relationship("Trip", back_populates="trip_passengers")
    ride_request = relationship("RideRequest", back_populates="trip_passenger")
    user = relationship("User", back_populates="trip_passengers")
