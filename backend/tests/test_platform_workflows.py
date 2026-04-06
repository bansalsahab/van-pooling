"""Backend workflow smoke coverage for item 6."""
from __future__ import annotations

from datetime import datetime, timedelta
from uuid import UUID

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models.user import User, UserStatus
from app.models.notification import Notification, NotificationStatus, NotificationType
from app.models.ride_request import RideRequest, RideRequestStatus
from app.models.van import Van, VanStatus
from app.schemas.maps import GeocodeResponse, RoutePlan, RouteWaypoint
from app.services.ride_service import attempt_match_ride
from app.services.sla_service import create_sla_alerts_for_company


def _ride_payload(*, scheduled_time: str | None = None) -> dict:
    return {
        "pickup": {
            "address": "Koramangala Bangalore",
            "latitude": 12.9716,
            "longitude": 77.5946,
        },
        "destination": {
            "address": "TechCorp Office Whitefield Bangalore",
            "latitude": 12.9800,
            "longitude": 77.6000,
        },
        "scheduled_time": scheduled_time,
    }


def _recurring_schedule_payload(*, timezone: str = "Asia/Kolkata") -> dict:
    return {
        "name": "Weekday commute",
        "weekdays": [0, 1, 2, 3, 4],
        "pickup_time_local": "08:30",
        "timezone": timezone,
        "pickup": {
            "address": "Koramangala Bangalore",
            "latitude": 12.9716,
            "longitude": 77.5946,
        },
        "destination": {
            "address": "TechCorp Office Whitefield Bangalore",
            "latitude": 12.9800,
            "longitude": 77.6000,
        },
    }


def test_auth_login_and_role_gate(client, seeded_data):
    response = client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={
            "email": seeded_data["users"]["employee_a"],
            "password": seeded_data["password"],
            "requested_role": "employee",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["access_token"]
    assert body["user"]["role"] == "employee"

    mismatch = client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={
            "email": seeded_data["users"]["driver_a1"],
            "password": seeded_data["password"],
            "requested_role": "admin",
        },
    )
    assert mismatch.status_code == 403
    assert "registered as driver" in mismatch.json()["detail"]


def test_profile_update_and_password_change_flow(client, auth_headers, seeded_data):
    employee_headers = auth_headers(seeded_data["users"]["employee_a"], "employee")

    profile_update = client.put(
        f"{settings.API_V1_STR}/auth/me",
        headers=employee_headers,
        json={
            "name": "Employee Updated",
            "phone": "+1 222 333 4444",
            "notification_preferences": {"push": True, "sms": True, "email": False},
            "home_address": "Indiranagar, Bengaluru",
            "home_latitude": 12.9784,
            "home_longitude": 77.6408,
            "default_destination_address": "Whitefield, Bengaluru",
            "default_destination_latitude": 12.9698,
            "default_destination_longitude": 77.7500,
        },
    )
    assert profile_update.status_code == 200, profile_update.text
    updated = profile_update.json()
    assert updated["name"] == "Employee Updated"
    assert updated["phone"] == "+1 222 333 4444"
    assert updated["notification_preferences"]["sms"] is True
    assert updated["notification_preferences"]["email"] is False
    assert updated["home_address"] == "Indiranagar, Bengaluru"
    assert updated["default_destination_address"] == "Whitefield, Bengaluru"

    password_change = client.post(
        f"{settings.API_V1_STR}/auth/me/password",
        headers=employee_headers,
        json={
            "current_password": seeded_data["password"],
            "new_password": "password123NEW",
        },
    )
    assert password_change.status_code == 200, password_change.text

    old_login = client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={
            "email": seeded_data["users"]["employee_a"],
            "password": seeded_data["password"],
            "requested_role": "employee",
        },
    )
    assert old_login.status_code == 401

    new_login = client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={
            "email": seeded_data["users"]["employee_a"],
            "password": "password123NEW",
            "requested_role": "employee",
        },
    )
    assert new_login.status_code == 200, new_login.text


def test_admin_user_directory_update_and_temp_password_reset(
    client,
    auth_headers,
    seeded_data,
):
    admin_headers = auth_headers(seeded_data["users"]["admin_a"], "admin")

    users_response = client.get(
        f"{settings.API_V1_STR}/admin/users",
        headers=admin_headers,
    )
    assert users_response.status_code == 200, users_response.text
    users = users_response.json()
    employee = next(
        item for item in users if item["email"] == seeded_data["users"]["employee_a"]
    )

    update_response = client.put(
        f"{settings.API_V1_STR}/admin/users/{employee['id']}",
        headers=admin_headers,
        json={
            "status": "active",
            "role": "employee",
        },
    )
    assert update_response.status_code == 200, update_response.text
    assert update_response.json()["status"] == "active"

    reset_response = client.post(
        f"{settings.API_V1_STR}/admin/users/{employee['id']}/reset-password",
        headers=admin_headers,
    )
    assert reset_response.status_code == 200, reset_response.text
    reset_payload = reset_response.json()
    assert reset_payload["must_reset_password"] is True
    assert reset_payload["temporary_password"]

    login_with_temp = client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={
            "email": seeded_data["users"]["employee_a"],
            "password": reset_payload["temporary_password"],
            "requested_role": "employee",
        },
    )
    assert login_with_temp.status_code == 200, login_with_temp.text
    assert login_with_temp.json()["user"]["must_reset_password"] is True


