"""API v1 router composition."""
from fastapi import APIRouter

from app.api.v1 import admin, ai, auth, driver, live, maps, notifications, rides

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(rides.router)
api_router.include_router(driver.router)
api_router.include_router(admin.router)
api_router.include_router(ai.router)
api_router.include_router(maps.router)
api_router.include_router(notifications.router)
api_router.include_router(live.router)
