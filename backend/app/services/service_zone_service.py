"""Service-zone polygon management and membership checks."""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.service_zone import ServiceZone, ServiceZoneType
from app.schemas.service_zone import (
    ServiceZoneCreate,
    ServiceZoneSummary,
    ServiceZoneUpdate,
)


def _parse_zone_type(value: str) -> ServiceZoneType:
    try:
        return ServiceZoneType(value.lower())
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="zone_type must be either pickup or destination.",
        ) from exc


def _extract_polygon_coordinates(geojson: dict[str, Any]) -> list[list[list[float]]]:
    if not isinstance(geojson, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="polygon_geojson must be a GeoJSON object.",
        )
    geometry_type = str(geojson.get("type", "")).strip().lower()
    coordinates = geojson.get("coordinates")
    if geometry_type != "polygon" or not isinstance(coordinates, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="polygon_geojson must be a GeoJSON Polygon.",
        )
    rings: list[list[list[float]]] = []
    for ring in coordinates:
        if not isinstance(ring, list) or len(ring) < 4:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Each polygon ring must contain at least 4 coordinate points.",
            )
        parsed_ring: list[list[float]] = []
        for point in ring:
            if (
                not isinstance(point, list)
                or len(point) < 2
                or not isinstance(point[0], (int, float))
                or not isinstance(point[1], (int, float))
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Polygon coordinates must be [longitude, latitude] numeric pairs.",
                )
            parsed_ring.append([float(point[0]), float(point[1])])
        rings.append(parsed_ring)
    return rings


def _point_in_ring(latitude: float, longitude: float, ring: list[list[float]]) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        lng_i, lat_i = ring[i][0], ring[i][1]
        lng_j, lat_j = ring[j][0], ring[j][1]
        intersects = ((lat_i > latitude) != (lat_j > latitude)) and (
            longitude
            < (lng_j - lng_i) * (latitude - lat_i) / max((lat_j - lat_i), 1e-12) + lng_i
        )
        if intersects:
            inside = not inside
        j = i
    return inside


def _point_in_polygon(latitude: float, longitude: float, polygon_geojson: dict[str, Any]) -> bool:
    rings = _extract_polygon_coordinates(polygon_geojson)
    outer = rings[0]
    if not _point_in_ring(latitude, longitude, outer):
        return False
    for hole in rings[1:]:
        if _point_in_ring(latitude, longitude, hole):
            return False
    return True


def serialize_service_zone(zone: ServiceZone) -> ServiceZoneSummary:
    """Serialize ORM model to API response."""
    return ServiceZoneSummary(
        id=zone.id,
        company_id=zone.company_id,
        name=zone.name,
        zone_type=zone.zone_type.value,
        polygon_geojson=zone.polygon_geojson or {},
        notes=zone.notes,
        is_active=bool(zone.is_active),
        created_at=zone.created_at,
        updated_at=zone.updated_at,
    )


def list_company_service_zones(db: Session, company_id) -> list[ServiceZoneSummary]:
    """Return service-zone polygons for one tenant."""
    zones = db.scalars(
        select(ServiceZone)
        .where(ServiceZone.company_id == company_id)
        .order_by(ServiceZone.zone_type, ServiceZone.name)
    ).all()
    return [serialize_service_zone(zone) for zone in zones]


def create_company_service_zone(
    db: Session,
    company_id,
    payload: ServiceZoneCreate,
) -> ServiceZoneSummary:
    """Create a tenant service-zone polygon."""
    zone_type = _parse_zone_type(payload.zone_type)
    _extract_polygon_coordinates(payload.polygon_geojson)
    zone = ServiceZone(
        company_id=company_id,
        name=payload.name.strip(),
        zone_type=zone_type,
        polygon_geojson=payload.polygon_geojson,
        notes=payload.notes.strip() if payload.notes else None,
        is_active=payload.is_active,
    )
    db.add(zone)
    db.commit()
    db.refresh(zone)
    return serialize_service_zone(zone)


def update_company_service_zone(
    db: Session,
    company_id,
    zone_id,
    payload: ServiceZoneUpdate,
) -> ServiceZoneSummary:
    """Update a tenant service-zone polygon."""
    zone = db.scalar(
        select(ServiceZone).where(
            ServiceZone.id == zone_id,
            ServiceZone.company_id == company_id,
        )
    )
    if zone is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service zone not found.",
        )

    fields = payload.model_fields_set
    if "name" in fields and payload.name is not None:
        zone.name = payload.name.strip()
    if "polygon_geojson" in fields and payload.polygon_geojson is not None:
        _extract_polygon_coordinates(payload.polygon_geojson)
        zone.polygon_geojson = payload.polygon_geojson
    if "notes" in fields:
        zone.notes = payload.notes.strip() if payload.notes else None
    if "is_active" in fields and payload.is_active is not None:
        zone.is_active = payload.is_active

    db.add(zone)
    db.commit()
    db.refresh(zone)
    return serialize_service_zone(zone)


def point_allowed_in_active_zones(
    db: Session,
    company_id,
    *,
    zone_type: str,
    latitude: float,
    longitude: float,
) -> bool | None:
    """
    Return coordinate membership for active polygons of one zone type.

    Returns None when no active polygons are configured, so callers can fall back
    to bounds-based policy checks.
    """
    parsed_type = _parse_zone_type(zone_type)
    zones = db.scalars(
        select(ServiceZone).where(
            ServiceZone.company_id == company_id,
            ServiceZone.zone_type == parsed_type,
            ServiceZone.is_active.is_(True),
        )
    ).all()
    if not zones:
        return None
    return any(
        _point_in_polygon(latitude, longitude, zone.polygon_geojson or {})
        for zone in zones
    )