def test_immediate_ride_lifecycle_end_to_end(client, auth_headers, seeded_data):
    employee_headers = auth_headers(seeded_data["users"]["employee_a"], "employee")
    driver_headers = auth_headers(seeded_data["users"]["driver_a1"], "driver")

    request_response = client.post(
        f"{settings.API_V1_STR}/rides/request",
        headers=employee_headers,
        json=_ride_payload(),
    )
    assert request_response.status_code == 200, request_response.text
    ride = request_response.json()
    assert ride["status"] == "matched"
    assert ride["trip_id"]
    assert ride["boarding_otp_code"]

    active_trip_response = client.get(
        f"{settings.API_V1_STR}/driver/trips/active",
        headers=driver_headers,
    )
    assert active_trip_response.status_code == 200, active_trip_response.text
    active_trip = active_trip_response.json()
    assert active_trip["id"] == ride["trip_id"]
    passenger_ride_id = active_trip["passengers"][0]["ride_request_id"]

    assert client.post(
        f"{settings.API_V1_STR}/driver/trips/{active_trip['id']}/accept",
        headers=driver_headers,
    ).status_code == 200
    assert client.post(
        f"{settings.API_V1_STR}/driver/trips/{active_trip['id']}/start",
        headers=driver_headers,
    ).status_code == 200
    assert client.post(
        f"{settings.API_V1_STR}/driver/trips/{active_trip['id']}/pickup/{passenger_ride_id}",
        headers=driver_headers,
        json={"otp_code": ride["boarding_otp_code"]},
    ).status_code == 200
    assert client.post(
        f"{settings.API_V1_STR}/driver/trips/{active_trip['id']}/dropoff/{passenger_ride_id}",
        headers=driver_headers,
    ).status_code == 200
    assert client.post(
        f"{settings.API_V1_STR}/driver/trips/{active_trip['id']}/complete",
        headers=driver_headers,
    ).status_code == 200

    history_response = client.get(
        f"{settings.API_V1_STR}/rides/history",
        headers=employee_headers,
    )
    assert history_response.status_code == 200, history_response.text
    history = history_response.json()
    completed = next(item for item in history if item["id"] == ride["id"])
    assert completed["status"] == "completed"


def test_employee_cannot_create_second_ride_until_first_completes(
    client,
    auth_headers,
    seeded_data,
):
    employee_headers = auth_headers(seeded_data["users"]["employee_a"], "employee")
    first_request = client.post(
        f"{settings.API_V1_STR}/rides/request",
        headers=employee_headers,
        json=_ride_payload(),
    )
    assert first_request.status_code == 200, first_request.text
    first_ride = first_request.json()
    assert first_ride["status"] in {"matched", "matching", "requested"}

    second_request = client.post(
        f"{settings.API_V1_STR}/rides/request",
        headers=employee_headers,
        json=_ride_payload(),
    )
    assert second_request.status_code == 409, second_request.text
    assert "already have an active ride" in second_request.json()["detail"].lower()


def test_driver_pickup_requires_valid_boarding_otp(client, auth_headers, seeded_data):
    employee_headers = auth_headers(seeded_data["users"]["employee_a"], "employee")
    driver_headers = auth_headers(seeded_data["users"]["driver_a1"], "driver")

    request_response = client.post(
        f"{settings.API_V1_STR}/rides/request",
        headers=employee_headers,
        json=_ride_payload(),
    )
    assert request_response.status_code == 200, request_response.text
    ride = request_response.json()
    assert ride["trip_id"]
    assert ride["boarding_otp_code"]

    active_trip_response = client.get(
        f"{settings.API_V1_STR}/driver/trips/active",
        headers=driver_headers,
    )
    assert active_trip_response.status_code == 200, active_trip_response.text
    active_trip = active_trip_response.json()
    passenger_ride_id = active_trip["passengers"][0]["ride_request_id"]

    assert client.post(
        f"{settings.API_V1_STR}/driver/trips/{active_trip['id']}/accept",
        headers=driver_headers,
    ).status_code == 200
    assert client.post(
        f"{settings.API_V1_STR}/driver/trips/{active_trip['id']}/start",
        headers=driver_headers,
    ).status_code == 200

    invalid_pickup = client.post(
        f"{settings.API_V1_STR}/driver/trips/{active_trip['id']}/pickup/{passenger_ride_id}",
        headers=driver_headers,
        json={"otp_code": "0000"},
    )
    assert invalid_pickup.status_code == 400, invalid_pickup.text
    assert "invalid otp" in invalid_pickup.json()["detail"].lower()

    valid_pickup = client.post(
        f"{settings.API_V1_STR}/driver/trips/{active_trip['id']}/pickup/{passenger_ride_id}",
        headers=driver_headers,
        json={"otp_code": ride["boarding_otp_code"]},
    )
    assert valid_pickup.status_code == 200, valid_pickup.text

    active_ride_response = client.get(
        f"{settings.API_V1_STR}/rides/active",
        headers=employee_headers,
    )
    assert active_ride_response.status_code == 200, active_ride_response.text
    active_ride = active_ride_response.json()
    assert active_ride is not None
    assert active_ride["status"] in {"picked_up", "in_transit"}
    assert active_ride["boarding_otp_code"] is None


