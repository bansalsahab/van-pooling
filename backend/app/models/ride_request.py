"""Ride request SQLAlchemy model."""
import enum
import uuid

from sqlalchemy import Column, Enum, ForeignKey, Integer, Numeric, Text, TIMESTAMP, func
from sqlalchemy.orm import relationship

from app.database import Base
from app.db_types import GeographyOrText, UUIDType


class RideRequestStatus(str, enum.Enum):
    """Lifecycle states for a ride request."""

    REQUESTED = "requested"
    MATCHING = "matching"
    MATCHED = "matched"
    DRIVER_EN_ROUTE = "driver_en_route"
    ARRIVED_AT_PICKUP = "arrived_at_pickup"
    PICKED_UP = "picked_up"
    IN_TRANSIT = "in_transit"
    ARRIVED_AT_DESTINATION = "arrived_at_destination"
    DROPPED_OFF = "dropped_off"
    COMPLETED = "completed"
    CANCELLED_BY_EMPLOYEE = "cancelled_by_employee"
    CANCELLED_BY_ADMIN = "cancelled_by_admin"
    NO_SHOW = "no_show"
    REASSIGNED = "reassigned"
    FAILED_NO_CAPACITY = "failed_no_capacity"
    FAILED_DRIVER_UNREACHABLE = "failed_driver_unreachable"
    FAILED_OPERATIONAL_ISSUE = "failed_operational_issue"
    SCHEDULED_REQUESTED = "scheduled_requested"
    SCHEDULED_QUEUED = "scheduled_queued"
    MATCHING_AT_DISPATCH_WINDOW = "matching_at_dispatch_window"


class RideRequest(Base):
    """Passenger ride request."""

    __tablename__ = "ride_requests"

    id = Column(UUIDType, primary_key=True, default=uuid.uuid4)
    user_id = Column(UUIDType, ForeignKey("users.id", ondelete="CASCADE"))
    company_id = Column(UUIDType, ForeignKey("companies.id", ondelete="CASCADE"))
    pickup_location = Column(GeographyOrText(geometry_type="POINT", srid=4326), nullable=False)
    pickup_address = Column(Text, nullable=False)
    destination = Column(GeographyOrText(geometry_type="POINT", srid=4326), nullable=False)
    destination_address = Column(Text, nullable=False)
    status = Column(
        Enum(RideRequestStatus, name="ride_request_status"),
        default=RideRequestStatus.REQUESTED,
        index=True,
    )
    scheduled_time = Column(TIMESTAMP)
    requested_at = Column(TIMESTAMP, server_default=func.now())
    expires_at = Column(TIMESTAMP)
    estimated_wait_minutes = Column(Integer)
    estimated_cost = Column(Numeric(10, 2))
    actual_pickup_time = Column(TIMESTAMP)
    actual_dropoff_time = Column(TIMESTAMP)
    rating = Column(Integer)
    feedback = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="ride_requests")
    company = relationship("Company", back_populates="ride_requests")
    trip_passenger = relationship("TripPassenger", back_populates="ride_request", uselist=False)
