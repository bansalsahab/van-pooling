import enum
import uuid

from sqlalchemy import Boolean, Column, Enum, ForeignKey, String, TIMESTAMP, func
from sqlalchemy.orm import relationship

from app.database import Base
from app.db_types import GeographyOrText, JSONType, UUIDType


class UserRole(str, enum.Enum):
    """User role enumeration."""
    EMPLOYEE = "employee"
    DRIVER = "driver"
    ADMIN = "admin"


class UserStatus(str, enum.Enum):
    """User status enumeration."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"


class User(Base):
    """
    User model representing employees, drivers, and admins.
    
    Attributes:
        id: Unique identifier
        company_id: Reference to company
        email: User email (unique)
        password_hash: Hashed password
        name: Full name
        phone: Phone number
        role: User role (employee/driver/admin)
        admin_scope: Sub-role for enterprise admin permissions
        status: Account status
        must_reset_password: Whether the user must rotate credentials after temporary reset
        home_location: Home location (PostGIS point)
        home_address: Home address text
        default_destination: Default destination (PostGIS point)
        default_destination_address: Default destination text
        notification_preferences: JSON preferences
        created_at: Creation timestamp
        updated_at: Last update timestamp
    """
    __tablename__ = "users"
    
    # Primary key
    id = Column(UUIDType, primary_key=True, default=uuid.uuid4)
    
    # Foreign keys
    company_id = Column(UUIDType, ForeignKey("companies.id", ondelete="CASCADE"))
    
    # Basic fields
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    phone = Column(String(20))
    
    # Enum fields
    role = Column(Enum(UserRole, name="user_role"), nullable=False, index=True)
    admin_scope = Column(String(32), index=True)
    status = Column(
        Enum(UserStatus, name="user_status"),
        default=UserStatus.ACTIVE,
        index=True,
    )
    must_reset_password = Column(Boolean, nullable=False, default=False)
    
    # Geospatial fields (PostGIS)
    home_location = Column(GeographyOrText(geometry_type="POINT", srid=4326))
    home_address = Column(String)
    default_destination = Column(GeographyOrText(geometry_type="POINT", srid=4326))
    default_destination_address = Column(String)
    
    # JSON field
    notification_preferences = Column(
        JSONType,
        default={"push": True, "sms": False, "email": True},
    )
    
    # Timestamps
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    company = relationship("Company", back_populates="users")
    ride_requests = relationship(
        "RideRequest",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    trip_passengers = relationship(
        "TripPassenger",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    notifications = relationship(
        "Notification",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    driven_vans = relationship("Van", back_populates="driver", foreign_keys="Van.driver_id")
    
    def __repr__(self):
        return f"<User(id={self.id}, email={self.email}, role={self.role})>"