def test_scheduled_ride_dispatch_window_activation(
    client,
    auth_headers,
    seeded_data,
    db_session_factory,
):
    employee_headers = auth_headers(seeded_data["users"]["employee_a"], "employee")
    scheduled_for = (datetime.utcnow() + timedelta(minutes=30)).isoformat()
    response = client.post(
        f"{settings.API_V1_STR}/rides/request",
        headers=employee_headers,
        json=_ride_payload(scheduled_time=scheduled_for),
    )
    assert response.status_code == 200, response.text
    ride_summary = response.json()
    assert ride_summary["status"] == "scheduled_queued"

    db = db_session_factory()
    try:
        ride = db.scalar(
            select(RideRequest).where(RideRequest.id == UUID(ride_summary["id"]))
        )
        assert ride is not None
        ride.scheduled_time = datetime.utcnow() + timedelta(minutes=5)
        ride.status = RideRequestStatus.SCHEDULED_QUEUED
        matched = attempt_match_ride(db, ride)
        db.commit()
        assert matched is True
        assert ride.status == RideRequestStatus.MATCHED
    finally:
        db.close()


def test_recurring_schedule_timezone_validation(client, auth_headers, seeded_data):
    employee_headers = auth_headers(seeded_data["users"]["employee_a"], "employee")

    invalid_timezone = client.post(
        f"{settings.API_V1_STR}/rides/schedules",
        headers=employee_headers,
        json=_recurring_schedule_payload(timezone="Asia"),
    )
    assert invalid_timezone.status_code == 400, invalid_timezone.text
    assert "asia/kolkata" in invalid_timezone.json()["detail"].lower()

    normalized_timezone = client.post(
        f"{settings.API_V1_STR}/rides/schedules",
        headers=employee_headers,
        json=_recurring_schedule_payload(timezone=" Asia/Kolkata "),
    )
    assert normalized_timezone.status_code == 200, normalized_timezone.text
    assert normalized_timezone.json()["timezone"] == "Asia/Kolkata"


def test_admin_trip_reassignment_flow(client, auth_headers, seeded_data):
    employee_headers = auth_headers(seeded_data["users"]["employee_a"], "employee")
    admin_headers = auth_headers(seeded_data["users"]["admin_a"], "admin")
    driver2_headers = auth_headers(seeded_data["users"]["driver_a2"], "driver")

    ride_response = client.post(
        f"{settings.API_V1_STR}/rides/request",
        headers=employee_headers,
        json=_ride_payload(),
    )
    assert ride_response.status_code == 200, ride_response.text
    ride = ride_response.json()
    trip_id = ride["trip_id"]
    assert trip_id is not None

    reassign_response = client.post(
        f"{settings.API_V1_STR}/admin/trips/{trip_id}/reassign",
        headers=admin_headers,
        json={
            "van_id": seeded_data["vans"]["van_a2"],
            "reason": "Load balancing",
        },
    )
    assert reassign_response.status_code == 200, reassign_response.text
    reassigned_trip = reassign_response.json()
    assert reassigned_trip["van_id"] == seeded_data["vans"]["van_a2"]

    driver2_trip_response = client.get(
        f"{settings.API_V1_STR}/driver/trips/active",
        headers=driver2_headers,
    )
    assert driver2_trip_response.status_code == 200
    assert driver2_trip_response.json()["id"] == trip_id


def test_admin_kpis_snapshot_endpoint(client, auth_headers, seeded_data):
    employee_headers = auth_headers(seeded_data["users"]["employee_a"], "employee")
    driver_headers = auth_headers(seeded_data["users"]["driver_a1"], "driver")
    admin_headers = auth_headers(seeded_data["users"]["admin_a"], "admin")

    first_ride_response = client.post(
        f"{settings.API_V1_STR}/rides/request",
        headers=employee_headers,
        json=_ride_payload(),
    )
    assert first_ride_response.status_code == 200, first_ride_response.text
    first_ride = first_ride_response.json()
    assert first_ride["boarding_otp_code"]

    first_trip_response = client.get(
        f"{settings.API_V1_STR}/driver/trips/active",
        headers=driver_headers,
    )
    assert first_trip_response.status_code == 200, first_trip_response.text
    first_trip = first_trip_response.json()
    passenger_ride_id = first_trip["passengers"][0]["ride_request_id"]

    assert client.post(
        f"{settings.API_V1_STR}/driver/trips/{first_trip['id']}/accept",
        headers=driver_headers,
    ).status_code == 200
    assert client.post(
        f"{settings.API_V1_STR}/driver/trips/{first_trip['id']}/start",
        headers=driver_headers,
    ).status_code == 200
    assert client.post(
        f"{settings.API_V1_STR}/driver/trips/{first_trip['id']}/pickup/{passenger_ride_id}",
        headers=driver_headers,
        json={"otp_code": first_ride["boarding_otp_code"]},
    ).status_code == 200
    assert client.post(
        f"{settings.API_V1_STR}/driver/trips/{first_trip['id']}/dropoff/{passenger_ride_id}",
        headers=driver_headers,
    ).status_code == 200
    assert client.post(
        f"{settings.API_V1_STR}/driver/trips/{first_trip['id']}/complete",
        headers=driver_headers,
    ).status_code == 200

    second_ride_response = client.post(
        f"{settings.API_V1_STR}/rides/request",
        headers=employee_headers,
        json=_ride_payload(),
    )
    assert second_ride_response.status_code == 200, second_ride_response.text
    second_ride = second_ride_response.json()
    assert second_ride["status"] == "matched"

    kpi_response = client.get(
        f"{settings.API_V1_STR}/admin/kpis?window=7d",
        headers=admin_headers,
    )
    assert kpi_response.status_code == 200, kpi_response.text
    kpis = kpi_response.json()
    assert kpis["window"] == "7d"
    assert kpis["counters"]["rides_considered"] >= 2
    assert kpis["counters"]["dispatch_decisions_considered"] >= 2
    assert kpis["metrics"]["p95_wait_time_minutes"] is not None
    assert kpis["metrics"]["dispatch_success_percent"] is not None
    assert kpis["metrics"]["seat_utilization_percent"] is not None
    assert kpis["metrics"]["deadhead_km_per_trip"] is not None
    assert kpis["metrics"]["dispatch_success_percent"] >= 50
    assert first_ride["id"] != second_ride["id"]


