"""Transparent LLM proxy — records token usage per user in real-time."""

from __future__ import annotations

import time
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from models.external_usage import ExternalProvider, UnifiedUsageRecord
from services.credential_service import get_raw_key
from services.external_usage_service import get_external_usage_service

try:
    from api.deps import get_current_user, get_db_session

    AUTH_AVAILABLE = True
except ImportError:
    AUTH_AVAILABLE = False
    get_current_user = None
    get_db_session = None

router = APIRouter(prefix="/proxy", tags=["llm-proxy"])

PROVIDER_BASE_URLS: dict[str, str] = {
    "openai": "https://api.openai.com/v1",
    "anthropic": "https://api.anthropic.com/v1",
    "google_gemini": "https://generativelanguage.googleapis.com/v1beta",
}

COST_TABLE: list[tuple[str, float, float]] = [
    ("gpt-4o-mini", 0.00015, 0.0006),
    ("gpt-4o", 0.005, 0.015),
    ("o1-mini", 0.003, 0.012),
    ("o1", 0.015, 0.060),
    ("claude-opus-4", 0.015, 0.075),
    ("claude-sonnet-4", 0.003, 0.015),
    ("claude-haiku-4", 0.00025, 0.00125),
    ("gemini-2.0-flash", 0.00025, 0.001),
    ("gemini-1.5-pro", 0.00125, 0.005),
]

# Map provider name strings to ExternalProvider enum values
_PROVIDER_ENUM_MAP: dict[str, ExternalProvider] = {
    "openai": ExternalProvider.OPENAI,
    "anthropic": ExternalProvider.ANTHROPIC,
    "google_gemini": ExternalProvider.GOOGLE_GEMINI,
}


def _calc_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    for prefix, cost_in, cost_out in COST_TABLE:
        if model.startswith(prefix):
            return (input_tokens / 1000) * cost_in + (output_tokens / 1000) * cost_out
    return 0.0


def _build_headers(provider: str, api_key: str) -> dict[str, str]:
    if provider == "openai":
        return {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    elif provider == "anthropic":
        return {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
    return {"Content-Type": "application/json"}


def _extract_usage(provider: str, response_json: dict) -> tuple[int, int, str]:
    """Extract (input_tokens, output_tokens, model) from LLM response."""
    model = response_json.get("model", "unknown")
    if provider == "openai":
        usage = response_json.get("usage", {})
        return (
            usage.get("prompt_tokens", 0),
            usage.get("completion_tokens", 0),
            model,
        )
    elif provider == "anthropic":
        usage = response_json.get("usage", {})
        return (
            usage.get("input_tokens", 0),
            usage.get("output_tokens", 0),
            model,
        )
    # google_gemini or unknown
    usage_meta = response_json.get("usageMetadata", {})
    return (
        usage_meta.get("promptTokenCount", 0),
        usage_meta.get("candidatesTokenCount", 0),
        model,
    )


if AUTH_AVAILABLE:

    @router.post("/chat/completions")
    async def proxy_chat(
        request: Request,
        current_user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db_session),
    ):
        """Proxy a chat completion request to the target LLM provider.

        Pass `X-Provider: openai|anthropic|google_gemini` header to select provider.
        The user's stored API key for that provider is used automatically.
        Token usage is recorded in the ExternalUsageService for analytics.
        """
        provider_name = request.headers.get("X-Provider", "openai").lower()
        if provider_name not in PROVIDER_BASE_URLS:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown provider '{provider_name}'. Use one of: {list(PROVIDER_BASE_URLS)}",
            )

        provider_enum = _PROVIDER_ENUM_MAP.get(provider_name, ExternalProvider.OPENAI)
        api_key = await get_raw_key(db, current_user.id, provider_enum)
        if not api_key:
            raise HTTPException(
                status_code=400,
                detail=f"No API key configured for provider '{provider_name}'. "
                "Register a key via /api/llm-credentials.",
            )

        body = await request.body()
        base_url = PROVIDER_BASE_URLS[provider_name]
        target_url = f"{base_url}/chat/completions"

        t0 = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                upstream_resp = await client.post(
                    target_url,
                    content=body,
                    headers=_build_headers(provider_name, api_key),
                )
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Upstream LLM request timed out.")
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Upstream request failed: {e}")

        latency_ms = (time.monotonic() - t0) * 1000

        # Best-effort: parse usage from response and record it
        try:
            resp_json = upstream_resp.json()
            input_tok, output_tok, model = _extract_usage(provider_name, resp_json)
            cost = _calc_cost(model, input_tok, output_tok)

            svc = get_external_usage_service()
            svc.add_record(
                UnifiedUsageRecord(
                    provider=provider_enum,
                    timestamp=datetime.now(tz=timezone.utc),
                    bucket_width="realtime",
                    input_tokens=input_tok,
                    output_tokens=output_tok,
                    total_tokens=input_tok + output_tok,
                    cost_usd=cost,
                    request_count=1,
                    model=model,
                    user_id=current_user.id,
                    raw_data={"latency_ms": round(latency_ms, 1)},
                )
            )
        except Exception:
            # Never let analytics errors break the proxy response
            pass

        from fastapi.responses import Response

        return Response(
            content=upstream_resp.content,
            status_code=upstream_resp.status_code,
            media_type=upstream_resp.headers.get("content-type", "application/json"),
        )

else:

    @router.post("/chat/completions")
    async def proxy_chat_no_auth(request: Request):
        raise HTTPException(status_code=503, detail="Auth not available")
