"""Driver shift and vehicle-check service helpers."""
from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.driver_shift import DriverShift, DriverShiftStatus
from app.models.user import User
from app.models.van import Van
from app.models.vehicle_check import VehicleCheck, VehicleCheckStatus
from app.schemas.driver_ops import (
    DriverShiftStartInput,
    DriverShiftSummary,
    DriverVehicleCheckCreate,
    DriverVehicleCheckSummary,
)
from app.services.notification_service import create_admin_alert, queue_notification_once


def _utc_now() -> datetime:
    return datetime.utcnow()


def _parse_vehicle_check_status(value: str | None, *, failed_items: list[str]) -> VehicleCheckStatus:
    if value is None:
        return VehicleCheckStatus.FAILED if failed_items else VehicleCheckStatus.PASSED
    parsed = value.strip().lower()
    if parsed == VehicleCheckStatus.PASSED.value:
        if failed_items:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot submit passed status while checklist contains failed items.",
            )
        return VehicleCheckStatus.PASSED
    if parsed == VehicleCheckStatus.FAILED.value:
        return VehicleCheckStatus.FAILED
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="status must be either passed or failed.",
    )


def _serialize_shift(shift: DriverShift) -> DriverShiftSummary:
    duration_minutes: int | None = None
    if shift.clocked_in_at is not None:
        effective_end = shift.clocked_out_at or _utc_now()
        duration_minutes = max(0, int((effective_end - shift.clocked_in_at).total_seconds() // 60))
    return DriverShiftSummary(
        id=shift.id,
        company_id=shift.company_id,
        driver_id=shift.driver_id,
        status=shift.status.value,
        scheduled_start_at=shift.scheduled_start_at,
        scheduled_end_at=shift.scheduled_end_at,
        clocked_in_at=shift.clocked_in_at,
        clocked_out_at=shift.clocked_out_at,
        duration_minutes=duration_minutes,
        notes=shift.notes,
        source=shift.source,
        created_at=shift.created_at,
        updated_at=shift.updated_at,
    )


def _serialize_vehicle_check(check: VehicleCheck) -> DriverVehicleCheckSummary:
    checklist = check.checklist if isinstance(check.checklist, dict) else {}
    failed_items = [
        key for key, value in checklist.items() if isinstance(key, str) and value is False
    ]
    return DriverVehicleCheckSummary(
        id=check.id,
        company_id=check.company_id,
        driver_id=check.driver_id,
        van_id=check.van_id,
        shift_id=check.shift_id,
        status=check.status.value,
        checklist=checklist,
        failed_items=failed_items,
        notes=check.notes,
        submitted_at=check.submitted_at,
        source=check.source,
        created_at=check.created_at,
        updated_at=check.updated_at,
    )


def _active_shift_for_driver(db: Session, current_user: User) -> DriverShift | None:
    return db.scalars(
        select(DriverShift)
        .where(
            DriverShift.company_id == current_user.company_id,
            DriverShift.driver_id == current_user.id,
            DriverShift.status == DriverShiftStatus.CLOCKED_IN,
            DriverShift.clocked_out_at.is_(None),
        )
        .order_by(desc(DriverShift.clocked_in_at), desc(DriverShift.created_at))
    ).first()


def list_driver_shifts(db: Session, current_user: User, *, limit: int = 30) -> list[DriverShiftSummary]:
    """List recent shifts for one driver."""
    if current_user.company_id is None:
        return []
    shifts = db.scalars(
        select(DriverShift)
        .where(
            DriverShift.company_id == current_user.company_id,
            DriverShift.driver_id == current_user.id,
        )
        .order_by(desc(DriverShift.created_at))
        .limit(max(1, min(limit, 120)))
    ).all()
    return [_serialize_shift(shift) for shift in shifts]


def start_driver_shift(
    db: Session,
    current_user: User,
    payload: DriverShiftStartInput,
) -> DriverShiftSummary:
    """Start a new shift if the driver has no active shift."""
    if current_user.company_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Driver is not attached to a company.",
        )

    active_shift = _active_shift_for_driver(db, current_user)
    if active_shift is not None:
        return _serialize_shift(active_shift)

    now = _utc_now()
    shift = DriverShift(
        company_id=current_user.company_id,
        driver_id=current_user.id,
        status=DriverShiftStatus.CLOCKED_IN,
        scheduled_start_at=now,
        scheduled_end_at=payload.planned_end_at
        or (now + timedelta(hours=settings.DRIVER_SHIFT_DEFAULT_HOURS)),
        clocked_in_at=now,
        notes=payload.notes.strip() if payload.notes else None,
        source="driver",
    )
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return _serialize_shift(shift)


def clock_out_driver_shift(
    db: Session,
    current_user: User,
    shift_id,
) -> DriverShiftSummary:
    """Clock out one active driver shift."""
    shift = db.scalar(
        select(DriverShift).where(
            DriverShift.id == shift_id,
            DriverShift.company_id == current_user.company_id,
            DriverShift.driver_id == current_user.id,
        )
    )
    if shift is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shift not found.",
        )
    if shift.status != DriverShiftStatus.CLOCKED_IN or shift.clocked_out_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only active shifts can be clocked out.",
        )

    now = _utc_now()
    shift.status = DriverShiftStatus.CLOCKED_OUT
    shift.clocked_out_at = now
    if shift.scheduled_end_at is None:
        shift.scheduled_end_at = now
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return _serialize_shift(shift)


