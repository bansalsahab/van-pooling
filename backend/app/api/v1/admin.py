"""Admin routes."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.database import get_db
from app.models.user import User, UserRole
from app.schemas.dashboard import AdminDashboardSummary
from app.schemas.trip import TripSummary
from app.schemas.user import AdminUserCreate, UserSummary
from app.schemas.van import AdminVanCreate, VanSummary
from app.services.admin_service import (
    create_company_user,
    create_company_van,
    list_company_drivers,
)
from app.services.dashboard_service import (
    get_admin_dashboard,
    list_company_employees,
    list_company_trips,
    list_company_vans,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/dashboard", response_model=AdminDashboardSummary)
def dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> AdminDashboardSummary:
    """Return admin dashboard metrics."""
    return get_admin_dashboard(db, current_user.company_id)


@router.get("/vans", response_model=list[VanSummary])
def vans(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> list[VanSummary]:
    """Return fleet status for the admin's company."""
    return list_company_vans(db, current_user.company_id)


@router.get("/employees", response_model=list[UserSummary])
def employees(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> list[UserSummary]:
    """Return employees for the admin's company."""
    return list_company_employees(db, current_user.company_id)


@router.get("/drivers", response_model=list[UserSummary])
def drivers(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> list[UserSummary]:
    """Return drivers for the admin's company."""
    return list_company_drivers(db, current_user.company_id)


@router.get("/trips", response_model=list[TripSummary])
def trips(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> list[TripSummary]:
    """Return trips for the admin's company."""
    return list_company_trips(db, current_user.company_id)


@router.post("/users", response_model=UserSummary)
def create_user(
    payload: AdminUserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> UserSummary:
    """Create a user for the admin's company."""
    return create_company_user(db, current_user.company_id, payload)


@router.post("/vans", response_model=VanSummary)
def create_van(
    payload: AdminVanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> VanSummary:
    """Create a van for the admin's company."""
    return create_company_van(db, current_user.company_id, payload)
