"""Realtime server-sent event routes."""
import asyncio
import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.api.deps import get_current_user_from_stream_token
from app.database import SessionLocal
from app.models.user import User
from app.services.live_service import build_live_snapshot

router = APIRouter(prefix="/live", tags=["live"])


@router.get("/stream")
async def live_stream(
    request: Request,
    current_user: User = Depends(get_current_user_from_stream_token),
) -> StreamingResponse:
    """Stream role-specific live snapshots to the frontend."""

    async def event_generator():
        last_payload = ""
        sequence = 0

        while True:
            if await request.is_disconnected():
                break

            db = SessionLocal()
            try:
                user = db.get(User, current_user.id)
                if user is None:
                    break
                payload = build_live_snapshot(db, user)
            finally:
                db.close()

            serialized = json.dumps(payload, separators=(",", ":"), sort_keys=True)
            if serialized != last_payload:
                yield (
                    f"id: {sequence}\n"
                    f"event: snapshot\n"
                    f"data: {serialized}\n\n"
                )
                last_payload = serialized
                sequence += 1
            else:
                yield (
                    "event: heartbeat\n"
                    f"data: {json.dumps({'generated_at': payload['generated_at']})}\n\n"
                )

            await asyncio.sleep(2)

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers=headers,
    )
