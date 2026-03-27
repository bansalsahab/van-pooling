"""Dashboard and fleet service helpers."""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.geo import parse_point
from app.models.ride_request import RideRequest, RideRequestStatus
from app.models.trip import Trip, TripStatus
from app.models.trip_passenger import TripPassenger
from app.models.user import User, UserRole
from app.models.van import Van, VanStatus
from app.schemas.dashboard import AdminDashboardSummary, DriverDashboardSummary
from app.schemas.trip import DriverTripSummary, TripPassengerSummary, TripSummary
from app.schemas.user import UserSummary
from app.schemas.van import VanSummary
from app.services.lifecycle_service import RIDE_PENDING_MATCH_STATUSES, RIDE_PENDING_SCHEDULED_STATUSES, TRIP_ACTIVE_STATUSES
from app.services.notification_service import count_open_alerts


def serialize_van_summary(van: Van, driver_name: str | None = None) -> VanSummary:
    """Convert a van model into response data with parsed coordinates."""
    coordinates = parse_point(van.current_location)
    latitude = coordinates[0] if coordinates else None
    longitude = coordinates[1] if coordinates else None
    return VanSummary(
        id=van.id,
        license_plate=van.license_plate,
        capacity=van.capacity,
        current_occupancy=van.current_occupancy,
        status=van.status.value,
        driver_id=van.driver_id,
        driver_name=driver_name,
        last_location_update=van.last_location_update,
        latitude=latitude,
        longitude=longitude,
    )


def list_company_vans(db: Session, company_id) -> list[VanSummary]:
    """Return vans for a company, including assigned driver names."""
    rows = db.execute(
        select(Van, User.name)
        .outerjoin(User, Van.driver_id == User.id)
        .where(Van.company_id == company_id)
        .order_by(Van.license_plate)
    ).all()
    return [serialize_van_summary(van, driver_name) for van, driver_name in rows]


def list_company_employees(db: Session, company_id) -> list[UserSummary]:
    """Return employees for a company."""
    users = db.scalars(
        select(User)
        .where(
            User.company_id == company_id,
            User.role == UserRole.EMPLOYEE,
        )
        .order_by(User.name)
    ).all()
    return [
        UserSummary(
            id=user.id,
            company_id=user.company_id,
            name=user.name,
            email=user.email,
            phone=user.phone,
            role=user.role.value,
            status=user.status.value,
        )
        for user in users
    ]


def get_admin_dashboard(db: Session, company_id, admin_user_id) -> AdminDashboardSummary:
    """Return the core admin metrics for a company."""
    employees_count = db.scalar(
        select(func.count(User.id)).where(
            User.company_id == company_id,
            User.role == UserRole.EMPLOYEE,
        )
    ) or 0
    drivers_count = db.scalar(
        select(func.count(User.id)).where(
            User.company_id == company_id,
            User.role == UserRole.DRIVER,
        )
    ) or 0
    total_vans = db.scalar(
        select(func.count(Van.id)).where(Van.company_id == company_id)
    ) or 0
    available_vans = db.scalar(
        select(func.count(Van.id)).where(
            Van.company_id == company_id,
            Van.status == VanStatus.AVAILABLE,
        )
    ) or 0
    active_vans = db.scalar(
        select(func.count(Van.id)).where(
            Van.company_id == company_id,
            Van.status == VanStatus.ON_TRIP,
        )
    ) or 0
    pending_requests = db.scalar(
        select(func.count(RideRequest.id)).where(
            RideRequest.company_id == company_id,
            RideRequest.status.in_(
                list(RIDE_PENDING_MATCH_STATUSES | RIDE_PENDING_SCHEDULED_STATUSES)
            ),
        )
    ) or 0
    active_trips = db.scalar(
        select(func.count(Trip.id)).where(
            Trip.company_id == company_id,
            Trip.status.in_(list(TRIP_ACTIVE_STATUSES)),
        )
    ) or 0
    admin_user = db.get(User, admin_user_id)
    open_alerts = count_open_alerts(db, admin_user) if admin_user is not None else 0

    return AdminDashboardSummary(
        company_id=company_id,
        employees_count=employees_count,
        drivers_count=drivers_count,
        total_vans=total_vans,
        available_vans=available_vans,
        active_vans=active_vans,
        pending_requests=pending_requests,
        active_trips=active_trips,
        open_alerts=open_alerts,
    )


def get_driver_dashboard(db: Session, driver: User) -> DriverDashboardSummary:
    """Return the driver's assigned van and active trip."""
    van = db.scalar(select(Van).where(Van.driver_id == driver.id))
    active_trip = None
    van_summary = None

    if van is not None:
        van_summary = serialize_van_summary(van, driver.name)
        trip = db.scalars(
            select(Trip)
            .where(
                Trip.van_id == van.id,
                Trip.status.in_(list(TRIP_ACTIVE_STATUSES) + [TripStatus.PLANNED]),
            )
            .order_by(Trip.created_at.desc())
        ).first()
        if trip is not None:
            active_trip = serialize_driver_trip(trip)

    return DriverDashboardSummary(
        driver_id=driver.id,
        driver_name=driver.name,
        van=van_summary,
        active_trip=active_trip,
    )


def serialize_driver_trip(trip: Trip) -> DriverTripSummary:
    """Convert a trip model into a driver-friendly response."""
    return DriverTripSummary(
        id=trip.id,
        status=trip.status.value,
        van_id=trip.van_id,
        route=trip.route or {},
        estimated_duration_minutes=trip.estimated_duration_minutes,
        started_at=trip.started_at,
        passenger_count=len(trip.trip_passengers),
        passengers=[serialize_trip_passenger(item) for item in trip.trip_passengers],
    )


def serialize_trip_passenger(item: TripPassenger) -> TripPassengerSummary:
    """Convert a passenger assignment into response data."""
    return TripPassengerSummary(
        ride_request_id=item.ride_request_id,
        user_id=item.user_id,
        passenger_name=item.user.name if item.user else None,
        status=item.status.value,
        pickup_address=item.ride_request.pickup_address if item.ride_request else None,
        destination_address=(
            item.ride_request.destination_address if item.ride_request else None
        ),
        pickup_stop_index=item.pickup_stop_index,
        dropoff_stop_index=item.dropoff_stop_index,
    )


def serialize_trip_summary(trip: Trip) -> TripSummary:
    """Convert a trip model into an admin-friendly summary."""
    return TripSummary(
        id=trip.id,
        status=trip.status.value,
        van_id=trip.van_id,
        van_license_plate=trip.van.license_plate if trip.van else None,
        route=trip.route or {},
        estimated_duration_minutes=trip.estimated_duration_minutes,
        started_at=trip.started_at,
        created_at=trip.created_at,
        passenger_count=len(trip.trip_passengers),
        passengers=[serialize_trip_passenger(item) for item in trip.trip_passengers],
    )


def list_company_trips(db: Session, company_id) -> list[TripSummary]:
    """Return trips for the admin's company."""
    trips = db.scalars(
        select(Trip)
        .where(Trip.company_id == company_id)
        .order_by(Trip.created_at.desc())
    ).all()
    return [serialize_trip_summary(trip) for trip in trips]
