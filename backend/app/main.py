"""FastAPI application entry point."""
from __future__ import annotations

import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.database import check_database_connection, init_db
from app.services.dispatch_worker import dispatch_worker_loop, run_startup_recovery
from app.services.notification_service import ensure_notification_schema

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=settings.DESCRIPTION,
)

if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(api_router, prefix=settings.API_V1_STR)


@app.on_event("startup")
async def startup() -> None:
    """Initialize the database, recover pending dispatches, and start workers."""
    init_db()
    ensure_notification_schema()
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