def test_admin_domain_profiling_snapshot(client, auth_headers, seeded_data):
    employee_headers = auth_headers(seeded_data["users"]["employee_a"], "employee")
    driver_headers = auth_headers(seeded_data["users"]["driver_a1"], "driver")
    admin_headers = auth_headers(seeded_data["users"]["admin_a"], "admin")

    employee_response = client.get(
        f"{settings.API_V1_STR}/rides/history",
        headers=employee_headers,
    )
    assert employee_response.status_code == 200, employee_response.text

    driver_response = client.get(
        f"{settings.API_V1_STR}/driver/dashboard",
        headers=driver_headers,
    )
    assert driver_response.status_code == 200, driver_response.text

    admin_dashboard_response = client.get(
        f"{settings.API_V1_STR}/admin/dashboard",
        headers=admin_headers,
    )
    assert admin_dashboard_response.status_code == 200, admin_dashboard_response.text

    profiling_response = client.get(
        f"{settings.API_V1_STR}/admin/profiling",
        headers=admin_headers,
    )
    assert profiling_response.status_code == 200, profiling_response.text
    profiling = profiling_response.json()
    assert profiling["profiles"]

    domain_map = {item["domain"]: item for item in profiling["profiles"]}
    assert {"employee", "driver", "admin"}.issubset(domain_map.keys())
    assert domain_map["employee"]["request_count"] >= 1
    assert domain_map["driver"]["request_count"] >= 1
    assert domain_map["admin"]["request_count"] >= 1
    assert domain_map["employee"]["p95_latency_ms"] is not None
    assert domain_map["driver"]["p95_latency_ms"] is not None


def test_admin_sla_snapshot_and_incidents(
    client,
    auth_headers,
    seeded_data,
    db_session_factory,
):
    employee_headers = auth_headers(seeded_data["users"]["employee_a"], "employee")
    admin_headers = auth_headers(seeded_data["users"]["admin_a"], "admin")

    ride_response = client.post(
        f"{settings.API_V1_STR}/rides/request",
        headers=employee_headers,
        json=_ride_payload(),
    )
    assert ride_response.status_code == 200, ride_response.text
    ride = ride_response.json()

    db = db_session_factory()
    try:
        ride_row = db.scalar(select(RideRequest).where(RideRequest.id == UUID(ride["id"])))
        assert ride_row is not None
        ride_row.status = RideRequestStatus.REQUESTED
        ride_row.actual_pickup_time = None
        ride_row.requested_at = datetime.utcnow() - timedelta(minutes=20)

        stale_van = db.scalar(select(Van).where(Van.id == UUID(seeded_data["vans"]["van_a1"])))
        assert stale_van is not None
        stale_van.status = VanStatus.AVAILABLE
        stale_van.last_location_update = datetime.utcnow() - timedelta(
            seconds=settings.VAN_STALE_ALERT_SECONDS + 120
        )

        create_sla_alerts_for_company(db, ride_row.company_id)
        admin_user = db.scalar(
            select(User).where(User.email == seeded_data["users"]["admin_a"])
        )
        assert admin_user is not None
        db.add(
            Notification(
                user_id=admin_user.id,
                type=NotificationType.PUSH,
                title="SLA breach: Dispatch decision delay",
                message="1 item(s) breached (>100s from request).",
                status=NotificationStatus.PENDING,
                metadata_json={
                    "kind": "sla_breach",
                    "severity": "high",
                    "breach_type": "dispatch_delay",
                    "entity_type": "ride",
                    "entity_id": str(ride_row.id),
                },
            )
        )
        db.commit()
    finally:
        db.close()

    sla_response = client.get(
        f"{settings.API_V1_STR}/admin/sla",
        headers=admin_headers,
    )
    assert sla_response.status_code == 200, sla_response.text
    sla_snapshot = sla_response.json()
    assert sla_snapshot["open_breach_count"] >= 1
    breach_types = {item["breach_type"] for item in sla_snapshot["breaches"]}
    assert "dispatch_delay" in breach_types
    assert "location_freshness" in breach_types

    incidents_response = client.get(
        f"{settings.API_V1_STR}/admin/incidents?include_resolved=true&limit=20",
        headers=admin_headers,
    )
    assert incidents_response.status_code == 200, incidents_response.text
    incidents = incidents_response.json()
    assert incidents
    assert any(item.get("breach_type") for item in incidents)


