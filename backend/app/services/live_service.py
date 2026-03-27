"""Realtime snapshot and typed-event builders."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from app.models.user import User, UserRole
from app.services.admin_service import list_company_drivers
from app.services.ai_service import build_role_insights
from app.services.dashboard_service import (
    get_admin_dashboard,
    get_driver_dashboard,
    list_company_employees,
    list_company_trips,
    list_company_vans,
)
from app.services.notification_service import list_admin_alerts, list_notification_feed
from app.services.ride_service import (
    get_active_ride,
    list_company_pending_requests,
    list_user_rides,
)


def build_live_snapshot(db, current_user: User) -> dict[str, Any]:
    """Build a role-specific JSON snapshot for the live stream."""
    generated_at = datetime.utcnow().isoformat()
    include_alerts = current_user.role == UserRole.ADMIN
    notification_feed = list_notification_feed(
        db,
        current_user,
        include_alerts=include_alerts,
    )
    notifications = [_dump_model(item) for item in notification_feed.items]

    if current_user.role == UserRole.EMPLOYEE:
        return {
            "role": current_user.role.value,
            "generated_at": generated_at,
            "data": {
                "active_ride": _dump_model(get_active_ride(db, current_user)),
                "ride_history": [
                    _dump_model(item) for item in list_user_rides(db, current_user)
                ],
                "notifications": notifications,
                "notifications_unread_count": notification_feed.unread_count,
            },
            "insights": [
                _dump_model(item) for item in build_role_insights(db, current_user)
            ],
        }

    if current_user.role == UserRole.DRIVER:
        dashboard = get_driver_dashboard(db, current_user)
        return {
            "role": current_user.role.value,
            "generated_at": generated_at,
            "data": {
                "dashboard": _dump_model(dashboard),
                "active_trip": _dump_model(dashboard.active_trip),
                "notifications": notifications,
                "notifications_unread_count": notification_feed.unread_count,
            },
            "insights": [
                _dump_model(item) for item in build_role_insights(db, current_user)
            ],
        }

    return {
        "role": current_user.role.value,
        "generated_at": generated_at,
        "data": {
            "dashboard": _dump_model(
                get_admin_dashboard(db, current_user.company_id, current_user.id)
            ),
            "vans": [
                _dump_model(item) for item in list_company_vans(db, current_user.company_id)
            ],
            "employees": [
                _dump_model(item)
                for item in list_company_employees(db, current_user.company_id)
            ],
            "drivers": [
                _dump_model(item)
                for item in list_company_drivers(db, current_user.company_id)
            ],
            "trips": [
                _dump_model(item) for item in list_company_trips(db, current_user.company_id)
            ],
            "pending_requests": [
                _dump_model(item)
                for item in list_company_pending_requests(db, current_user.company_id)
            ],
            "alerts": [
                _dump_model(item) for item in list_admin_alerts(db, current_user)
            ],
            "notifications": notifications,
            "notifications_unread_count": notification_feed.unread_count,
        },
        "insights": [_dump_model(item) for item in build_role_insights(db, current_user)],
    }


def build_live_events(
    previous_snapshot: dict[str, Any] | None,
    current_snapshot: dict[str, Any],
) -> list[dict[str, Any]]:
    """Derive typed operational events from two live snapshots."""
    if not previous_snapshot or previous_snapshot.get("role") != current_snapshot.get("role"):
        return []

    role = str(current_snapshot.get("role") or "unknown")
    generated_at = str(current_snapshot.get("generated_at") or datetime.utcnow().isoformat())
    previous_data = previous_snapshot.get("data") or {}
    current_data = current_snapshot.get("data") or {}
    events: list[dict[str, Any]] = []

    if role == UserRole.EMPLOYEE.value:
        events.extend(
            _diff_list_entities(
                event_name="ride.updated",
                previous_items=_merge_active_ride_into_history(previous_data),
                current_items=_merge_active_ride_into_history(current_data),
                generated_at=generated_at,
                role=role,
                entity_type="ride",
            )
        )
    elif role == UserRole.DRIVER.value:
        events.extend(
            _diff_single_entity(
                event_name="driver.updated",
                previous_item=previous_data.get("dashboard"),
                current_item=current_data.get("dashboard"),
                generated_at=generated_at,
                role=role,
                entity_type="driver",
            )
        )
        events.extend(
            _diff_single_entity(
                event_name="van.updated",
                previous_item=((previous_data.get("dashboard") or {}).get("van")),
                current_item=((current_data.get("dashboard") or {}).get("van")),
                generated_at=generated_at,
                role=role,
                entity_type="van",
            )
        )
        events.extend(
            _diff_single_entity(
                event_name="trip.updated",
                previous_item=previous_data.get("active_trip"),
                current_item=current_data.get("active_trip"),
                generated_at=generated_at,
                role=role,
                entity_type="trip",
            )
        )
    else:
        events.extend(
            _diff_list_entities(
                event_name="van.updated",
                previous_items=previous_data.get("vans") or [],
                current_items=current_data.get("vans") or [],
                generated_at=generated_at,
                role=role,
                entity_type="van",
            )
        )
        events.extend(
            _diff_list_entities(
                event_name="trip.updated",
                previous_items=previous_data.get("trips") or [],
                current_items=current_data.get("trips") or [],
                generated_at=generated_at,
                role=role,
                entity_type="trip",
            )
        )
        events.extend(
            _diff_list_entities(
                event_name="ride.updated",
                previous_items=previous_data.get("pending_requests") or [],
                current_items=current_data.get("pending_requests") or [],
                generated_at=generated_at,
                role=role,
                entity_type="ride",
            )
        )
        events.extend(
            _diff_list_entities(
                event_name="driver.updated",
                previous_items=previous_data.get("drivers") or [],
                current_items=current_data.get("drivers") or [],
                generated_at=generated_at,
                role=role,
                entity_type="driver",
            )
        )
        events.extend(
            _diff_alerts(
                previous_items=previous_data.get("alerts") or [],
                current_items=current_data.get("alerts") or [],
                generated_at=generated_at,
                role=role,
            )
        )

    events.extend(
        _diff_notifications(
            previous_items=previous_data.get("notifications") or [],
            current_items=current_data.get("notifications") or [],
            generated_at=generated_at,
            role=role,
        )
    )
    return events


def _merge_active_ride_into_history(data: dict[str, Any]) -> list[dict[str, Any]]:
    history = [item for item in (data.get("ride_history") or []) if isinstance(item, dict)]
    active = data.get("active_ride")
    by_id = {str(item.get("id")): item for item in history if item.get("id") is not None}
    if isinstance(active, dict) and active.get("id") is not None:
        by_id[str(active["id"])] = active
    return list(by_id.values())


def _diff_notifications(
    previous_items: list[dict[str, Any]],
    current_items: list[dict[str, Any]],
    *,
    generated_at: str,
    role: str,
) -> list[dict[str, Any]]:
    previous_by_id = _index_by_id(previous_items)
    current_by_id = _index_by_id(current_items)
    events: list[dict[str, Any]] = []

    for entity_id, current_item in current_by_id.items():
        if entity_id not in previous_by_id:
            events.append(
                _build_event(
                    event_name="notification.created",
                    entity_type="notification",
                    entity_id=entity_id,
                    action="created",
                    before=None,
                    after=current_item,
                    generated_at=generated_at,
                    role=role,
                )
            )
            continue

        previous_item = previous_by_id[entity_id]
        changed_fields = _changed_fields(previous_item, current_item)
        if changed_fields:
            events.append(
                _build_event(
                    event_name="notification.updated",
                    entity_type="notification",
                    entity_id=entity_id,
                    action="updated",
                    before=previous_item,
                    after=current_item,
                    changed_fields=changed_fields,
                    generated_at=generated_at,
                    role=role,
                )
            )
    return events


def _diff_alerts(
    previous_items: list[dict[str, Any]],
    current_items: list[dict[str, Any]],
    *,
    generated_at: str,
    role: str,
) -> list[dict[str, Any]]:
    previous_by_id = _index_by_id(previous_items)
    current_by_id = _index_by_id(current_items)
    events: list[dict[str, Any]] = []

    for entity_id, current_item in current_by_id.items():
        if entity_id not in previous_by_id:
            events.append(
                _build_event(
                    event_name="alert.created",
                    entity_type="alert",
                    entity_id=entity_id,
                    action="created",
                    before=None,
                    after=current_item,
                    generated_at=generated_at,
                    role=role,
                )
            )
            continue

        previous_item = previous_by_id[entity_id]
        changed_fields = _changed_fields(previous_item, current_item)
        if changed_fields:
            events.append(
                _build_event(
                    event_name="alert.created",
                    entity_type="alert",
                    entity_id=entity_id,
                    action="updated",
                    before=previous_item,
                    after=current_item,
                    changed_fields=changed_fields,
                    generated_at=generated_at,
                    role=role,
                )
            )

    for entity_id, previous_item in previous_by_id.items():
        if entity_id in current_by_id:
            continue
        events.append(
            _build_event(
                event_name="alert.resolved",
                entity_type="alert",
                entity_id=entity_id,
                action="resolved",
                before=previous_item,
                after=None,
                generated_at=generated_at,
                role=role,
            )
        )
    return events


def _diff_single_entity(
    *,
    event_name: str,
    previous_item: dict[str, Any] | None,
    current_item: dict[str, Any] | None,
    generated_at: str,
    role: str,
    entity_type: str,
) -> list[dict[str, Any]]:
    previous_id = str(previous_item.get("id")) if previous_item and previous_item.get("id") else None
    current_id = str(current_item.get("id")) if current_item and current_item.get("id") else None

    if previous_item is None and current_item is None:
        return []
    if previous_item is None and current_item is not None:
        return [
            _build_event(
                event_name=event_name,
                entity_type=entity_type,
                entity_id=current_id,
                action="created",
                before=None,
                after=current_item,
                generated_at=generated_at,
                role=role,
            )
        ]
    if previous_item is not None and current_item is None:
        return [
            _build_event(
                event_name=event_name,
                entity_type=entity_type,
                entity_id=previous_id,
                action="removed",
                before=previous_item,
                after=None,
                generated_at=generated_at,
                role=role,
            )
        ]
    if previous_id != current_id:
        return [
            _build_event(
                event_name=event_name,
                entity_type=entity_type,
                entity_id=previous_id,
                action="removed",
                before=previous_item,
                after=None,
                generated_at=generated_at,
                role=role,
            ),
            _build_event(
                event_name=event_name,
                entity_type=entity_type,
                entity_id=current_id,
                action="created",
                before=None,
                after=current_item,
                generated_at=generated_at,
                role=role,
            ),
        ]

    changed_fields = _changed_fields(previous_item, current_item)
    if not changed_fields:
        return []
    return [
        _build_event(
            event_name=event_name,
            entity_type=entity_type,
            entity_id=current_id,
            action="updated",
            before=previous_item,
            after=current_item,
            changed_fields=changed_fields,
            generated_at=generated_at,
            role=role,
        )
    ]


def _diff_list_entities(
    *,
    event_name: str,
    previous_items: list[dict[str, Any]],
    current_items: list[dict[str, Any]],
    generated_at: str,
    role: str,
    entity_type: str,
) -> list[dict[str, Any]]:
    previous_by_id = _index_by_id(previous_items)
    current_by_id = _index_by_id(current_items)
    events: list[dict[str, Any]] = []

    for entity_id, current_item in current_by_id.items():
        if entity_id not in previous_by_id:
            events.append(
                _build_event(
                    event_name=event_name,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    action="created",
                    before=None,
                    after=current_item,
                    generated_at=generated_at,
                    role=role,
                )
            )
            continue

        previous_item = previous_by_id[entity_id]
        changed_fields = _changed_fields(previous_item, current_item)
        if not changed_fields:
            continue
        events.append(
            _build_event(
                event_name=event_name,
                entity_type=entity_type,
                entity_id=entity_id,
                action="updated",
                before=previous_item,
                after=current_item,
                changed_fields=changed_fields,
                generated_at=generated_at,
                role=role,
            )
        )

    for entity_id, previous_item in previous_by_id.items():
        if entity_id in current_by_id:
            continue
        events.append(
            _build_event(
                event_name=event_name,
                entity_type=entity_type,
                entity_id=entity_id,
                action="removed",
                before=previous_item,
                after=None,
                generated_at=generated_at,
                role=role,
            )
        )

    return events


def _index_by_id(items: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    results: dict[str, dict[str, Any]] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        entity_id = item.get("id")
        if entity_id is None:
            continue
        results[str(entity_id)] = item
    return results


def _changed_fields(previous_item: dict[str, Any], current_item: dict[str, Any]) -> list[str]:
    keys = sorted(set(previous_item.keys()) | set(current_item.keys()))
    return [key for key in keys if previous_item.get(key) != current_item.get(key)]


def _build_event(
    *,
    event_name: str,
    entity_type: str,
    entity_id: str | None,
    action: str,
    before: dict[str, Any] | None,
    after: dict[str, Any] | None,
    generated_at: str,
    role: str,
    changed_fields: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "event": event_name,
        "payload": {
            "entity_type": entity_type,
            "entity_id": entity_id,
            "action": action,
            "role": role,
            "generated_at": generated_at,
            "changed_fields": changed_fields or [],
            "before": before,
            "after": after,
        },
    }


def _dump_model(value):
    """Convert a Pydantic model to JSON-compatible data."""
    if value is None:
        return None
    return value.model_dump(mode="json")
