"""OpenAI Responses API helpers."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from typing import Any
from urllib import error, request

from app.core.config import settings


_CACHE_TTL = timedelta(minutes=1)
_response_cache: dict[str, tuple[datetime, dict[str, Any]]] = {}
logger = logging.getLogger(__name__)


def create_structured_output(
    *,
    cache_key: str,
    system_prompt: str,
    user_prompt: str,
    schema_name: str,
    schema: dict[str, Any],
) -> dict[str, Any] | None:
    """Generate JSON output from the Responses API."""
    if not settings.openai_enabled:
        return None

    cached = _read_cache(cache_key)
    if cached is not None:
        return cached

    payload: dict[str, Any] = {
        "model": settings.OPENAI_MODEL,
        "store": False,
        "input": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": schema_name,
                "strict": True,
                "schema": schema,
            }
        },
    }
    if settings.OPENAI_REASONING_EFFORT:
        payload["reasoning"] = {"effort": settings.OPENAI_REASONING_EFFORT}

    try:
        response = _post_openai(payload)
    except RuntimeError as exc:
        logger.warning("OpenAI request failed with reasoning enabled: %s", exc)
        payload.pop("reasoning", None)
        try:
            response = _post_openai(payload)
        except RuntimeError as retry_exc:
            logger.error("OpenAI request failed after retrying without reasoning: %s", retry_exc)
            return None

    if response.get("error"):
        logger.error("OpenAI returned an error payload: %s", _truncate(response["error"]))
        return None

    output_text = _extract_output_text(response)
    if not output_text:
        logger.warning(
            "OpenAI response did not include output text. response_id=%s status=%s",
            response.get("id"),
            response.get("status"),
        )
        return None
    try:
        structured = json.loads(output_text)
    except ValueError:
        logger.warning("OpenAI returned non-JSON output: %s", _truncate(output_text))
        return None

    _write_cache(cache_key, structured)
    return structured


def _post_openai(payload: dict[str, Any]) -> dict[str, Any]:
    req = request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=settings.OPENAI_TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        logger.error("OpenAI HTTP error %s: %s", exc.code, _truncate(body))
        raise RuntimeError(f"OpenAI request failed with status {exc.code}.") from exc
    except error.URLError as exc:
        logger.error("OpenAI connection error: %s", exc.reason)
        raise RuntimeError("OpenAI connection failed.") from exc
    except (TimeoutError, ValueError) as exc:
        logger.error("OpenAI response parsing failed: %s", exc)
        raise RuntimeError("OpenAI response parsing failed.") from exc


def _extract_output_text(response: dict[str, Any]) -> str | None:
    output_text = _coerce_text(response.get("output_text"))
    if output_text:
        return output_text

    for item in response.get("output") or []:
        if not isinstance(item, dict):
            continue
        for content in item.get("content") or []:
            if not isinstance(content, dict):
                continue
            if content.get("type") in {"output_text", "text"}:
                content_text = _coerce_text(content.get("text")) or _coerce_text(
                    content.get("value")
                )
                if content_text:
                    return content_text
            if content.get("type") == "json" and content.get("json") is not None:
                return json.dumps(content["json"])
    return None


def _coerce_text(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value
    if isinstance(value, dict):
        for key in ("value", "text"):
            nested = _coerce_text(value.get(key))
            if nested:
                return nested
        return json.dumps(value)
    return None


def _read_cache(cache_key: str) -> dict[str, Any] | None:
    cached = _response_cache.get(cache_key)
    if not cached:
        return None
    expires_at, payload = cached
    if datetime.utcnow() > expires_at:
        _response_cache.pop(cache_key, None)
        return None
    return payload


def _write_cache(cache_key: str, payload: dict[str, Any]) -> None:
    _response_cache[cache_key] = (datetime.utcnow() + _CACHE_TTL, payload)


def _truncate(value: Any, limit: int = 600) -> str:
    text = value if isinstance(value, str) else json.dumps(value, default=str)
    if len(text) <= limit:
        return text
    return f"{text[:limit]}..."
