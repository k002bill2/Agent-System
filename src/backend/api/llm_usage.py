"""Internal LLM usage ledger API."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from models.llm_usage import LLMUsageRecordResponse, LLMUsageSummaryResponse
from services.llm_usage_ledger_service import get_usage_summary, list_usage_records

try:
    from api.deps import get_current_user, get_db_session

    AUTH_AVAILABLE = True
except ImportError:
    AUTH_AVAILABLE = False
    get_current_user = None  # type: ignore[assignment]
    get_db_session = None  # type: ignore[assignment]


router = APIRouter(prefix="/llm-usage", tags=["llm-usage"])


def _default_start() -> datetime:
    return datetime.now(tz=UTC) - timedelta(days=30)


def _default_end() -> datetime:
    return datetime.now(tz=UTC)


def _is_manager_or_admin(user) -> bool:
    return user.role in ("admin", "manager") or user.is_admin


if AUTH_AVAILABLE:

    @router.get("/summary", response_model=LLMUsageSummaryResponse)
    async def get_llm_usage_summary(
        start_time: datetime | None = Query(default=None),
        end_time: datetime | None = Query(default=None),
        provider: str | None = Query(default=None),
        mode: str | None = Query(default=None),
        source: str | None = Query(default=None),
        user_id: str | None = Query(default=None),
        organization_id: str | None = Query(default=None),
        project_id: str | None = Query(default=None),
        current_user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> LLMUsageSummaryResponse:
        """Get internal LLM usage summary.

        Admins/managers can filter by user/org. Regular users are scoped to
        their own usage regardless of the querystring.
        """
        if not _is_manager_or_admin(current_user):
            user_id = current_user.id
            organization_id = None

        return await get_usage_summary(
            db,
            start_time=start_time or _default_start(),
            end_time=end_time or _default_end(),
            provider=provider,
            mode=mode,
            source=source,
            user_id=user_id,
            organization_id=organization_id,
            project_id=project_id,
        )

    @router.get("/records", response_model=list[LLMUsageRecordResponse])
    async def get_llm_usage_records(
        start_time: datetime | None = Query(default=None),
        end_time: datetime | None = Query(default=None),
        provider: str | None = Query(default=None),
        mode: str | None = Query(default=None),
        source: str | None = Query(default=None),
        user_id: str | None = Query(default=None),
        organization_id: str | None = Query(default=None),
        project_id: str | None = Query(default=None),
        limit: int = Query(default=100, ge=1, le=1000),
        current_user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> list[LLMUsageRecordResponse]:
        """List internal LLM usage records."""
        if not _is_manager_or_admin(current_user):
            user_id = current_user.id
            organization_id = None

        return await list_usage_records(
            db,
            start_time=start_time or _default_start(),
            end_time=end_time or _default_end(),
            provider=provider,
            mode=mode,
            source=source,
            user_id=user_id,
            organization_id=organization_id,
            project_id=project_id,
            limit=limit,
        )

else:

    @router.get("/summary", response_model=LLMUsageSummaryResponse)  # type: ignore[misc]
    async def get_llm_usage_summary() -> LLMUsageSummaryResponse:  # type: ignore[misc]
        now = _default_end()
        return LLMUsageSummaryResponse(period_start=now - timedelta(days=30), period_end=now)

    @router.get("/records", response_model=list[LLMUsageRecordResponse])  # type: ignore[misc]
    async def get_llm_usage_records() -> list[LLMUsageRecordResponse]:  # type: ignore[misc]
        return []
