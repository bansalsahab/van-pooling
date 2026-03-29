"""Company SQLAlchemy model."""
import uuid

from sqlalchemy import Column, Integer, String, TIMESTAMP, func
from sqlalchemy.orm import relationship

from app.database import Base
from app.db_types import GeographyOrText, JSONType, UUIDType


class Company(Base):
    """
    Company model representing corporate entities.
    
    Attributes:
        id: Unique identifier
        name: Company name
        domain: Email domain for SSO
        service_zone: Geographic service area (PostGIS polygon)
        operating_hours: JSON with operating hours
        max_pickup_radius_meters: Maximum pickup radius
        max_detour_minutes: Maximum detour time allowed
        created_at: Creation timestamp
        updated_at: Last update timestamp
    """
    __tablename__ = "companies"
    
    # Primary key
    id = Column(UUIDType, primary_key=True, default=uuid.uuid4)
    
    # Basic fields
    name = Column(String(255), nullable=False)
    domain = Column(String(255), unique=True, nullable=False, index=True)
    
    # Geospatial field (PostGIS)
    service_zone = Column(GeographyOrText(geometry_type="POLYGON", srid=4326))
    
    # Configuration fields
    operating_hours = Column(
        JSONType,
        default={
            "weekday": {"start": "07:00", "end": "22:00"},
            "weekend": {"start": "08:00", "end": "20:00"},
        },
    )
    policy_config = Column(JSONType, default={})
    identity_config = Column(JSONType, default={})
    max_pickup_radius_meters = Column(Integer, default=800)
    max_detour_minutes = Column(Integer, default=15)
    
    # Timestamps
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    users = relationship("User", back_populates="company", cascade="all, delete-orphan")
    vans = relationship("Van", back_populates="company", cascade="all, delete-orphan")
    ride_requests = relationship("RideRequest", back_populates="company", cascade="all, delete-orphan")
    trips = relationship("Trip", back_populates="company", cascade="all, delete-orphan")
    analytics_events = relationship("AnalyticsEvent", back_populates="company", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Company(id={self.id}, name={self.name})>"