def list_driver_vehicle_checks(
    db: Session,
    current_user: User,
    *,
    limit: int = 25,
) -> list[DriverVehicleCheckSummary]:
    """List recent vehicle checks for one driver."""
    if current_user.company_id is None:
        return []
    checks = db.scalars(
        select(VehicleCheck)
        .where(
            VehicleCheck.company_id == current_user.company_id,
            VehicleCheck.driver_id == current_user.id,
        )
        .order_by(desc(VehicleCheck.submitted_at), desc(VehicleCheck.created_at))
        .limit(max(1, min(limit, 120)))
    ).all()
    return [_serialize_vehicle_check(check) for check in checks]


def submit_driver_vehicle_check(
    db: Session,
    current_user: User,
    payload: DriverVehicleCheckCreate,
) -> DriverVehicleCheckSummary:
    """Submit a vehicle inspection entry for the current shift."""
    if current_user.company_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Driver is not attached to a company.",
        )

    normalized_checklist = {
        str(key).strip(): bool(value)
        for key, value in payload.checklist.items()
        if str(key).strip()
    }
    if not normalized_checklist:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one checklist item must be submitted.",
        )

    failed_items = [key for key, value in normalized_checklist.items() if value is False]
    resolved_status = _parse_vehicle_check_status(payload.status, failed_items=failed_items)
    active_shift = _active_shift_for_driver(db, current_user)
    van = db.scalar(
        select(Van).where(
            Van.company_id == current_user.company_id,
            Van.driver_id == current_user.id,
        )
    )
    submitted_at = _utc_now()
    check = VehicleCheck(
        company_id=current_user.company_id,
        driver_id=current_user.id,
        van_id=van.id if van else None,
        shift_id=active_shift.id if active_shift else None,
        status=resolved_status,
        checklist=normalized_checklist,
        notes=payload.notes.strip() if payload.notes else None,
        submitted_at=submitted_at,
        source="driver",
    )
    db.add(check)
    db.flush()

    if resolved_status == VehicleCheckStatus.FAILED:
        create_admin_alert(
            db,
            current_user.company_id,
            title="Driver vehicle check failed",
            message=(
                f"Driver {current_user.name} submitted a failed vehicle check."
            ),
            severity="high",
            metadata={
                "entity_type": "vehicle_check",
                "entity_id": str(check.id),
                "driver_id": str(current_user.id),
                "shift_id": str(active_shift.id) if active_shift else None,
                "failed_items": failed_items,
                "van_id": str(van.id) if van else None,
            },
        )
        queue_notification_once(
            db,
            current_user.id,
            title="Vehicle check flagged",
            message=(
                "Your vehicle check has failed items. Dispatch has been alerted for follow-up."
            ),
            metadata={"vehicle_check_id": str(check.id), "failed_items": failed_items},
            dedupe_key=f"vehicle-check-failed:{check.id}",
        )

    db.commit()
    db.refresh(check)
    return _serialize_vehicle_check(check)
