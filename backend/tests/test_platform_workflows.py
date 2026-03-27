"""Backend workflow smoke coverage for item 6."""
from __future__ import annotations

from datetime import datetime, timedelta
from uuid import UUID

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models.ride_request import RideRequest, RideRequestStatus
from app.schemas.maps import GeocodeResponse, RoutePlan, RouteWaypoint
from app.services.ride_service import attempt_match_ride


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