def test_admin_notification_incident_resolution_flow(
    client,
    auth_headers,
    seeded_data,
    db_session_factory,
):
    admin_headers = auth_headers(seeded_data["users"]["admin_a"], "admin")

    db = db_session_factory()
    alert_id: UUID | None = None
    try:
        admin_user = db.scalar(
            select(User).where(User.email == seeded_data["users"]["admin_a"])
        )
        assert admin_user is not None
        notification = Notification(
            user_id=admin_user.id,
            type=NotificationType.PUSH,
            title="SLA breach: Dispatch decision delay",
            message="1 item(s) breached (>100s from request).",
            status=NotificationStatus.PENDING,
            metadata_json={
                "kind": "sla_breach",
                "severity": "high",
                "breach_type": "dispatch_delay",
                "entity_type": "ride",
                "entity_id": "ride-test-id",
            },
        )
        db.add(notification)
        db.commit()
        db.refresh(notification)
        alert_id = notification.id
    finally:
        db.close()

    notifications_response = client.get(
        f"{settings.API_V1_STR}/notifications?include_alerts=true&limit=20",
        headers=admin_headers,
    )
    assert notifications_response.status_code == 200, notifications_response.text
    notifications = notifications_response.json()["items"]
    incident_notification = next(
        item for item in notifications if item["id"] == str(alert_id)
    )
    assert incident_notification["kind"] == "sla_breach"
    assert incident_notification["breach_type"] == "dispatch_delay"

    resolve_response = client.post(
        f"{settings.API_V1_STR}/admin/alerts/{alert_id}/resolve",
        headers=admin_headers,
    )
    assert resolve_response.status_code == 200, resolve_response.text

    notifications_after = client.get(
        f"{settings.API_V1_STR}/notifications?include_alerts=true&limit=20",
        headers=admin_headers,
    )
    assert notifications_after.status_code == 200, notifications_after.text
    refreshed = notifications_after.json()["items"]
    resolved_item = next(item for item in refreshed if item["id"] == str(alert_id))
    assert resolved_item["status"] == "sent"
    assert resolved_item["read_at"] is not None


def test_admin_policy_update_and_simulation(client, auth_headers, seeded_data):
    admin_headers = auth_headers(seeded_data["users"]["admin_a"], "admin")

    update_response = client.put(
        f"{settings.API_V1_STR}/admin/policy",
        headers=admin_headers,
        json={
            "priority_by_user_role": {"admin": 1, "employee": 5, "driver": 10},
            "priority_by_team": {"ops": 2},
            "service_zone": {
                "enabled": True,
                "pickup_bounds": {
                    "min_latitude": 12.8,
                    "max_latitude": 13.2,
                    "min_longitude": 77.4,
                    "max_longitude": 77.8,
                },
                "destination_bounds": {
                    "min_latitude": 12.8,
                    "max_latitude": 13.2,
                    "min_longitude": 77.4,
                    "max_longitude": 77.8,
                },
            },
            "schedule": {
                "min_lead_minutes": 15,
                "max_days_ahead": 14,
                "dispatch_cutoff_minutes_before_pickup": 10,
            },
            "cancellation": {"employee_cutoff_minutes_before_pickup": 5},
            "women_safety_window": {
                "enabled": False,
                "start_local_time": "20:00",
                "end_local_time": "06:00",
                "timezone": "Asia/Kolkata",
                "requires_scheduled_rides": False,
                "apply_to_all_riders": False,
            },
        },
    )
    assert update_response.status_code == 200, update_response.text
    updated_policy = update_response.json()
    assert updated_policy["service_zone"]["enabled"] is True

    blocked_simulation = client.post(
        f"{settings.API_V1_STR}/admin/policy/simulate",
        headers=admin_headers,
        json={
            "pickup_latitude": 19.0760,
            "pickup_longitude": 72.8777,
            "destination_latitude": 19.0820,
            "destination_longitude": 72.8890,
            "role": "employee",
        },
    )
    assert blocked_simulation.status_code == 200, blocked_simulation.text
    blocked_result = blocked_simulation.json()
    assert blocked_result["allowed"] is False
    assert any(
        item["code"] == "pickup_outside_service_zone"
        for item in blocked_result["violations"]
    )

    allowed_simulation = client.post(
        f"{settings.API_V1_STR}/admin/policy/simulate",
        headers=admin_headers,
        json={
            "pickup_latitude": 12.9716,
            "pickup_longitude": 77.5946,
            "destination_latitude": 12.9800,
            "destination_longitude": 77.6000,
            "role": "employee",
            "team": "ops",
        },
    )
    assert allowed_simulation.status_code == 200, allowed_simulation.text
    allowed_result = allowed_simulation.json()
    assert allowed_result["allowed"] is True
    assert allowed_result["dispatch_priority"] == 2


def test_policy_service_zone_blocks_out_of_zone_ride_request(
    client,
    auth_headers,
    seeded_data,
):
    admin_headers = auth_headers(seeded_data["users"]["admin_a"], "admin")
    employee_headers = auth_headers(seeded_data["users"]["employee_a"], "employee")

    policy_response = client.put(
        f"{settings.API_V1_STR}/admin/policy",
        headers=admin_headers,
        json={
            "priority_by_user_role": {"admin": 1, "employee": 5, "driver": 10},
            "priority_by_team": {},
            "service_zone": {
                "enabled": True,
                "pickup_bounds": {
                    "min_latitude": 12.8,
                    "max_latitude": 13.2,
                    "min_longitude": 77.4,
                    "max_longitude": 77.8,
                },
                "destination_bounds": {
                    "min_latitude": 12.8,
                    "max_latitude": 13.2,
                    "min_longitude": 77.4,
                    "max_longitude": 77.8,
                },
            },
            "schedule": {
                "min_lead_minutes": 15,
                "max_days_ahead": 14,
                "dispatch_cutoff_minutes_before_pickup": 10,
            },
            "cancellation": {"employee_cutoff_minutes_before_pickup": 5},
            "women_safety_window": {
                "enabled": False,
                "start_local_time": "20:00",
                "end_local_time": "06:00",
                "timezone": "Asia/Kolkata",
                "requires_scheduled_rides": False,
                "apply_to_all_riders": False,
            },
        },
    )
    assert policy_response.status_code == 200, policy_response.text

    blocked_ride_response = client.post(
        f"{settings.API_V1_STR}/rides/request",
        headers=employee_headers,
        json={
            "pickup": {
                "address": "Mumbai pickup",
                "latitude": 19.0760,
                "longitude": 72.8777,
            },
            "destination": {
                "address": "Mumbai office",
                "latitude": 19.0820,
                "longitude": 72.8890,
            },
            "scheduled_time": None,
        },
    )
    assert blocked_ride_response.status_code == 400, blocked_ride_response.text
    assert "outside the configured company service zone" in blocked_ride_response.json()["detail"].lower()


