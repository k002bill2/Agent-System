"""External LLM usage monitoring API endpoints."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import UserLLMCredentialModel
from models.external_usage import (
    ExternalProvider,
    ExternalUsageSummaryResponse,
    ProviderConfig,
    ProviderHealthStatus,
    SyncRequest,
)
from services.external_usage_service import get_external_usage_service

try:
    from api.deps import get_current_user, get_db_session

    AUTH_AVAILABLE = True
except ImportError:
    AUTH_AVAILABLE = False
    get_current_user = None  # type: ignore[assignment]
    get_db_session = None  # type: ignore[assignment]

router = APIRouter(prefix="/external-usage", tags=["external-usage"])


def _default_start() -> datetime:
    return datetime.now(tz=UTC) - timedelta(days=30)


def _default_end() -> datetime:
    return datetime.now(tz=UTC)


@router.get("/summary", response_model=ExternalUsageSummaryResponse)
async def get_external_usage_summary(
    start_time: datetime | None = Query(default=None),
    end_time: datetime | None = Query(default=None),
    providers: list[str] | None = Query(default=None),
) -> ExternalUsageSummaryResponse:
    """Get aggregated usage summary across external LLM providers."""
    svc = get_external_usage_service()
    start = start_time or _default_start()
    end = end_time or _default_end()

    provider_enums: list[ExternalProvider] | None = None
    if providers:
        try:
            provider_enums = [ExternalProvider(p) for p in providers]
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid provider: {exc}") from exc

    return await svc.get_summary(start, end, provider_enums)


if AUTH_AVAILABLE:

    @router.get("/providers", response_model=list[ProviderConfig])
    async def get_providers(
        current_user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> list[ProviderConfig]:
        """List all supported providers with configuration status (env vars + DB credentials)."""
        svc = get_external_usage_service()
        configs = await svc.get_configured_providers()

        # Also check DB for user's stored credentials
        user_id = str(current_user.id)
        result = await db.execute(
            select(UserLLMCredentialModel.provider).where(
                and_(
                    UserLLMCredentialModel.user_id == user_id,
                    UserLLMCredentialModel.is_active == True,  # noqa: E712
                )
            )
        )
        db_providers = {row[0] for row in result.all()}

        # Merge: if user has a DB credential, mark provider as enabled
        return [
            cfg.model_copy(update={"enabled": True}) if cfg.provider.value in db_providers else cfg
            for cfg in configs
        ]

else:

    @router.get("/providers", response_model=list[ProviderConfig])
    async def get_providers() -> list[ProviderConfig]:  # type: ignore[misc]
        """List all supported providers (auth unavailable)."""
        svc = get_external_usage_service()
        return await svc.get_configured_providers()


@router.get(
    "/providers/{provider}/health",
    response_model=ProviderHealthStatus,
)
async def get_provider_health(provider: str) -> ProviderHealthStatus:
    """Check connectivity for a specific provider."""
    try:
        provider_enum = ExternalProvider(provider)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider}") from exc

    svc = get_external_usage_service()
    statuses = await svc.get_provider_health()
    for status in statuses:
        if status.provider == provider_enum:
            return status

    return ProviderHealthStatus(
        provider=provider_enum,
        is_healthy=False,
        error_message="Provider not configured",
    )


@router.post("/sync")
async def sync_usage(body: SyncRequest | None = None) -> dict:
    """Manually trigger usage data sync for one or all providers."""
    svc = get_external_usage_service()

    start = (body and body.start_time) or _default_start()
    end = (body and body.end_time) or _default_end()
    providers = [body.provider] if (body and body.provider) else None

    result = await svc.get_summary(start, end, providers)
    return {
        "synced_records": len(result.records),
        "providers": [s.provider for s in result.providers],
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
    }
