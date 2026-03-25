import enum
import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    Enum,
    ForeignKey,
    Integer,
    String,
    TIMESTAMP,
    func,
)
from sqlalchemy.orm import relationship

from app.database import Base
from app.db_types import GeographyOrText, UUIDType


class VanStatus(str, enum.Enum):
    """Van status enumeration."""
    AVAILABLE = "available"
    ON_TRIP = "on_trip"
    OFFLINE = "offline"
    MAINTENANCE = "maintenance"


class Van(Base):
    """
    Van model representing fleet vehicles.
    
    Attributes:
        id: Unique identifier
        company_id: Reference to company
        driver_id: Reference to driver user
        license_plate: Vehicle license plate
        capacity: Maximum passenger capacity
        current_location: Current GPS location (PostGIS point)
        current_occupancy: Current number of passengers
        status: Van status
        last_location_update: Last location update timestamp
        created_at: Creation timestamp
        updated_at: Last update timestamp
    """
    __tablename__ = "vans"
    
    # Primary key
    id = Column(UUIDType, primary_key=True, default=uuid.uuid4)
    
    # Foreign keys
    company_id = Column(UUIDType, ForeignKey("companies.id", ondelete="CASCADE"))
    driver_id = Column(UUIDType, ForeignKey("users.id", ondelete="SET NULL"))
    
    # Basic fields
    license_plate = Column(String(20), unique=True, nullable=False, index=True)
    capacity = Column(Integer, nullable=False, default=8)
    current_occupancy = Column(Integer, default=0)
    
    # Geospatial field (PostGIS)
    current_location = Column(GeographyOrText(geometry_type="POINT", srid=4326))
    
    # Status field
    status = Column(
        Enum(VanStatus, name="van_status"),
        default=VanStatus.OFFLINE,
        index=True,
    )
    
    # Timestamps
    last_location_update = Column(TIMESTAMP)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    
    # Constraints
    __table_args__ = (
        CheckConstraint(
            "current_occupancy >= 0 AND current_occupancy <= capacity",
            name="check_occupancy",
        ),
    )
    
    # Relationships
    company = relationship("Company", back_populates="vans")
    driver = relationship("User", back_populates="driven_vans", foreign_keys=[driver_id])
    trips = relationship("Trip", back_populates="van", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Van(id={self.id}, license_plate={self.license_plate}, status={self.status})>"
