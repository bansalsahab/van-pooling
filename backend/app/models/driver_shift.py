"""Driver shift scheduling and timesheet model."""
import enum
import uuid

from sqlalchemy import Column, Enum, ForeignKey, String, TIMESTAMP, Text, func

from app.database import Base
from app.db_types import UUIDType


class DriverShiftStatus(str, enum.Enum):
    """Shift lifecycle statuses."""

    SCHEDULED = "scheduled"
    CLOCKED_IN = "clocked_in"
    CLOCKED_OUT = "clocked_out"
    MISSED = "missed"


class DriverShift(Base):
    """Shift assignment and clock events for one driver."""

    __tablename__ = "driver_shifts"

    id = Column(UUIDType, primary_key=True, default=uuid.uuid4)
    company_id = Column(UUIDType, ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    driver_id = Column(UUIDType, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status = Column(
        Enum(DriverShiftStatus, name="driver_shift_status"),
        nullable=False,
        default=DriverShiftStatus.SCHEDULED,
        index=True,
    )
    scheduled_start_at = Column(TIMESTAMP, nullable=True)
    scheduled_end_at = Column(TIMESTAMP, nullable=True)
    clocked_in_at = Column(TIMESTAMP, nullable=True)
    clocked_out_at = Column(TIMESTAMP, nullable=True)
    notes = Column(Text, nullable=True)
    source = Column(String(32), nullable=False, default="driver")
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