def test_policy_cancellation_cutoff_blocks_late_cancel(client, auth_headers, seeded_data):
    admin_headers = auth_headers(seeded_data["users"]["admin_a"], "admin")
    employee_headers = auth_headers(seeded_data["users"]["employee_a"], "employee")

    policy_response = client.put(
        f"{settings.API_V1_STR}/admin/policy",
        headers=admin_headers,
        json={
            "priority_by_user_role": {"admin": 1, "employee": 5, "driver": 10},
            "priority_by_team": {},
            "service_zone": {"enabled": False},
            "schedule": {
                "min_lead_minutes": 5,
                "max_days_ahead": 14,
                "dispatch_cutoff_minutes_before_pickup": 10,
            },
            "cancellation": {"employee_cutoff_minutes_before_pickup": 20},
            "women_safety_window": {
                "enabled": False,
                "start_local_time": "20:00",
                "end_local_time": "06:00",
                "timezone": "Asia/Kolkata",
                "requires_scheduled_rides": False,
                "apply_to_all_riders": False,
            },
        },
    )
    assert policy_response.status_code == 200, policy_response.text

    scheduled_time = (datetime.utcnow() + timedelta(minutes=10)).isoformat()
    ride_response = client.post(
        f"{settings.API_V1_STR}/rides/request",
        headers=employee_headers,
        json=_ride_payload(scheduled_time=scheduled_time),
    )
    assert ride_response.status_code == 200, ride_response.text
    ride = ride_response.json()

    cancel_response = client.post(
        f"{settings.API_V1_STR}/rides/{ride['id']}/cancel",
        headers=employee_headers,
    )
    assert cancel_response.status_code == 400, cancel_response.text
    assert "cancellation window has closed" in cancel_response.json()["detail"].lower()


def test_admin_scope_viewer_blocks_dispatch_mutations(
    client,
    auth_headers,
    seeded_data,
    db_session_factory,
):
    db = db_session_factory()
    try:
        admin = db.scalar(select(User).where(User.email == seeded_data["users"]["admin_a"]))
        assert admin is not None
        admin.admin_scope = "viewer"
        db.add(admin)
        db.commit()
    finally:
        db.close()

    employee_headers = auth_headers(seeded_data["users"]["employee_a"], "employee")
    admin_headers = auth_headers(seeded_data["users"]["admin_a"], "admin")

    ride_response = client.post(
        f"{settings.API_V1_STR}/rides/request",
        headers=employee_headers,
        json=_ride_payload(),
    )
    assert ride_response.status_code == 200, ride_response.text
    trip_id = ride_response.json()["trip_id"]
    assert trip_id is not None

    read_response = client.get(
        f"{settings.API_V1_STR}/admin/trips",
        headers=admin_headers,
    )
    assert read_response.status_code == 200, read_response.text

    cancel_response = client.post(
        f"{settings.API_V1_STR}/admin/trips/{trip_id}/cancel",
        headers=admin_headers,
        json={"reason": "Viewer should not dispatch"},
    )
    assert cancel_response.status_code == 403
    assert "dispatch:write" in cancel_response.json()["detail"]


def test_admin_scope_dispatcher_cannot_create_users(
    client,
    auth_headers,
    seeded_data,
    db_session_factory,
):
    db = db_session_factory()
    try:
        admin = db.scalar(select(User).where(User.email == seeded_data["users"]["admin_a"]))
        assert admin is not None
        admin.admin_scope = "dispatcher"
        db.add(admin)
        db.commit()
    finally:
        db.close()

    admin_headers = auth_headers(seeded_data["users"]["admin_a"], "admin")
    dashboard_response = client.get(
        f"{settings.API_V1_STR}/admin/dashboard",
        headers=admin_headers,
    )
    assert dashboard_response.status_code == 200, dashboard_response.text

    create_user_response = client.post(
        f"{settings.API_V1_STR}/admin/users",
        headers=admin_headers,
        json={
            "name": "Scope Test",
            "email": "scope-test@techcorp.com",
            "password": seeded_data["password"],
            "role": "employee",
        },
    )
    assert create_user_response.status_code == 403
    assert "users:manage" in create_user_response.json()["detail"]


def test_admin_audit_export_json_and_csv(client, auth_headers, seeded_data):
    employee_headers = auth_headers(seeded_data["users"]["employee_a"], "employee")
    admin_headers = auth_headers(seeded_data["users"]["admin_a"], "admin")

    ride_response = client.post(
        f"{settings.API_V1_STR}/rides/request",
        headers=employee_headers,
        json=_ride_payload(),
    )
    assert ride_response.status_code == 200, ride_response.text

    json_export = client.get(
        f"{settings.API_V1_STR}/admin/audit/export?format=json&limit=30",
        headers=admin_headers,
    )
    assert json_export.status_code == 200, json_export.text
    payload = json_export.json()
    assert payload["record_count"] >= 1
    assert payload["signature"]
    assert len(payload["signature"]) == 64
    assert isinstance(payload["records"], list)

    csv_export = client.get(
        f"{settings.API_V1_STR}/admin/audit/export?format=csv&limit=30",
        headers=admin_headers,
    )
    assert csv_export.status_code == 200, csv_export.text
    assert csv_export.headers["content-type"].startswith("text/csv")
    assert csv_export.headers.get("x-audit-signature")
    assert "source,occurred_at,event_type" in csv_export.text


