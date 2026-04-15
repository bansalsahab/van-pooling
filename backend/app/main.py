"""FastAPI application entry point."""
from __future__ import annotations

import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.rate_limit import limiter
from app.database import check_database_connection, init_db
from app.services.dispatch_worker import dispatch_worker_loop, run_startup_recovery
from app.services.domain_profile_service import register_domain_profiling_middleware
from app.services.migration_service import upgrade_database_schema
from app.services.notification_service import ensure_notification_schema
from app.services.runtime_schema_service import (
    ensure_company_schema,
    ensure_ride_request_schema,
    ensure_trip_schema,
    ensure_user_schema,
)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=settings.DESCRIPTION,
)

# Add rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

register_domain_profiling_middleware(app)

# CORS configuration with restricted methods for security
# Note: CSRF protection is inherent in this architecture because:
# 1. JWT tokens are stored in localStorage (not cookies)
# 2. Authorization header must be explicitly set by JavaScript
# 3. Browsers don't automatically send localStorage tokens cross-origin
# For additional protection, we restrict CORS origins and methods.
ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
ALLOWED_HEADERS = [
    "Authorization",
    "Content-Type",
    "Accept",
    "Origin",
    "X-Requested-With",
    "X-SCIM-Token",
]

if settings.BACKEND_CORS_ORIGINS:
    allow_origin_regex = None
    if settings.ENVIRONMENT != "production":
        # Allow common local-network dev origins (e.g., 192.168.x.x:5173) during development.
        allow_origin_regex = (
            r"^https?://("
            r"localhost|127\.0\.0\.1|10\.0\.2\.2|"
            r"192\.168\.\d{1,3}\.\d{1,3}|"
            r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
            r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}"
            r")(:\d+)?$"
        )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
        allow_origin_regex=allow_origin_regex,
        allow_credentials=True,
        allow_methods=ALLOWED_METHODS,
        allow_headers=ALLOWED_HEADERS,
    )

app.include_router(api_router, prefix=settings.API_V1_STR)


@app.on_event("startup")
async def startup() -> None:
    """Initialize the database, recover pending dispatches, and start workers."""
    if settings.AUTO_RUN_MIGRATIONS:
        upgrade_database_schema()
    else:
        init_db()
        ensure_trip_schema()
        ensure_ride_request_schema()
        ensure_user_schema()
        ensure_notification_schema()
    ensure_company_schema()
    ensure_user_schema()
    run_startup_recovery()
    app.state.dispatch_stop_event = asyncio.Event()
    app.state.dispatch_task = asyncio.create_task(
        dispatch_worker_loop(app.state.dispatch_stop_event)
    )


@app.on_event("shutdown")
async def shutdown() -> None:
    """Stop background workers."""
    stop_event = getattr(app.state, "dispatch_stop_event", None)
    task = getattr(app.state, "dispatch_task", None)
    if stop_event is not None:
        stop_event.set()
    if task is not None:
        await task


@app.get("/", tags=["meta"])
def root() -> dict[str, str]:
    """Landing endpoint for quick verification."""
    return {
        "name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs": "/docs",
    }


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    """Application health snapshot."""
    return {
        "status": "ok",
        "database": "connected" if check_database_connection() else "unavailable",
    }
