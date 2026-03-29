"""Recurring ride schedule model."""
import enum
import uuid

from sqlalchemy import Column, Date, Enum, Float, ForeignKey, String, TIMESTAMP, Text, func

from app.database import Base
from app.db_types import UUIDType


class RecurringRideRuleStatus(str, enum.Enum):
    """Recurring rule status values."""

    ACTIVE = "active"
    PAUSED = "paused"


class RecurringRideRule(Base):
    """Weekday recurring ride template for an employee."""

    __tablename__ = "recurring_ride_rules"

    id = Column(UUIDType, primary_key=True, default=uuid.uuid4)
    user_id = Column(UUIDType, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    company_id = Column(UUIDType, ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    name = Column(String(255), nullable=False)
    status = Column(
        Enum(RecurringRideRuleStatus, name="recurring_ride_rule_status"),
        default=RecurringRideRuleStatus.ACTIVE,
        index=True,
        nullable=False,
    )
    weekdays = Column(String(32), nullable=False, default="0,1,2,3,4")
    pickup_time_local = Column(String(5), nullable=False)
    timezone = Column(String(64), nullable=False, default="Asia/Kolkata")
    pickup_address = Column(Text, nullable=False)
    pickup_latitude = Column(Float, nullable=False)
    pickup_longitude = Column(Float, nullable=False)
    destination_address = Column(Text, nullable=False)
    destination_latitude = Column(Float, nullable=False)
    destination_longitude = Column(Float, nullable=False)
    last_generated_for_date = Column(Date, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