def test_enterprise_identity_config_sso_and_scim_sync(
    client,
    auth_headers,
    seeded_data,
    db_session_factory,
):
    admin_headers = auth_headers(seeded_data["users"]["admin_a"], "admin")
    scim_token = "token-stage4-sync-12345"

    update_config = client.put(
        f"{settings.API_V1_STR}/admin/identity/config",
        headers=admin_headers,
        json={
            "sso": {
                "enabled": True,
                "provider": "oidc",
                "issuer_url": "https://id.techcorp.com/oidc",
                "sso_login_url": "https://id.techcorp.com/authorize",
                "client_id": "techcorp-vanpool",
                "redirect_uri": "https://vanpool.techcorp.com/auth/callback",
            },
            "scim": {
                "enabled": True,
                "base_url": "https://vanpool.techcorp.com/api/v1/auth/enterprise/scim/sync",
                "provisioning_mode": "sync_hook",
            },
            "scim_bearer_token": scim_token,
        },
    )
    assert update_config.status_code == 200, update_config.text
    config_payload = update_config.json()
    assert config_payload["sso"]["enabled"] is True
    assert config_payload["scim"]["enabled"] is True
    assert config_payload["scim"]["bearer_token_hint"] is not None

    start_sso = client.post(
        f"{settings.API_V1_STR}/auth/enterprise/sso/start",
        json={
            "company_domain": "techcorp.com",
            "requested_role": "admin",
            "relay_state": "portal:admin",
        },
    )
    assert start_sso.status_code == 200, start_sso.text
    sso_payload = start_sso.json()
    assert sso_payload["configured"] is True
    assert "id.techcorp.com/authorize" in (sso_payload.get("redirect_url") or "")

    create_sync = client.post(
        f"{settings.API_V1_STR}/auth/enterprise/scim/sync",
        headers={"X-SCIM-Token": scim_token},
        json={
            "company_domain": "techcorp.com",
            "operation": "create",
            "external_user_id": "ext-1001",
            "email": "scim.user@techcorp.com",
            "name": "SCIM User",
            "role": "employee",
        },
    )
    assert create_sync.status_code == 200, create_sync.text
    assert create_sync.json()["accepted"] is True

    db = db_session_factory()
    try:
        synced_user = db.scalar(select(User).where(User.email == "scim.user@techcorp.com"))
        assert synced_user is not None
        assert synced_user.status == UserStatus.ACTIVE
    finally:
        db.close()

    deactivate_sync = client.post(
        f"{settings.API_V1_STR}/auth/enterprise/scim/sync",
        headers={"X-SCIM-Token": scim_token},
        json={
            "company_domain": "techcorp.com",
            "operation": "deactivate",
            "external_user_id": "ext-1001",
            "email": "scim.user@techcorp.com",
            "role": "employee",
        },
    )
    assert deactivate_sync.status_code == 200, deactivate_sync.text

    db = db_session_factory()
    try:
        synced_user = db.scalar(select(User).where(User.email == "scim.user@techcorp.com"))
        assert synced_user is not None
        assert synced_user.status == UserStatus.INACTIVE
    finally:
        db.close()


def test_driver_no_show_flow(client, auth_headers, seeded_data):
    employee_headers = auth_headers(seeded_data["users"]["employee_a"], "employee")
    driver_headers = auth_headers(seeded_data["users"]["driver_a1"], "driver")
    admin_headers = auth_headers(seeded_data["users"]["admin_a"], "admin")

    ride_response = client.post(
        f"{settings.API_V1_STR}/rides/request",
        headers=employee_headers,
        json=_ride_payload(),
    )
    ride = ride_response.json()
    trip_id = ride["trip_id"]

    active_trip = client.get(
        f"{settings.API_V1_STR}/driver/trips/active",
        headers=driver_headers,
    ).json()
    passenger_ride_id = active_trip["passengers"][0]["ride_request_id"]

    assert client.post(
        f"{settings.API_V1_STR}/driver/trips/{trip_id}/accept",
        headers=driver_headers,
    ).status_code == 200
    assert client.post(
        f"{settings.API_V1_STR}/driver/trips/{trip_id}/start",
        headers=driver_headers,
    ).status_code == 200
    no_show_response = client.post(
        f"{settings.API_V1_STR}/driver/trips/{trip_id}/no-show/{passenger_ride_id}",
        headers=driver_headers,
    )
    assert no_show_response.status_code == 200, no_show_response.text

    history = client.get(
        f"{settings.API_V1_STR}/rides/history",
        headers=employee_headers,
    ).json()
    ride_after = next(item for item in history if item["id"] == ride["id"])
    assert ride_after["status"] == "no_show"

    alerts = client.get(
        f"{settings.API_V1_STR}/admin/alerts",
        headers=admin_headers,
    ).json()
    assert any(
        item["title"] == "Rider no-show reported" and str(item.get("ride_id") or "") == ride["id"]
        for item in alerts
    )


