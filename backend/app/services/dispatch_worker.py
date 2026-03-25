"""Background dispatch worker and startup recovery helpers."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy import inspect, select, text

from app.core.config import settings
from app.database import SessionLocal, engine
from app.models.ride_request import RideRequest, RideRequestStatus
from app.models.trip import TripStatus
from app.services.lifecycle_service import LEGACY_RIDE_STATUS_MAP, LEGACY_TRIP_STATUS_MAP
from app.services.notification_service import create_admin_alert
from app.services.ride_service import attempt_match_ride, fail_ride_request


logger = logging.getLogger(__name__)


def normalize_status_storage() -> None:
    """Normalize legacy status strings into the new lifecycle names."""
    inspector = inspect(engine)
    if not inspector.has_table("ride_requests") or not inspector.has_table("trips"):
        return

    if engine.dialect.name != "sqlite":
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            _ensure_postgres_enum_values(connection)

    with engine.begin() as connection:
        for legacy, normalized in LEGACY_RIDE_STATUS_MAP.items():
            connection.execute(
                text("UPDATE ride_requests SET status = :normalized WHERE status = :legacy"),
                {"normalized": normalized, "legacy": legacy},
            )

        for legacy, normalized in LEGACY_TRIP_STATUS_MAP.items():
            connection.execute(
                text("UPDATE trips SET status = :normalized WHERE status = :legacy"),
                {"normalized": normalized, "legacy": legacy},
            )


def _ensure_postgres_enum_values(connection) -> None:
    ride_status_values = [status.name for status in RideRequestStatus]
    trip_status_values = [status.name for status in TripStatus]

    for value in ride_status_values:
        connection.execute(
            text(f"ALTER TYPE ride_request_status ADD VALUE IF NOT EXISTS '{value}'")
        )
    for value in trip_status_values:
        connection.execute(
            text(f"ALTER TYPE trip_status ADD VALUE IF NOT EXISTS '{value}'")
        )


def run_startup_recovery() -> None:
    """Recover queued rides after startup and normalize legacy state."""
    normalize_status_storage()
    db = SessionLocal()
    try:
        _recover_dispatch_state(db)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Dispatch recovery failed during startup.")
        raise
    finally:
        db.close()


def _recover_dispatch_state(db) -> None:
    now = datetime.utcnow()
    recovery_cutoff = settings.MATCHING_AGGREGATION_WINDOW_SECONDS + settings.MATCHING_RECOVERY_GRACE_SECONDS

    immediate_rides = db.scalars(
        select(RideRequest).where(
            RideRequest.status.in_(
                [
                    RideRequestStatus.REQUESTED,
                    RideRequestStatus.MATCHING,
                ]
            )
        )
    ).all()

    for ride in immediate_rides:
        ride_age = (now - (ride.requested_at or now)).total_seconds()
        if ride_age <= recovery_cutoff:
            ride.status = RideRequestStatus.MATCHING
            attempt_match_ride(db, ride)
            continue
        fail_ride_request(
            db,
            ride,
            RideRequestStatus.FAILED_OPERATIONAL_ISSUE,
            "The dispatcher restarted before this ride could be recovered cleanly.",
        )

    scheduled_rides = db.scalars(
        select(RideRequest).where(
            RideRequest.status.in_(
                [
                    RideRequestStatus.SCHEDULED_REQUESTED,
                    RideRequestStatus.SCHEDULED_QUEUED,
                    RideRequestStatus.MATCHING_AT_DISPATCH_WINDOW,
                ]
            )
        )
    ).all()

    for ride in scheduled_rides:
        if ride.scheduled_time is None:
            fail_ride_request(
                db,
                ride,
                RideRequestStatus.FAILED_OPERATIONAL_ISSUE,
                "A scheduled ride was missing its pickup window after restart.",
            )
            continue

        dispatch_window_opens = ride.scheduled_time - timedelta(
            minutes=settings.SCHEDULED_RIDE_DISPATCH_LEAD_MINUTES
        )
        dispatch_window_expires = ride.scheduled_time + timedelta(
            seconds=settings.MATCHING_RECOVERY_GRACE_SECONDS
        )
        if now < dispatch_window_opens:
            ride.status = RideRequestStatus.SCHEDULED_QUEUED
            continue
        if now <= dispatch_window_expires:
            ride.status = RideRequestStatus.MATCHING_AT_DISPATCH_WINDOW
            attempt_match_ride(db, ride)
            continue

        fail_ride_request(
            db,
            ride,
            RideRequestStatus.FAILED_OPERATIONAL_ISSUE,
            "A scheduled ride expired during dispatcher recovery.",
        )


def process_dispatch_cycle() -> None:
    """Run one dispatcher pass for immediate and scheduled rides."""
    db = SessionLocal()
    try:
        _process_dispatch_cycle(db)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Dispatch worker cycle failed.")
    finally:
        db.close()


def _process_dispatch_cycle(db) -> None:
    now = datetime.utcnow()
    cutoff_seconds = settings.MATCHING_AGGREGATION_WINDOW_SECONDS + settings.MATCHING_RECOVERY_GRACE_SECONDS

    immediate_rides = db.scalars(
        select(RideRequest).where(
            RideRequest.status.in_(
                [
                    RideRequestStatus.REQUESTED,
                    RideRequestStatus.MATCHING,
                ]
            )
        )
    ).all()
    for ride in immediate_rides:
        ride_age = (now - (ride.requested_at or now)).total_seconds()
        if ride_age > cutoff_seconds:
            fail_ride_request(
                db,
                ride,
                RideRequestStatus.FAILED_NO_CAPACITY,
                "No eligible van became available within the dispatch window.",
            )
            continue

        if ride.status == RideRequestStatus.REQUESTED and ride_age < settings.MATCHING_AGGREGATION_WINDOW_SECONDS:
            continue

        attempt_match_ride(db, ride)

    scheduled_rides = db.scalars(
        select(RideRequest).where(
            RideRequest.status.in_(
                [
                    RideRequestStatus.SCHEDULED_REQUESTED,
                    RideRequestStatus.SCHEDULED_QUEUED,
                    RideRequestStatus.MATCHING_AT_DISPATCH_WINDOW,
                ]
            )
        )
    ).all()
    for ride in scheduled_rides:
        previous_status = ride.status
        if ride.scheduled_time is None:
            fail_ride_request(
                db,
                ride,
                RideRequestStatus.FAILED_OPERATIONAL_ISSUE,
                "A scheduled ride is missing its requested pickup time.",
            )
            continue

        dispatch_window_opens = ride.scheduled_time - timedelta(
            minutes=settings.SCHEDULED_RIDE_DISPATCH_LEAD_MINUTES
        )
        alert_threshold = ride.scheduled_time - timedelta(
            minutes=settings.SCHEDULED_RIDE_UNMATCHED_ALERT_MINUTES
        )
        expiry_threshold = ride.scheduled_time + timedelta(
            seconds=settings.MATCHING_RECOVERY_GRACE_SECONDS
        )

        if now < dispatch_window_opens:
            ride.status = RideRequestStatus.SCHEDULED_QUEUED
            continue

        if now > expiry_threshold:
            fail_ride_request(
                db,
                ride,
                RideRequestStatus.FAILED_OPERATIONAL_ISSUE,
                "The scheduled ride missed its dispatch window without a confirmed assignment.",
            )
            continue

        matched = attempt_match_ride(db, ride)
        if not matched and now >= alert_threshold and previous_status != RideRequestStatus.MATCHING_AT_DISPATCH_WINDOW:
            create_admin_alert(
                db,
                ride.company_id,
                title="Scheduled ride needs intervention",
                message="A scheduled ride is inside its dispatch window and still has no assigned van.",
                severity="high",
                metadata={"ride_id": str(ride.id), "scheduled_time": ride.scheduled_time.isoformat()},
            )


async def dispatch_worker_loop(stop_event: asyncio.Event) -> None:
    """Run the dispatcher until shutdown."""
    while not stop_event.is_set():
        process_dispatch_cycle()
        try:
            await asyncio.wait_for(
                stop_event.wait(),
                timeout=settings.DISPATCH_WORKER_INTERVAL_SECONDS,
            )
        except asyncio.TimeoutError:
            continue
