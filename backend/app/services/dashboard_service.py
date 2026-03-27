"""Dashboard and fleet service helpers."""
from datetime import datetime

from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.orm import Session

from app.geo import parse_point
from app.models.ride_request import RideRequest, RideRequestStatus
from app.models.trip import Trip, TripStatus
from app.models.trip_passenger import TripPassenger
from app.models.user import User, UserRole
from app.models.van import Van, VanStatus
from app.schemas.dashboard import (
    AdminDashboardSummary,
    DriverDashboardSummary,
    DriverScheduledWorkSummary,
)
from app.schemas.trip import DriverTripSummary, TripPassengerSummary, TripSummary
from app.schemas.user import UserSummary
from app.schemas.van import VanSummary
from app.services.ride_service import serialize_ride_request
from app.services.lifecycle_service import RIDE_PENDING_MATCH_STATUSES, RIDE_PENDING_SCHEDULED_STATUSES, TRIP_ACTIVE_STATUSES
from app.services.notification_service import count_open_alerts


DRIVER_SCHEDULED_WORK_STATUSES = {
    RideRequestStatus.MATCHED,
    RideRequestStatus.DRIVER_EN_ROUTE,
    RideRequestStatus.ARRIVED_AT_PICKUP,
}
ADMIN_DISPATCH_BOARD_STATUSES = RIDE_PENDING_MATCH_STATUSES | RIDE_PENDING_SCHEDULED_STATUSES


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
            or_(
                RideRequest.status.in_(list(ADMIN_DISPATCH_BOARD_STATUSES)),
                and_(
                    RideRequest.scheduled_time.is_not(None),
                    RideRequest.status.in_(list(DRIVER_SCHEDULED_WORK_STATUSES)),
                ),
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
    upcoming_scheduled_work: list[DriverScheduledWorkSummary] = []

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
        upcoming_scheduled_work = _list_driver_upcoming_scheduled_work(db, driver, van.id)

    return DriverDashboardSummary(
        driver_id=driver.id,
        driver_name=driver.name,
        van=van_summary,
        active_trip=active_trip,
        upcoming_scheduled_work=upcoming_scheduled_work,
    )


def _list_driver_upcoming_scheduled_work(
    db: Session,
    driver: User,
    van_id,
) -> list[DriverScheduledWorkSummary]:
    assignments = db.scalars(
        select(TripPassenger)
        .join(Trip, TripPassenger.trip_id == Trip.id)
        .join(RideRequest, TripPassenger.ride_request_id == RideRequest.id)
        .where(
            Trip.company_id == driver.company_id,
            Trip.van_id == van_id,
            RideRequest.scheduled_time.is_not(None),
            RideRequest.status.in_(list(DRIVER_SCHEDULED_WORK_STATUSES)),
        )
        .order_by(
            RideRequest.scheduled_time.asc(),
            desc(Trip.created_at),
        )
        .limit(8)
    ).all()

    now = datetime.utcnow()
    results: list[DriverScheduledWorkSummary] = []
    for assignment in assignments:
        ride = assignment.ride_request
        if ride is None:
            continue
        ride_summary = serialize_ride_request(ride)
        if ride_summary.minutes_until_pickup is not None and ride_summary.minutes_until_pickup < -30:
            continue
        results.append(
            DriverScheduledWorkSummary(
                ride_id=ride.id,
                trip_id=assignment.trip_id,
                ride_status=ride.status.value,
                pickup_address=ride.pickup_address,
                destination_address=ride.destination_address,
                scheduled_time=ride_summary.scheduled_time,
                dispatch_window_opens_at=ride_summary.dispatch_window_opens_at,
                minutes_until_dispatch_window=ride_summary.minutes_until_dispatch_window,
                minutes_until_pickup=ride_summary.minutes_until_pickup,
                schedule_phase=ride_summary.schedule_phase,
                assignment_timing_note=ride_summary.assignment_timing_note,
                delay_explanation=(
                    ride_summary.delay_explanation
                    if ride_summary.delay_explanation is not None
                    else f"Scheduled pickup in {max(0, int((ride.scheduled_time - now).total_seconds() // 60))} min."
                    if ride.scheduled_time is not None
                    else None
                ),
                passenger_name=assignment.user.name if assignment.user else None,
            )
        )
    return results


def serialize_driver_trip(trip: Trip) -> DriverTripSummary:
    """Convert a trip model into a driver-friendly response."""
    return DriverTripSummary(
        id=trip.id,
        status=trip.status.value,
        van_id=trip.van_id,
        route=trip.route or {},
        estimated_duration_minutes=trip.estimated_duration_minutes,
        accepted_at=trip.accepted_at or trip.started_at,
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
        accepted_at=trip.accepted_at or trip.started_at,
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
