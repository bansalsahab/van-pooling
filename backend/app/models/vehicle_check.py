"""Driver vehicle inspection model."""
import enum
import uuid

from sqlalchemy import Column, Enum, ForeignKey, String, TIMESTAMP, Text, func

from app.database import Base
from app.db_types import JSONType, UUIDType


class VehicleCheckStatus(str, enum.Enum):
    """Vehicle check outcome statuses."""

    PASSED = "passed"
    FAILED = "failed"


class VehicleCheck(Base):
    """Pre-shift vehicle inspection submitted by a driver."""

    __tablename__ = "vehicle_checks"

    id = Column(UUIDType, primary_key=True, default=uuid.uuid4)
    company_id = Column(UUIDType, ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    driver_id = Column(UUIDType, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    van_id = Column(UUIDType, ForeignKey("vans.id", ondelete="SET NULL"), index=True)
    shift_id = Column(UUIDType, ForeignKey("driver_shifts.id", ondelete="SET NULL"), index=True)
    status = Column(
        Enum(VehicleCheckStatus, name="vehicle_check_status"),
        nullable=False,
        default=VehicleCheckStatus.PASSED,
        index=True,
    )
    checklist = Column(JSONType, nullable=False, default=dict)
    notes = Column(Text, nullable=True)
    submitted_at = Column(TIMESTAMP, nullable=False, server_default=func.now(), index=True)
    source = Column(String(32), nullable=False, default="driver")
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
