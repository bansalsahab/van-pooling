"""Background dispatch worker and startup recovery helpers."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy import inspect, select, text

from app.core.config import settings
from app.database import SessionLocal, engine
from app.models.notification import Notification, NotificationStatus, NotificationType
from app.models.ride_request import RideRequest, RideRequestStatus
from app.models.trip import TripStatus
from app.models.user import User, UserRole
from app.services.lifecycle_service import LEGACY_RIDE_STATUS_MAP, LEGACY_TRIP_STATUS_MAP
from app.services.notification_service import (
    create_admin_alert_once,
    queue_notification_once,
    resolve_stale_dispatch_alerts,
)
from app.services.policy_service import sort_rides_by_policy_priority
from app.services.recurring_schedule_service import materialize_due_recurring_rides
from app.services.ride_service import attempt_match_ride, fail_ride_request
from app.services.sla_service import (
    create_sla_alerts_for_company,
    list_sla_monitor_company_ids,
)


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
    immediate_rides = sort_rides_by_policy_priority(db, immediate_rides)

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
    scheduled_rides = sort_rides_by_policy_priority(db, scheduled_rides)

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
    touched_company_ids = set()
    created_from_recurring = materialize_due_recurring_rides(db, now=now)
    if created_from_recurring > 0:
        logger.info("Created %s recurring ride request(s) in this dispatch cycle.", created_from_recurring)

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
        touched_company_ids.add(ride.company_id)
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
        touched_company_ids.add(ride.company_id)
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

        entering_dispatch_window = previous_status in {
            RideRequestStatus.SCHEDULED_REQUESTED,
            RideRequestStatus.SCHEDULED_QUEUED,
        }
        if entering_dispatch_window and ride.user_id is not None:
            queue_notification_once(
                db,
                ride.user_id,
                title="Scheduled ride dispatch started",
                message=(
                    "Your scheduled ride is now inside its dispatch window and "
                    "the matcher is looking for an eligible van."
                ),
                metadata={"ride_id": str(ride.id), "scheduled_time": ride.scheduled_time.isoformat()},
                dedupe_key=f"scheduled-window-open:{ride.id}",
            )

        matched = attempt_match_ride(db, ride)
        if matched:
            continue

        if entering_dispatch_window:
            create_admin_alert_once(
                db,
                ride.company_id,
                title="Scheduled dispatch window opened",
                message="A scheduled ride just entered its dispatch window and is now matching.",
                severity="medium",
                metadata={
                    "ride_id": str(ride.id),
                    "scheduled_time": ride.scheduled_time.isoformat(),
                    "entity_type": "ride",
                    "entity_id": str(ride.id),
                },
                dedupe_key=f"scheduled-window-open:{ride.id}",
            )

        if now < alert_threshold:
            continue

        create_admin_alert_once(
            db,
            ride.company_id,
            title="Scheduled ride needs intervention",
            message="A scheduled ride is inside its dispatch window and still has no assigned van.",
            severity="high",
            metadata={
                "ride_id": str(ride.id),
                "scheduled_time": ride.scheduled_time.isoformat(),
                "entity_type": "ride",
                "entity_id": str(ride.id),
            },
            dedupe_key=f"scheduled-at-risk:{ride.id}",
        )
        if ride.user_id is not None:
            queue_notification_once(
                db,
                ride.user_id,
                title="Scheduled ride still matching",
                message=(
                    "Your pickup window is close and dispatch is still matching. "
                    "The operations team has been alerted."
                ),
                metadata={
                    "ride_id": str(ride.id),
                    "scheduled_time": ride.scheduled_time.isoformat(),
                },
                dedupe_key=f"scheduled-at-risk:{ride.id}",
            )

    alert_company_ids = db.scalars(
        select(User.company_id)
        .join(Notification, Notification.user_id == User.id)
        .where(
            User.role == UserRole.ADMIN,
            Notification.type == NotificationType.PUSH,
            Notification.status == NotificationStatus.PENDING,
        )
        .distinct()
    ).all()
    touched_company_ids.update(company_id for company_id in alert_company_ids if company_id is not None)
    touched_company_ids.update(list_sla_monitor_company_ids(db))

    for company_id in touched_company_ids:
        resolve_stale_dispatch_alerts(db, company_id)
        create_sla_alerts_for_company(db, company_id)


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
