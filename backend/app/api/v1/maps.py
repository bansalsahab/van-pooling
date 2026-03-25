"""Maps and route preview routes."""
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user
from app.models.user import User
from app.schemas.maps import GeocodeRequest, GeocodeResponse, RoutePlan, RoutePreviewRequest
from app.services.maps_service import compute_route_plan, geocode_address

router = APIRouter(prefix="/maps", tags=["maps"])


@router.post("/geocode", response_model=GeocodeResponse)
def geocode(
    payload: GeocodeRequest,
    current_user: User = Depends(get_current_user),
) -> GeocodeResponse:
    """Resolve an address for the signed-in user."""
    del current_user
    result = geocode_address(payload.address)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Could not resolve that address with the configured maps provider.",
        )
    return result


@router.post("/route-preview", response_model=RoutePlan)
def route_preview(
    payload: RoutePreviewRequest,
    current_user: User = Depends(get_current_user),
) -> RoutePlan:
    """Return a route preview between selected points."""
    del current_user
    return compute_route_plan(
        origin=payload.origin,
        destination=payload.destination,
        intermediates=payload.intermediates,
        travel_mode=payload.travel_mode,
    )
