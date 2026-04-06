"""Common schema fragments."""
from typing import Annotated

from pydantic import BaseModel, Field


class MessageResponse(BaseModel):
    """Simple response envelope for mutation endpoints."""

    message: str


# Validated coordinate types for geospatial inputs
Latitude = Annotated[
    float,
    Field(ge=-90.0, le=90.0, description="Latitude in degrees (-90 to 90)"),
]

Longitude = Annotated[
    float,
    Field(ge=-180.0, le=180.0, description="Longitude in degrees (-180 to 180)"),
]


class CoordinatesMixin(BaseModel):
    """Mixin for validated latitude/longitude fields."""

    latitude: Latitude
    longitude: Longitude
