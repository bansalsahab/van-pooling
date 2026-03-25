"""Common schema fragments."""
from pydantic import BaseModel


class MessageResponse(BaseModel):
    """Simple response envelope for mutation endpoints."""

    message: str
