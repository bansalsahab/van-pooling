"""Rate limiting middleware using slowapi."""
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.requests import Request

from app.core.config import settings


def _get_request_identifier(request: Request) -> str:
    """Get identifier for rate limiting - prefer user ID if authenticated."""
    # Try to get user from request state (set by auth middleware)
    user = getattr(request.state, "user", None)
    if user and hasattr(user, "id"):
        return f"user:{user.id}"
    
    # Fall back to IP address
    return get_remote_address(request)


# Create limiter with configurable rates
limiter = Limiter(
    key_func=_get_request_identifier,
    default_limits=[
        f"{settings.RATE_LIMIT_PER_MINUTE}/minute",
        f"{settings.RATE_LIMIT_PER_HOUR}/hour",
    ],
    storage_uri=settings.REDIS_URL if settings.REDIS_URL != "redis://localhost:6379/0" else None,
    strategy="fixed-window",
)

# Stricter limits for sensitive endpoints
AUTH_RATE_LIMIT = "10/minute"  # Login/register attempts
SCIM_RATE_LIMIT = "100/minute"  # SCIM sync hooks
SSO_RATE_LIMIT = "20/minute"  # SSO start requests


def get_rate_limit_handler():
    """Return the rate limit exceeded handler."""
    return _rate_limit_exceeded_handler


__all__ = [
    "limiter",
    "RateLimitExceeded",
    "AUTH_RATE_LIMIT",
    "SCIM_RATE_LIMIT", 
    "SSO_RATE_LIMIT",
    "get_rate_limit_handler",
]
