"""External LLM usage monitoring API endpoints."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from models.external_usage import (
    DeploymentUsageKeyResponse,
    DeploymentUsageKeyUpsert,
    DeploymentUsageKeyVerifyResponse,
    ExternalProvider,
    ExternalUsageSummaryResponse,
    ProviderConfig,
    ProviderHealthStatus,
    SyncRequest,
)
from services import deployment_usage_credential_service as ducs
from services.external_usage_service import get_external_usage_service

try:
    from api.deps import (
        get_current_admin_or_manager_user,
        get_current_user,
        get_db_session,
    )

    AUTH_AVAILABLE = True
except ImportError:
    AUTH_AVAILABLE = False
    get_current_user = None  # type: ignore[assignment]
    get_current_admin_or_manager_user = None  # type: ignore[assignment]
    get_db_session = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/external-usage", tags=["external-usage"])


def _default_start() -> datetime:
    return datetime.now(tz=UTC) - timedelta(days=30)


def _default_end() -> datetime:
    return datetime.now(tz=UTC)


def _parse_provider(provider: str) -> ExternalProvider:
    try:
        return ExternalProvider(provider)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider}") from exc


def _parse_provider_list(providers: list[str]) -> list[ExternalProvider]:
    try:
        return [ExternalProvider(p) for p in providers]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid provider: {exc}") from exc


def _sync_response(result: ExternalUsageSummaryResponse, start: datetime, end: datetime) -> dict:
    return {
        "synced_records": len(result.records),
        "providers": [s.provider for s in result.providers],
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
    }


if AUTH_AVAILABLE:

    @router.get("/summary", response_model=ExternalUsageSummaryResponse)
    async def get_external_usage_summary(
        start_time: datetime | None = Query(default=None),
        end_time: datetime | None = Query(default=None),
        providers: list[str] | None = Query(default=None),
        current_user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> ExternalUsageSummaryResponse:
        """Get aggregated usage summary across external LLM providers."""
        svc = get_external_usage_service()
        start = start_time or _default_start()
        end = end_time or _default_end()
        provider_enums = _parse_provider_list(providers) if providers else None
        return await svc.get_summary(db, start, end, provider_enums)

    @router.get("/providers", response_model=list[ProviderConfig])
    async def get_providers(
        current_user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> list[ProviderConfig]:
        """List supported providers with usage-admin-key configuration status.

        Badge truth: ``enabled`` reflects only the deployment usage key
        (DB row or ``EXTERNAL_*`` env) — never per-user chat credentials.
        """
        svc = get_external_usage_service()
        return await svc.get_configured_providers(db)

    @router.get("/providers/{provider}/health", response_model=ProviderHealthStatus)
    async def get_provider_health(
        provider: str,
        current_user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> ProviderHealthStatus:
        """Check connectivity for a specific provider."""
        provider_enum = _parse_provider(provider)
        svc = get_external_usage_service()
        statuses = await svc.get_provider_health(db)
        for status in statuses:
            if status.provider == provider_enum:
                return status
        return ProviderHealthStatus(
            provider=provider_enum,
            is_healthy=False,
            error_message="Provider not configured",
        )

    @router.post("/sync")
    async def sync_usage(
        body: SyncRequest | None = None,
        current_user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> dict:
        """Manually trigger usage data sync for one or all providers."""
        svc = get_external_usage_service()
        start = (body and body.start_time) or _default_start()
        end = (body and body.end_time) or _default_end()
        providers = [body.provider] if (body and body.provider) else None

        # Refresh Claude session snapshots first so the CLAUDE_CLI card reflects
        # the latest host sessions. Snapshots are otherwise only synced when the
        # Claude Sessions page is opened, so a stale table can drop recently
        # active sessions from the window (snapshot freshness follow-up).
        # Best-effort: a scan failure must not break the usage summary.
        try:
            from api.claude_sessions import scan_and_sync_claude_snapshots

            await scan_and_sync_claude_snapshots()
        except Exception:
            logger.warning("claude_snapshot_refresh_failed", exc_info=True)

        result = await svc.get_summary(db, start, end, providers)
        return _sync_response(result, start, end)

    # ── Deployment usage key CRUD (admin/manager only) ──────────────

    @router.get("/admin-keys", response_model=list[DeploymentUsageKeyResponse])
    async def list_admin_keys(
        current_user=Depends(get_current_admin_or_manager_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> list[DeploymentUsageKeyResponse]:
        """List per-provider deployment usage key status (keys masked)."""
        return await ducs.list_deployment_keys(db)

    @router.put("/admin-keys/{provider}", response_model=DeploymentUsageKeyResponse)
    async def upsert_admin_key(
        provider: str,
        data: DeploymentUsageKeyUpsert,
        current_user=Depends(get_current_admin_or_manager_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> DeploymentUsageKeyResponse:
        """Create or update the deployment usage key for a provider."""
        provider_enum = _parse_provider(provider)
        if provider_enum not in ducs.SUPPORTED_PROVIDERS:
            raise HTTPException(
                status_code=400,
                detail=f"Provider does not support usage credentials: {provider}",
            )
        try:
            return await ducs.upsert_deployment_key(db, provider_enum, data)
        except ValueError as exc:
            # New credential requested without an api_key (omission only preserves
            # an existing key — design A5).
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.delete("/admin-keys/{provider}")
    async def delete_admin_key(
        provider: str,
        current_user=Depends(get_current_admin_or_manager_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> dict:
        """Hard-delete the deployment usage key for a provider."""
        provider_enum = _parse_provider(provider)
        deleted = await ducs.delete_deployment_key(db, provider_enum)
        if not deleted:
            raise HTTPException(
                status_code=404,
                detail=f"No usage key configured for provider: {provider}",
            )
        return {"deleted": True, "provider": provider_enum.value}

    @router.post("/admin-keys/{provider}/verify", response_model=DeploymentUsageKeyVerifyResponse)
    async def verify_admin_key(
        provider: str,
        current_user=Depends(get_current_admin_or_manager_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> DeploymentUsageKeyVerifyResponse:
        """Verify the resolved usage key against the provider's real usage endpoint."""
        provider_enum = _parse_provider(provider)
        return await ducs.verify_deployment_key(db, provider_enum)

