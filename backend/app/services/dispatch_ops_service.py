"""Operational dispatch interventions for admins and drivers."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.ride_request import RideRequestStatus
from app.models.trip import Trip, TripStatus
from app.models.trip_passenger import PassengerStatus, TripPassenger
from app.models.user import User
from app.models.van import Van, VanStatus
from app.schemas.trip import TripSummary
from app.services.dashboard_service import serialize_trip_summary
from app.services.lifecycle_service import ride_is_terminal, synchronize_trip_lifecycle
from app.services.notification_service import create_admin_alert, queue_notification
from app.services.routing_service import rebuild_trip_route


def _get_company_trip_or_404(db: Session, company_id, trip_id: UUID) -> Trip:
    trip = db.scalar(
        select(Trip).where(
            Trip.id == trip_id,
            Trip.company_id == company_id,
        )
    )
    if trip is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found.",
        )
    return trip


def _active_assignment_count(trip: Trip) -> int:
    return sum(
        1
        for item in trip.trip_passengers
        if item.ride_request is not None
        and item.status in {PassengerStatus.ASSIGNED, PassengerStatus.NOTIFIED, PassengerStatus.PICKED_UP}
        and not ride_is_terminal(item.ride_request.status)
    )


def _notify_trip_riders(
    db: Session,
    trip: Trip,
    title: str,
    message_factory,
) -> None:
    for assignment in trip.trip_passengers:
        if assignment.ride_request is None or assignment.user_id is None:
            continue
        if ride_is_terminal(assignment.ride_request.status):
            continue
        queue_notification(
            db,
            assignment.user_id,
            title=title,
            message=message_factory(assignment),
            metadata={
                "trip_id": str(trip.id),
                "ride_id": str(assignment.ride_request_id),
            },
        )


def reassign_trip_van(
    db: Session,
    admin_user: User,
    trip_id: UUID,
    target_van_id: UUID,
    reason: str | None = None,
) -> TripSummary:
    """Move a trip to another available van in the same company."""
    trip = _get_company_trip_or_404(db, admin_user.company_id, trip_id)
    if trip.status in {
        TripStatus.COMPLETED,
        TripStatus.CANCELLED,
        TripStatus.FAILED_OPERATIONAL_ISSUE,
    }:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only active or dispatch-ready trips can be reassigned.",
        )

    target_van = db.scalar(
        select(Van).where(
            Van.id == target_van_id,
            Van.company_id == admin_user.company_id,
            Van.driver_id.is_not(None),
            Van.status == VanStatus.AVAILABLE,
        )
    )
    if target_van is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target van is not available for reassignment.",
        )
    if trip.van_id == target_van.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trip is already assigned to this van.",
        )

    active_passengers = _active_assignment_count(trip)
    if active_passengers <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trip has no active passengers to reassign.",
        )
    if target_van.capacity < active_passengers:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Target van does not have enough capacity for this trip.",
        )

    previous_van = trip.van
    if previous_van is not None:
        previous_van.current_occupancy = max(
            0,
            (previous_van.current_occupancy or 0) - active_passengers,
        )
        if previous_van.current_occupancy == 0:
            previous_van.status = VanStatus.AVAILABLE
        db.add(previous_van)
        if previous_van.driver_id is not None:
            queue_notification(
                db,
                previous_van.driver_id,
                title="Trip reassigned away",
                message=f"Trip {str(trip.id)[:8]} was moved to another van by dispatch.",
                metadata={"trip_id": str(trip.id)},
            )

    target_van.current_occupancy = min(
        target_van.capacity,
        (target_van.current_occupancy or 0) + active_passengers,
    )
    target_van.status = VanStatus.ON_TRIP
    trip.van = target_van
    db.add(target_van)

    synchronize_trip_lifecycle(trip)
    rebuild_trip_route(db, trip)
    db.add(trip)

    if target_van.driver_id is not None:
        queue_notification(
            db,
            target_van.driver_id,
            title="Trip reassigned to you",
            message=(
                f"Dispatch moved trip {str(trip.id)[:8]} to your van."
                + (f" Reason: {reason}" if reason else "")
            ),
            metadata={"trip_id": str(trip.id)},
        )

    _notify_trip_riders(
        db,
        trip,
        title="Ride reassigned",
        message_factory=lambda assignment: (
            f"Your ride was reassigned to van {target_van.license_plate}."
            + (f" Reason: {reason}" if reason else "")
        ),
    )
    create_admin_alert(
        db,
        admin_user.company_id,
        title="Trip reassigned",
        message=(
            f"Trip {str(trip.id)[:8]} moved to van {target_van.license_plate}."
            + (f" Reason: {reason}" if reason else "")
        ),
        severity="medium",
        metadata={
            "trip_id": str(trip.id),
            "entity_type": "trip",
            "entity_id": str(trip.id),
        },
    )
    db.commit()
    db.refresh(trip)
    return serialize_trip_summary(trip)


def cancel_trip_by_admin(
    db: Session,
    admin_user: User,
    trip_id: UUID,
    reason: str | None = None,
) -> TripSummary:
    """Cancel a trip before any rider is actively onboard."""
    trip = _get_company_trip_or_404(db, admin_user.company_id, trip_id)
    if trip.status in {
        TripStatus.COMPLETED,
        TripStatus.CANCELLED,
        TripStatus.FAILED_OPERATIONAL_ISSUE,
    }:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trip is already closed.",
        )
    if any(item.status == PassengerStatus.PICKED_UP for item in trip.trip_passengers):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trips with onboard riders cannot be cancelled. Reassign them instead.",
        )
    active_passengers = _active_assignment_count(trip)

    for assignment in trip.trip_passengers:
        if assignment.ride_request is None:
            continue
        if ride_is_terminal(assignment.ride_request.status):
            continue
        assignment.ride_request.status = RideRequestStatus.CANCELLED_BY_ADMIN
        queue_notification(
            db,
            assignment.user_id,
            title="Ride cancelled by dispatch",
            message=(
                "Dispatch cancelled your ride before pickup."
                + (f" Reason: {reason}" if reason else "")
            ),
            metadata={
                "trip_id": str(trip.id),
                "ride_id": str(assignment.ride_request_id),
            },
        )
        db.add(assignment.ride_request)
        db.add(assignment)

    if trip.van is not None:
        trip.van.current_occupancy = max(
            0,
            (trip.van.current_occupancy or 0) - active_passengers,
        )
        if trip.van.current_occupancy == 0:
            trip.van.status = VanStatus.AVAILABLE
        if trip.van.driver_id is not None:
            queue_notification(
                db,
                trip.van.driver_id,
                title="Trip cancelled",
                message=(
                    f"Dispatch cancelled trip {str(trip.id)[:8]}."
                    + (f" Reason: {reason}" if reason else "")
                ),
                metadata={"trip_id": str(trip.id)},
            )
        db.add(trip.van)

    trip.status = TripStatus.CANCELLED
    trip.completed_at = datetime.utcnow()
    db.add(trip)
    create_admin_alert(
        db,
        admin_user.company_id,
        title="Trip cancelled",
        message=(
            f"Trip {str(trip.id)[:8]} was cancelled by dispatch."
            + (f" Reason: {reason}" if reason else "")
        ),
        severity="high",
        metadata={
            "trip_id": str(trip.id),
            "entity_type": "trip",
            "entity_id": str(trip.id),
        },
    )
    db.commit()
    db.refresh(trip)
    return serialize_trip_summary(trip)


def mark_passenger_no_show(
    db: Session,
    driver_user: User,
    trip_id: UUID,
    ride_request_id: UUID,
) -> None:
    """Mark a rider as a no-show and alert dispatch."""
    trip = db.scalar(
        select(Trip)
        .join(Van, Trip.van_id == Van.id)
        .where(
            Trip.id == trip_id,
            Trip.company_id == driver_user.company_id,
            Van.driver_id == driver_user.id,
        )
    )
    if trip is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found for this driver.",
        )

    assignment = db.scalar(
        select(TripPassenger).where(
            TripPassenger.trip_id == trip_id,
            TripPassenger.ride_request_id == ride_request_id,
        )
    )
    if assignment is None or assignment.ride_request is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Passenger assignment not found.",
        )
    if assignment.status not in {PassengerStatus.ASSIGNED, PassengerStatus.NOTIFIED}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending pickup passengers can be marked as no-show.",
        )

    assignment.status = PassengerStatus.NO_SHOW
    assignment.ride_request.status = RideRequestStatus.NO_SHOW
    db.add(assignment)
    db.add(assignment.ride_request)

    if trip.van is not None:
        trip.van.current_occupancy = max(0, (trip.van.current_occupancy or 0) - 1)
        if trip.van.current_occupancy == 0 and not any(
            item.status == PassengerStatus.PICKED_UP for item in trip.trip_passengers if item.id != assignment.id
        ):
            trip.van.status = VanStatus.AVAILABLE
        db.add(trip.van)

    queue_notification(
        db,
        assignment.user_id,
        title="Ride marked as no-show",
        message="Your driver reported that you were not present at pickup.",
        metadata={
            "trip_id": str(trip.id),
            "ride_id": str(assignment.ride_request_id),
        },
    )

    synchronize_trip_lifecycle(trip)
    rebuild_trip_route(db, trip)
    if trip.status == TripStatus.COMPLETED and trip.completed_at is None:
        trip.completed_at = datetime.utcnow()
    db.add(trip)

    create_admin_alert(
        db,
        driver_user.company_id,
        title="Rider no-show reported",
        message=(
            f"Driver {driver_user.name} marked rider "
            f"{assignment.user.name if assignment.user else str(assignment.user_id)[:8]} as a no-show."
        ),
        severity="high",
        metadata={
            "trip_id": str(trip.id),
            "ride_id": str(assignment.ride_request_id),
            "entity_type": "ride",
            "entity_id": str(assignment.ride_request_id),
        },
    )

    db.commit()
