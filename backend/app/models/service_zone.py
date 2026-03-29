"""Service zone polygon model."""
import enum
import uuid

from sqlalchemy import Boolean, Column, Enum, ForeignKey, String, TIMESTAMP, Text, func

from app.database import Base
from app.db_types import JSONType, UUIDType


class ServiceZoneType(str, enum.Enum):
    """Supported zone categories."""

    PICKUP = "pickup"
    DESTINATION = "destination"


class ServiceZone(Base):
    """Tenant-scoped polygon geofence definition."""

    __tablename__ = "service_zones"

    id = Column(UUIDType, primary_key=True, default=uuid.uuid4)
    company_id = Column(UUIDType, ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    name = Column(String(255), nullable=False)
    zone_type = Column(Enum(ServiceZoneType, name="service_zone_type"), index=True, nullable=False)
    polygon_geojson = Column(JSONType, nullable=False, default=dict)
    notes = Column(Text)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
