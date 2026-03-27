"""Realtime SSE and WebSocket routes."""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

from app.api.deps import _resolve_user_from_token, get_current_user_from_stream_token
from app.database import SessionLocal
from app.models.user import User
from app.services.live_service import build_live_events, build_live_snapshot

router = APIRouter(prefix="/live", tags=["live"])


def _load_snapshot(user_id) -> dict | None:
    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        if user is None:
            return None
        return build_live_snapshot(db, user)
    finally:
        db.close()


@router.get("/stream")
async def live_stream(
    request: Request,
    current_user: User = Depends(get_current_user_from_stream_token),
) -> StreamingResponse:
    """Stream role-specific live snapshots to the frontend over SSE."""

    async def event_generator():
        last_payload = ""
        previous_snapshot = None
        sequence = 0

        while True:
            if await request.is_disconnected():
                break

            payload = _load_snapshot(current_user.id)
            if payload is None:
                break

            serialized = json.dumps(payload, separators=(",", ":"), sort_keys=True)
            if serialized != last_payload:
                events = build_live_events(previous_snapshot, payload)
                yield (
                    f"id: {sequence}\n"
                    "event: snapshot\n"
                    f"data: {serialized}\n\n"
                )
                sequence += 1
                for event in events:
                    yield (
                        f"id: {sequence}\n"
                        f"event: {event['event']}\n"
                        f"data: {json.dumps(event['payload'], separators=(',', ':'), sort_keys=True)}\n\n"
                    )
                    sequence += 1
                last_payload = serialized
                previous_snapshot = payload
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


@router.websocket("/ws")
async def live_websocket(websocket: WebSocket) -> None:
    """Stream role-specific live snapshots over WebSocket."""
    token = websocket.query_params.get("access_token") or websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4401)
        return

    db = SessionLocal()
    try:
        current_user = _resolve_user_from_token(db, token)
    except Exception:
        db.close()
        await websocket.close(code=4401)
        return
    finally:
        db.close()

    await websocket.accept()
    last_payload = ""
    previous_snapshot = None
    sequence = 0

    try:
        while True:
            payload = _load_snapshot(current_user.id)
            if payload is None:
                await websocket.close(code=4404)
                return

            serialized = json.dumps(payload, separators=(",", ":"), sort_keys=True)
            if serialized != last_payload:
                events = build_live_events(previous_snapshot, payload)
                await websocket.send_json(
                    {
                        "event": "snapshot.updated",
                        "sequence": sequence,
                        "payload": payload,
                    }
                )
                sequence += 1
                for event in events:
                    await websocket.send_json(
                        {
                            "event": event["event"],
                            "sequence": sequence,
                            "payload": event["payload"],
                        }
                    )
                    sequence += 1
                last_payload = serialized
                previous_snapshot = payload
            else:
                await websocket.send_json(
                    {
                        "event": "heartbeat",
                        "payload": {"generated_at": payload["generated_at"]},
                    }
                )
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        return
