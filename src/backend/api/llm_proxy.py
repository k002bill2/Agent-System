"""Transparent LLM proxy — records token usage per user in real-time."""

from __future__ import annotations

import os
import time
from datetime import UTC, datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from models.external_usage import ExternalProvider, UnifiedUsageRecord
from models.llm_usage import (
    LLMRuntimeMode,
    LLMUsageMeasurementMethod,
    LLMUsageRecordCreate,
    LLMUsageSource,
    LLMUsageStatus,
)
from services.credential_service import get_raw_key
from services.external_usage_service import get_external_usage_service
from services.llm_usage_ledger_service import record_usage_best_effort

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
    ("gpt-6-astra", 0.010, 0.050),
    ("gpt-4o-mini", 0.00015, 0.0006),
    ("gpt-4o", 0.005, 0.015),
    ("o1-mini", 0.003, 0.012),
    ("o1", 0.015, 0.060),
    # GPT-5.6/5.5/5.4 · o-series: 값은 models/llm_models.py `_MODELS`(SSOT) 그대로.
    # startswith 선착 매칭이므로 구체 변종(-sol/-terra/-luna, -mini/-nano)이
    # bare alias("gpt-5.6"/"gpt-5.4")보다 **먼저** 와야 한다 — 뒤에 두면 terra/luna/
    # nano 가 조용히 alias 단가로 재가격된다. disabled seed(5.5/5.4 계열)도
    # admin 의 PATCH 한 번으로 즉시 라이브가 되므로 행을 함께 둔다.
    ("gpt-5.6-sol", 0.004, 0.02),
    ("gpt-5.6-terra", 0.002, 0.012),
    ("gpt-5.6-luna", 0.0002, 0.0012),
    ("gpt-5.6", 0.004, 0.02),
    ("gpt-5.5", 0.005, 0.03),
    ("gpt-5.4-mini", 0.00075, 0.0045),
    ("gpt-5.4-nano", 0.0002, 0.00125),
    ("gpt-5.4", 0.0025, 0.015),
    ("o4-mini", 0.0011, 0.0044),
    # o3 변종: generic "o3" 는 o3-mini/o3-pro 도 매칭하므로 반드시 앞에 온다.
    # 단가는 공식 가격표 표준 티어 (2026-09-08 확인).
    ("o3-pro", 0.020, 0.080),
    ("o3-mini", 0.0011, 0.0044),
    ("o3", 0.002, 0.008),
    ("claude-fable-5-1", 0.010, 0.050),
    ("claude-opus-5", 0.005, 0.025),
    ("claude-sonnet-5", 0.002, 0.010),
    ("claude-opus-4-8", 0.005, 0.025),
    # Opus price cut ($5/$25) applies from Opus 4.5 onward; these specific
    # prefixes must precede the generic "claude-opus-4" (4-0/4-1 era $15/$75).
    ("claude-opus-4-7", 0.005, 0.025),
    ("claude-opus-4-6", 0.005, 0.025),
    ("claude-opus-4-5", 0.005, 0.025),
    ("claude-opus-4", 0.015, 0.075),
    ("claude-sonnet-4", 0.003, 0.015),
    ("claude-haiku-4-5", 0.001, 0.005),
    ("claude-haiku-4", 0.00025, 0.00125),
    # Gemini 3.x Flash: $0.75/$3.75 per 1M (공식 가격표, 2026-09-05 확인).
    # 행이 없으면 _calc_cost 가 조용히 0.0 을 돌려줘 전액 미집계된다.
    ("gemini-3.8-flash", 0.00075, 0.00375),
    ("gemini-3.7-flash", 0.00075, 0.00375),
    # Gemini 3.x preview · 2.5 계열: 값은 `_MODELS`(SSOT) 그대로. 3.8/3.7-flash 와는
    # prefix 가 겹치지 않으나("gemini-3." vs "gemini-3-"), 세대 내림차순으로 두어
    # 이후 세대 행이 legacy 앞에 오는 배치 규칙을 유지한다.
    ("gemini-3.1-pro-preview", 0.002, 0.012),
    ("gemini-3.1-flash-lite-preview", 0.00025, 0.0015),
    ("gemini-3-flash-preview", 0.0005, 0.003),
    ("gemini-2.5-pro", 0.00125, 0.01),
    ("gemini-2.5-flash", 0.0003, 0.0025),
    ("gemini-2.0-flash", 0.00025, 0.001),
    ("gemini-1.5-pro", 0.00125, 0.005),
]

# Map provider name strings to ExternalProvider enum values
_PROVIDER_ENUM_MAP: dict[str, ExternalProvider] = {
    "openai": ExternalProvider.OPENAI,
    "anthropic": ExternalProvider.ANTHROPIC,
    "google_gemini": ExternalProvider.GOOGLE_GEMINI,
}


