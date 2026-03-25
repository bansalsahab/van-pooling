"""Geospatial helpers that work in PostgreSQL and SQLite."""
from __future__ import annotations

import math
from typing import Any

from geoalchemy2.elements import WKTElement


def point_value(longitude: float, latitude: float, sqlite_mode: bool) -> Any:
    """Return a database-storable point value for the active backend."""
    point = f"POINT({longitude} {latitude})"
    if sqlite_mode:
        return point
    return WKTElement(point, srid=4326)


def parse_point(value: Any) -> tuple[float, float] | None:
    """Parse a WKT-like point value into latitude/longitude."""
    if value is None:
        return None

    text = getattr(value, "desc", None) or getattr(value, "data", None) or str(value)
    text = text.strip()
    if text.startswith("SRID="):
        _, _, text = text.partition(";")
    if not text.startswith("POINT(") or not text.endswith(")"):
        return None

    coordinates = text[6:-1].strip().split()
    if len(coordinates) != 2:
        return None

    longitude, latitude = map(float, coordinates)
    return latitude, longitude


def haversine_distance_meters(
    latitude_a: float,
    longitude_a: float,
    latitude_b: float,
    longitude_b: float,
) -> float:
    """Return the spherical distance between two points."""
    radius_meters = 6_371_000
    phi_1 = math.radians(latitude_a)
    phi_2 = math.radians(latitude_b)
    delta_phi = math.radians(latitude_b - latitude_a)
    delta_lambda = math.radians(longitude_b - longitude_a)

    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi_1) * math.cos(phi_2) * math.sin(delta_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius_meters * c