def test_driver_shift_and_vehicle_check_flow(client, auth_headers, seeded_data):
    driver_headers = auth_headers(seeded_data["users"]["driver_a1"], "driver")
    admin_headers = auth_headers(seeded_data["users"]["admin_a"], "admin")

    initial_shifts = client.get(
        f"{settings.API_V1_STR}/driver/shifts?limit=10",
        headers=driver_headers,
    )
    assert initial_shifts.status_code == 200, initial_shifts.text

    start_shift = client.post(
        f"{settings.API_V1_STR}/driver/shifts/start",
        headers=driver_headers,
        json={"notes": "Starting morning duty"},
    )
    assert start_shift.status_code == 200, start_shift.text
    shift = start_shift.json()
    assert shift["status"] == "clocked_in"
    assert shift["clocked_in_at"] is not None

    failed_check = client.post(
        f"{settings.API_V1_STR}/driver/vehicle-checks",
        headers=driver_headers,
        json={
            "checklist": {
                "tires": True,
                "brakes": False,
                "lights": True,
            },
            "notes": "Brake response felt delayed.",
        },
    )
    assert failed_check.status_code == 200, failed_check.text
    check_payload = failed_check.json()
    assert check_payload["status"] == "failed"
    assert "brakes" in check_payload["failed_items"]

    check_history = client.get(
        f"{settings.API_V1_STR}/driver/vehicle-checks?limit=10",
        headers=driver_headers,
    )
    assert check_history.status_code == 200, check_history.text
    checks = check_history.json()
    assert any(item["id"] == check_payload["id"] for item in checks)

    alerts = client.get(
        f"{settings.API_V1_STR}/admin/alerts",
        headers=admin_headers,
    )
    assert alerts.status_code == 200, alerts.text
    assert any(item["title"] == "Driver vehicle check failed" for item in alerts.json())

    clock_out = client.post(
        f"{settings.API_V1_STR}/driver/shifts/{shift['id']}/clock-out",
        headers=driver_headers,
    )
    assert clock_out.status_code == 200, clock_out.text
    assert clock_out.json()["status"] == "clocked_out"


def test_tenant_isolation_for_admin_actions(client, auth_headers, seeded_data):
    employee_headers = auth_headers(seeded_data["users"]["employee_a"], "employee")
    admin_b_headers = auth_headers(seeded_data["users"]["admin_b"], "admin")

    ride_response = client.post(
        f"{settings.API_V1_STR}/rides/request",
        headers=employee_headers,
        json=_ride_payload(),
    )
    trip_id = ride_response.json()["trip_id"]

    company_b_trips = client.get(
        f"{settings.API_V1_STR}/admin/trips",
        headers=admin_b_headers,
    )
    assert company_b_trips.status_code == 200
    assert company_b_trips.json() == []

    forbidden_cancel = client.post(
        f"{settings.API_V1_STR}/admin/trips/{trip_id}/cancel",
        headers=admin_b_headers,
        json={"reason": "Cross-tenant attempt"},
    )
    assert forbidden_cancel.status_code == 404


def test_maps_endpoint_success_and_fallback(
    client,
    auth_headers,
    seeded_data,
    monkeypatch,
):
    employee_headers = auth_headers(seeded_data["users"]["employee_a"], "employee")

    monkeypatch.setattr(
        "app.api.v1.maps.geocode_address",
        lambda _address: GeocodeResponse(
            address="Koramangala, Bangalore",
            latitude=12.9716,
            longitude=77.5946,
            place_id="test-place-id",
            source="fallback",
        ),
    )
    geocode_response = client.post(
        f"{settings.API_V1_STR}/maps/geocode",
        headers=employee_headers,
        json={"address": "Koramangala Bangalore"},
    )
    assert geocode_response.status_code == 200
    assert geocode_response.json()["source"] == "fallback"

    monkeypatch.setattr(
        "app.api.v1.maps.compute_route_plan",
        lambda **_kwargs: RoutePlan(
            source="heuristic",
            travel_mode="DRIVE",
            traffic_aware=False,
            distance_meters=1200,
            duration_seconds=360,
            duration_minutes=6,
            origin=RouteWaypoint(
                latitude=12.9716,
                longitude=77.5946,
                address="Pickup",
                kind="origin",
            ),
            destination=RouteWaypoint(
                latitude=12.9800,
                longitude=77.6000,
                address="Destination",
                kind="destination",
            ),
            waypoints=[],
            steps=[],
            warnings=["Fallback route"],
        ),
    )
    route_response = client.post(
        f"{settings.API_V1_STR}/maps/route-preview",
        headers=employee_headers,
        json={
            "origin": {
                "latitude": 12.9716,
                "longitude": 77.5946,
                "address": "Pickup",
                "kind": "origin",
            },
            "destination": {
                "latitude": 12.9800,
                "longitude": 77.6000,
                "address": "Destination",
                "kind": "destination",
            },
        },
    )
    assert route_response.status_code == 200
    assert route_response.json()["source"] == "heuristic"

    monkeypatch.setattr("app.api.v1.maps.geocode_address", lambda _address: None)
    failed_geocode = client.post(
        f"{settings.API_V1_STR}/maps/geocode",
        headers=employee_headers,
        json={"address": "Unknown place"},
    )
    assert failed_geocode.status_code == 404


@pytest.mark.parametrize("endpoint", ["/admin/dashboard", "/driver/dashboard", "/rides/active"])
def test_authenticated_endpoints_require_token(client, endpoint):
    response = client.get(f"{settings.API_V1_STR}{endpoint}")
    assert response.status_code == 401