def _api_fallback_enabled() -> bool:
    return os.getenv("LLM_API_FALLBACK_ENABLED", "false").lower() in {
        "1",
        "true",
        "yes",
        "on",
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
    # Gemini generateContent 응답에는 top-level "model" 이 없고 "modelVersion" 만 있다
    # (공식 GenerateContentResponse 스키마). 이걸 읽지 않으면 model="unknown" 이라
    # COST_TABLE 의 gemini 행이 전부 도달 불가가 되어 _calc_cost 가 0.0 을 돌려준다.
    return (
        usage_meta.get("promptTokenCount", 0),
        usage_meta.get("candidatesTokenCount", 0),
        response_json.get("modelVersion") or model,
    )


async def _record_internal_proxy_usage(
    *,
    provider_name: str,
    user_id: str | None,
    organization_id: str | None = None,
    response_json: dict | None = None,
    latency_ms: float | None = None,
    status_code: int | None = None,
    error_message: str | None = None,
) -> None:
    """Record API fallback/proxy usage into the internal LLM ledger."""
    input_tokens: int | None = None
    output_tokens: int | None = None
    model: str | None = None
    measurement_method = LLMUsageMeasurementMethod.UNKNOWN

    if response_json is not None:
        input_tok, output_tok, extracted_model = _extract_usage(provider_name, response_json)
        input_tokens = input_tok
        output_tokens = output_tok
        model = extracted_model
        if input_tok or output_tok:
            measurement_method = LLMUsageMeasurementMethod.PROVIDER_METADATA

    status = LLMUsageStatus.SUCCESS
    if error_message or (status_code is not None and status_code >= 400):
        status = LLMUsageStatus.ERROR

    await record_usage_best_effort(
        LLMUsageRecordCreate(
            user_id=user_id,
            organization_id=organization_id,
            provider=provider_name,
            mode=LLMRuntimeMode.API,
            source=LLMUsageSource.API_FALLBACK_PROXY,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            measurement_method=measurement_method,
            estimated_cost_usd=(
                _calc_cost(model, input_tokens or 0, output_tokens or 0) if model else None
            ),
            status=status,
            latency_ms=int(latency_ms) if latency_ms is not None else None,
            error_message=error_message,
            metadata={"status_code": status_code} if status_code is not None else {},
            started_at=datetime.now(tz=UTC),
            completed_at=datetime.now(tz=UTC),
        )
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

        user_id = str(current_user.id)
        organization_id = getattr(current_user, "organization_id", None)
        if not _api_fallback_enabled():
            await _record_internal_proxy_usage(
                provider_name=provider_name,
                user_id=user_id,
                organization_id=organization_id,
                status_code=403,
                error_message="API fallback disabled by policy.",
            )
            raise HTTPException(status_code=403, detail="API fallback disabled by policy.")

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
            latency_ms = (time.monotonic() - t0) * 1000
            await _record_internal_proxy_usage(
                provider_name=provider_name,
                user_id=user_id,
                organization_id=organization_id,
                latency_ms=latency_ms,
                status_code=504,
                error_message="Upstream LLM request timed out.",
            )
            raise HTTPException(status_code=504, detail="Upstream LLM request timed out.")
        except Exception as e:
            latency_ms = (time.monotonic() - t0) * 1000
            await _record_internal_proxy_usage(
                provider_name=provider_name,
                user_id=user_id,
                organization_id=organization_id,
                latency_ms=latency_ms,
                status_code=502,
                error_message=f"Upstream request failed: {e}",
            )
            raise HTTPException(status_code=502, detail=f"Upstream request failed: {e}")

        latency_ms = (time.monotonic() - t0) * 1000

        # Best-effort: parse usage from response and record it
        resp_json = None
        try:
            resp_json = upstream_resp.json()
            input_tok, output_tok, model = _extract_usage(provider_name, resp_json)
            cost = _calc_cost(model, input_tok, output_tok)

            svc = get_external_usage_service()
            svc.add_record(
                UnifiedUsageRecord(
                    provider=provider_enum,
                    timestamp=datetime.now(tz=UTC),
                    bucket_width="realtime",
                    input_tokens=input_tok,
                    output_tokens=output_tok,
                    total_tokens=input_tok + output_tok,
                    cost_usd=cost,
                    request_count=1,
                    model=model,
                    user_id=user_id,
                    raw_data={"latency_ms": round(latency_ms, 1)},
                )
            )
        except Exception:
            # Never let analytics errors break the proxy response
            pass

        try:
            await _record_internal_proxy_usage(
                provider_name=provider_name,
                user_id=user_id,
                organization_id=organization_id,
                response_json=resp_json,
                latency_ms=latency_ms,
                status_code=upstream_resp.status_code,
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