else:
    # Degraded fallback: auth deps unavailable. Read endpoints open their own
    # session (independent of api.deps). No admin CRUD without an auth gate.

    from db.database import async_session_factory

    @router.get("/summary", response_model=ExternalUsageSummaryResponse)  # type: ignore[misc]
    async def get_external_usage_summary(  # type: ignore[misc]
        start_time: datetime | None = Query(default=None),
        end_time: datetime | None = Query(default=None),
        providers: list[str] | None = Query(default=None),
    ) -> ExternalUsageSummaryResponse:
        """Get aggregated usage summary (auth unavailable)."""
        svc = get_external_usage_service()
        start = start_time or _default_start()
        end = end_time or _default_end()
        provider_enums = _parse_provider_list(providers) if providers else None
        async with async_session_factory() as session:
            return await svc.get_summary(session, start, end, provider_enums)

    @router.get("/providers", response_model=list[ProviderConfig])  # type: ignore[misc]
    async def get_providers() -> list[ProviderConfig]:  # type: ignore[misc]
        """List supported providers (auth unavailable)."""
        svc = get_external_usage_service()
        async with async_session_factory() as session:
            return await svc.get_configured_providers(session)

    @router.get(  # type: ignore[misc]
        "/providers/{provider}/health", response_model=ProviderHealthStatus
    )
    async def get_provider_health(provider: str) -> ProviderHealthStatus:  # type: ignore[misc]
        """Check connectivity for a specific provider (auth unavailable)."""
        provider_enum = _parse_provider(provider)
        svc = get_external_usage_service()
        async with async_session_factory() as session:
            statuses = await svc.get_provider_health(session)
        for status in statuses:
            if status.provider == provider_enum:
                return status
        return ProviderHealthStatus(
            provider=provider_enum,
            is_healthy=False,
            error_message="Provider not configured",
        )

    @router.post("/sync")  # type: ignore[misc]
    async def sync_usage(body: SyncRequest | None = None) -> dict:  # type: ignore[misc]
        """Manually trigger usage data sync (auth unavailable)."""
        svc = get_external_usage_service()
        start = (body and body.start_time) or _default_start()
        end = (body and body.end_time) or _default_end()
        providers = [body.provider] if (body and body.provider) else None
        async with async_session_factory() as session:
            result = await svc.get_summary(session, start, end, providers)
        return _sync_response(result, start, end)
