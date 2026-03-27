"""Smoke coverage for grounded copilot brief/reply fields."""
from __future__ import annotations

import pytest

from app.core.config import settings


@pytest.mark.parametrize(
    ("user_key", "role"),
    [
        ("employee_a", "employee"),
        ("driver_a1", "driver"),
        ("admin_a", "admin"),
    ],
)
def test_copilot_brief_includes_health_and_grounding(
    client,
    auth_headers,
    seeded_data,
    user_key: str,
    role: str,
):
    headers = auth_headers(seeded_data["users"][user_key], role)
    response = client.get(f"{settings.API_V1_STR}/ai/copilot/brief", headers=headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert isinstance(payload.get("health_score"), int)
    assert 0 <= payload["health_score"] <= 100
    assert payload.get("confidence") in {"low", "medium", "high"}
    assert isinstance(payload.get("source_signals"), list)
    assert len(payload["source_signals"]) > 0
    assert isinstance(payload.get("quick_prompts"), list)
    assert len(payload["quick_prompts"]) > 0


@pytest.mark.parametrize(
    ("user_key", "role"),
    [
        ("employee_a", "employee"),
        ("driver_a1", "driver"),
        ("admin_a", "admin"),
    ],
)
def test_copilot_ask_includes_grounding_signals(
    client,
    auth_headers,
    seeded_data,
    user_key: str,
    role: str,
):
    headers = auth_headers(seeded_data["users"][user_key], role)
    response = client.post(
        f"{settings.API_V1_STR}/ai/copilot/ask",
        headers=headers,
        json={"question": "What should I do next right now?"},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert isinstance(payload.get("source_signals"), list)
    assert len(payload["source_signals"]) > 0
