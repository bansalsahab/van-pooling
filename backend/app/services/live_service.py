"""Realtime snapshot builders."""
from datetime import datetime

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
from app.services.ride_service import get_active_ride, list_user_rides


def build_live_snapshot(db, current_user: User) -> dict:
    """Build a role-specific JSON snapshot for the live stream."""
    generated_at = datetime.utcnow().isoformat()
    if current_user.role == UserRole.EMPLOYEE:
        return {
            "role": current_user.role.value,
            "generated_at": generated_at,
            "data": {
                "active_ride": _dump_model(get_active_ride(db, current_user)),
                "ride_history": [_dump_model(item) for item in list_user_rides(db, current_user)],
            },
            "insights": [_dump_model(item) for item in build_role_insights(db, current_user)],
        }

    if current_user.role == UserRole.DRIVER:
        dashboard = get_driver_dashboard(db, current_user)
        return {
            "role": current_user.role.value,
            "generated_at": generated_at,
            "data": {
                "dashboard": _dump_model(dashboard),
                "active_trip": _dump_model(dashboard.active_trip),
            },
            "insights": [_dump_model(item) for item in build_role_insights(db, current_user)],
        }

    return {
        "role": current_user.role.value,
        "generated_at": generated_at,
        "data": {
            "dashboard": _dump_model(get_admin_dashboard(db, current_user.company_id)),
            "vans": [_dump_model(item) for item in list_company_vans(db, current_user.company_id)],
            "employees": [
                _dump_model(item) for item in list_company_employees(db, current_user.company_id)
            ],
            "drivers": [
                _dump_model(item) for item in list_company_drivers(db, current_user.company_id)
            ],
            "trips": [_dump_model(item) for item in list_company_trips(db, current_user.company_id)],
        },
        "insights": [_dump_model(item) for item in build_role_insights(db, current_user)],
    }


def _dump_model(value):
    """Convert a Pydantic model to JSON-compatible data."""
    if value is None:
        return None
    return value.model_dump(mode="json")
