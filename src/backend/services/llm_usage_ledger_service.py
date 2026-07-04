"""Service layer for the internal LLM usage ledger."""

from __future__ import annotations

import logging
import os
from datetime import datetime
from enum import Enum
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import LLMUsageLedgerModel, OrganizationMemberModel
from models.llm_usage import (
    LLMUsageBreakdown,
    LLMUsageRecordCreate,
    LLMUsageRecordResponse,
    LLMUsageSummaryResponse,
)
from services.organization_service import OrganizationService

logger = logging.getLogger(__name__)


class LLMUsageQuotaExceededError(RuntimeError):
    """Raised when strict pre-flight quota enforcement blocks an LLM call."""

    def __init__(self, message: str, *, organization_id: str, requested_tokens: int):
        super().__init__(message)
        self.organization_id = organization_id
        self.requested_tokens = requested_tokens


def _preflight_quota_enabled() -> bool:
    return os.getenv("LLM_USAGE_PREFLIGHT_QUOTA_ENABLED", "false").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _value(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    return value


def _tokens_total(input_tokens: int | None, output_tokens: int | None) -> int | None:
    if input_tokens is None and output_tokens is None:
        return None
    return (input_tokens or 0) + (output_tokens or 0)


def build_usage_ledger_row(data: LLMUsageRecordCreate) -> LLMUsageLedgerModel:
    """Build an ORM row from the write contract without committing it."""
    total_tokens = data.total_tokens
    if total_tokens is None:
        total_tokens = _tokens_total(data.input_tokens, data.output_tokens)

    return LLMUsageLedgerModel(
        id=data.id,
        user_id=data.user_id,
        organization_id=data.organization_id,
        provider=data.provider,
        mode=data.mode.value,
        source=str(_value(data.source)),
        model=data.model,
        input_tokens=data.input_tokens,
        output_tokens=data.output_tokens,
        total_tokens=total_tokens,
        measurement_method=data.measurement_method.value,
        estimated_cost_usd=data.estimated_cost_usd,
        status=data.status.value,
        session_id=data.session_id,
        task_id=data.task_id,
        analysis_id=data.analysis_id,
        project_id=data.project_id,
        latency_ms=data.latency_ms,
        error_message=data.error_message,
        metadata_json=data.metadata,
        started_at=data.started_at,
        completed_at=data.completed_at,
    )


async def resolve_user_organization_id(db: AsyncSession, user_id: str | None) -> str | None:
    """Resolve a user's organization only when the membership is unambiguous."""
    if not user_id:
        return None

    result = await db.execute(
        select(OrganizationMemberModel).where(
            OrganizationMemberModel.user_id == user_id,
            OrganizationMemberModel.is_active.is_(True),
        )
    )
    org_ids = {
        row.organization_id
        for row in result.scalars().all()
        if getattr(row, "organization_id", None)
    }
    if len(org_ids) == 1:
        return next(iter(org_ids))
    return None


async def resolve_usage_organization_id(
    db: AsyncSession,
    *,
    user_id: str | None,
    organization_id: str | None,
) -> str | None:
    """Resolve the org scope for a ledger record.

    A selected organization is accepted only when the user is an active member.
    Records without a user can keep an explicit organization_id because service
    jobs may emit organization-scoped usage without an end-user principal.
    """
    if organization_id is None:
        return await resolve_user_organization_id(db, user_id)

    if not user_id:
        return organization_id

    result = await db.execute(
        select(OrganizationMemberModel).where(
            OrganizationMemberModel.organization_id == organization_id,
            OrganizationMemberModel.user_id == user_id,
            OrganizationMemberModel.is_active.is_(True),
        )
    )
    return organization_id if result.scalars().all() else None


async def enforce_usage_quota_preflight(
    db: AsyncSession,
    *,
    user_id: str | None,
    organization_id: str | None,
    estimated_tokens: int,
) -> str | None:
    """Check org token quota before an LLM call without mutating counters."""
    if estimated_tokens <= 0:
        return None

    resolved_org_id = await resolve_usage_organization_id(
        db,
        user_id=user_id,
        organization_id=organization_id,
    )
    if not resolved_org_id:
        return None

    org = await OrganizationService.get_organization_async(db, resolved_org_id)
    if not org:
        return None

    from services.quota_service import QuotaService

    check = QuotaService.check_token_quota(org, estimated_tokens)
    if not check.allowed:
        raise LLMUsageQuotaExceededError(
            check.message or "Organization token quota exceeded.",
            organization_id=resolved_org_id,
            requested_tokens=estimated_tokens,
        )
    return resolved_org_id


async def enforce_usage_quota_preflight_best_effort(
    *,
    user_id: str | None,
    organization_id: str | None,
    estimated_tokens: int,
) -> str | None:
    """Optionally enforce org quota before LLM calls.

    Disabled by default to keep CLI subscription usage non-blocking. Set
    ``LLM_USAGE_PREFLIGHT_QUOTA_ENABLED=true`` to turn org token quota into a
    strict pre-call gate.
    """
    if not _preflight_quota_enabled():
        return None
    if not user_id and not organization_id:
        return None
    if os.getenv("USE_DATABASE", "false").lower() != "true":
        return None

    try:
        from db.database import async_session_factory

        async with async_session_factory() as db:
            return await enforce_usage_quota_preflight(
                db,
                user_id=user_id,
                organization_id=organization_id,
                estimated_tokens=estimated_tokens,
            )
    except LLMUsageQuotaExceededError:
        raise
    except Exception:
        logger.warning("llm_usage_quota_preflight_failed", exc_info=True)
        return None


def record_to_response(row: LLMUsageLedgerModel) -> LLMUsageRecordResponse:
    """Convert an ORM row to the public response model."""
    return LLMUsageRecordResponse(
        id=row.id,
        user_id=row.user_id,
        organization_id=row.organization_id,
        provider=row.provider,
        mode=row.mode,
        source=row.source,
        model=row.model,
        input_tokens=row.input_tokens,
        output_tokens=row.output_tokens,
        total_tokens=row.total_tokens,
        measurement_method=row.measurement_method,
        estimated_cost_usd=row.estimated_cost_usd,
        status=row.status,
        session_id=row.session_id,
        task_id=row.task_id,
        analysis_id=row.analysis_id,
        project_id=row.project_id,
        latency_ms=row.latency_ms,
        error_message=row.error_message,
        metadata=row.metadata_json or {},
        started_at=row.started_at,
        completed_at=row.completed_at,
        created_at=row.created_at,
    )


async def record_usage(
    db: AsyncSession,
    data: LLMUsageRecordCreate,
) -> LLMUsageRecordResponse:
    """Persist one usage record.

    The caller owns transaction boundaries. FastAPI routes using
    ``get_db_session`` commit after the route returns.
    """
    resolved_org_id = await resolve_usage_organization_id(
        db,
        user_id=data.user_id,
        organization_id=data.organization_id,
    )
    if resolved_org_id != data.organization_id:
        data = data.model_copy(update={"organization_id": resolved_org_id})

    row = build_usage_ledger_row(data)
    db.add(row)
    await db.flush()

    total_tokens = row.total_tokens
    if row.organization_id and total_tokens:
        try:
            await OrganizationService.track_token_usage_async(
                db,
                row.organization_id,
                total_tokens,
                user_id=row.user_id,
                session_id=row.session_id,
                model=row.model,
                commit=False,
                enforce_quota=False,
                record_member_usage=False,
            )
        except Exception:
            logger.warning("llm_usage_org_counter_update_failed", exc_info=True)

    return record_to_response(row)


async def record_usage_best_effort(data: LLMUsageRecordCreate) -> LLMUsageRecordResponse | None:
    """Persist a usage record without letting analytics failures break callers."""
    if os.getenv("USE_DATABASE", "false").lower() != "true":
        return None

    try:
        from db.database import async_session_factory

        async with async_session_factory() as db:
            result = await record_usage(db, data)
            await db.commit()
            return result
    except Exception:
        logger.warning("llm_usage_ledger_record_failed", exc_info=True)
        return None


def _add_metrics(target: LLMUsageBreakdown, record: Any) -> None:
    input_tokens = getattr(record, "input_tokens", None) or 0
    output_tokens = getattr(record, "output_tokens", None) or 0
    total_tokens = getattr(record, "total_tokens", None)
    if total_tokens is None:
        total_tokens = input_tokens + output_tokens
    estimated_cost = getattr(record, "estimated_cost_usd", None) or 0.0

    target.total_requests += 1
    target.total_input_tokens += input_tokens
    target.total_output_tokens += output_tokens
    target.total_tokens += total_tokens
    target.estimated_cost_usd += estimated_cost


def _breakdown_key(record: Any, attr: str, fallback: str = "unknown") -> str:
    value = getattr(record, attr, None)
    if isinstance(value, Enum):
        value = value.value
    if value is None or value == "":
        return fallback
    return str(value)


def _add_to_breakdown(
    breakdown: dict[str, LLMUsageBreakdown],
    key: str,
    record: Any,
) -> None:
    if key not in breakdown:
        breakdown[key] = LLMUsageBreakdown()
    _add_metrics(breakdown[key], record)


def summarize_usage_records(
    records: list[Any],
    period_start: datetime,
    period_end: datetime,
) -> LLMUsageSummaryResponse:
    """Aggregate usage records by common dashboard dimensions."""
    summary = LLMUsageSummaryResponse(period_start=period_start, period_end=period_end)

    for record in records:
        _add_metrics(summary, record)  # type: ignore[arg-type]
        _add_to_breakdown(summary.provider_breakdown, _breakdown_key(record, "provider"), record)
        _add_to_breakdown(summary.source_breakdown, _breakdown_key(record, "source"), record)
        _add_to_breakdown(summary.member_breakdown, _breakdown_key(record, "user_id"), record)
        _add_to_breakdown(
            summary.organization_breakdown,
            _breakdown_key(record, "organization_id"),
            record,
        )
        _add_to_breakdown(summary.mode_breakdown, _breakdown_key(record, "mode"), record)
        _add_to_breakdown(summary.model_breakdown, _breakdown_key(record, "model"), record)
        _add_to_breakdown(summary.status_breakdown, _breakdown_key(record, "status"), record)

    return summary


def _apply_filters(
    stmt,
    *,
    start_time: datetime,
    end_time: datetime,
    provider: str | None = None,
    mode: str | None = None,
    source: str | None = None,
    user_id: str | None = None,
    organization_id: str | None = None,
    project_id: str | None = None,
):
    stmt = stmt.where(
        LLMUsageLedgerModel.started_at >= start_time,
        LLMUsageLedgerModel.started_at <= end_time,
    )
    if provider:
        stmt = stmt.where(LLMUsageLedgerModel.provider == provider)
    if mode:
        stmt = stmt.where(LLMUsageLedgerModel.mode == mode)
    if source:
        stmt = stmt.where(LLMUsageLedgerModel.source == source)
    if user_id:
        stmt = stmt.where(LLMUsageLedgerModel.user_id == user_id)
    if organization_id:
        stmt = stmt.where(LLMUsageLedgerModel.organization_id == organization_id)
    if project_id:
        stmt = stmt.where(LLMUsageLedgerModel.project_id == project_id)
    return stmt


async def list_usage_records(
    db: AsyncSession,
    *,
    start_time: datetime,
    end_time: datetime,
    provider: str | None = None,
    mode: str | None = None,
    source: str | None = None,
    user_id: str | None = None,
    organization_id: str | None = None,
    project_id: str | None = None,
    limit: int = 100,
) -> list[LLMUsageRecordResponse]:
    """List ledger records in reverse chronological order."""
    stmt = select(LLMUsageLedgerModel)
    stmt = _apply_filters(
        stmt,
        start_time=start_time,
        end_time=end_time,
        provider=provider,
        mode=mode,
        source=source,
        user_id=user_id,
        organization_id=organization_id,
        project_id=project_id,
    )
    stmt = stmt.order_by(LLMUsageLedgerModel.started_at.desc()).limit(limit)
    result = await db.execute(stmt)
    return [record_to_response(row) for row in result.scalars().all()]


async def get_usage_summary(
    db: AsyncSession,
    *,
    start_time: datetime,
    end_time: datetime,
    provider: str | None = None,
    mode: str | None = None,
    source: str | None = None,
    user_id: str | None = None,
    organization_id: str | None = None,
    project_id: str | None = None,
) -> LLMUsageSummaryResponse:
    """Query and aggregate ledger records."""
    stmt = select(LLMUsageLedgerModel)
    stmt = _apply_filters(
        stmt,
        start_time=start_time,
        end_time=end_time,
        provider=provider,
        mode=mode,
        source=source,
        user_id=user_id,
        organization_id=organization_id,
        project_id=project_id,
    )
    result = await db.execute(stmt)
    return summarize_usage_records(result.scalars().all(), start_time, end_time)
