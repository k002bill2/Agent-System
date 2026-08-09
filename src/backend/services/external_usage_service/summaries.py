"""내부 ledger·Claude 스냅샷 집계와 provider 대조 리포트.

순수 함수만 둔다 — 외부 I/O 도 모듈 상태도 없다.
"""

import uuid
from datetime import datetime
from typing import Any

from models.external_usage import (
    ExternalProvider,
    UnifiedUsageRecord,
    UsageReconciliationComparison,
    UsageReconciliationSummary,
    UsageSummary,
)

_PROVIDER_ALIASES: dict[str, ExternalProvider] = {
    "google": ExternalProvider.GOOGLE_GEMINI,
    "google_gemini": ExternalProvider.GOOGLE_GEMINI,
}


def _ledger_external_provider(provider: str | None, mode: str | None) -> ExternalProvider:
    normalized = (provider or "").lower()
    if normalized in _PROVIDER_ALIASES:
        return _PROVIDER_ALIASES[normalized]
    try:
        return ExternalProvider(normalized)
    except ValueError:
        if mode == "cli":
            return ExternalProvider.INTERNAL_CLI
        if mode == "local":
            return ExternalProvider.OLLAMA
        return ExternalProvider.INTERNAL_API


def _record_tokens(record: Any) -> tuple[int, int, int]:
    input_tokens = getattr(record, "input_tokens", None) or 0
    output_tokens = getattr(record, "output_tokens", None) or 0
    total_tokens = getattr(record, "total_tokens", None)
    if total_tokens is None:
        total_tokens = input_tokens + output_tokens
    return input_tokens, output_tokens, total_tokens


def summarize_internal_ledger_records(
    records: list[Any],
    start_time: datetime,
    end_time: datetime,
) -> tuple[list[UnifiedUsageRecord], list[UsageSummary]]:
    """Map internal LLM ledger rows onto the legacy External Usage contract."""
    external_records: list[UnifiedUsageRecord] = []
    summaries_by_provider: dict[ExternalProvider, UsageSummary] = {}

    for record in records:
        provider = _ledger_external_provider(
            getattr(record, "provider", None),
            getattr(record, "mode", None),
        )
        input_tokens, output_tokens, total_tokens = _record_tokens(record)
        cost_usd = getattr(record, "estimated_cost_usd", None) or 0.0
        timestamp = getattr(record, "started_at", None) or start_time
        model = getattr(record, "model", None)
        user_id = getattr(record, "user_id", None)
        record_id = getattr(record, "id", None) or str(uuid.uuid4())

        external_records.append(
            UnifiedUsageRecord(
                id=str(record_id),
                provider=provider,
                timestamp=timestamp,
                bucket_width="event",
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
                cost_usd=cost_usd,
                request_count=1,
                model=model,
                user_id=user_id,
                project_id=getattr(record, "project_id", None),
                raw_data={
                    "ledger_id": getattr(record, "id", None),
                    "source": getattr(record, "source", None),
                    "mode": getattr(record, "mode", None),
                    "status": getattr(record, "status", None),
                    "measurement_method": getattr(record, "measurement_method", None),
                    "organization_id": getattr(record, "organization_id", None),
                },
            )
        )

        summary = summaries_by_provider.setdefault(
            provider,
            UsageSummary(
                provider=provider,
                period_start=start_time,
                period_end=end_time,
            ),
        )
        summary.total_input_tokens += input_tokens
        summary.total_output_tokens += output_tokens
        summary.total_cost_usd += cost_usd
        summary.total_requests += 1
        if model:
            summary.model_breakdown[model] = summary.model_breakdown.get(model, 0.0) + cost_usd
        if user_id:
            summary.member_breakdown[user_id] = (
                summary.member_breakdown.get(user_id, 0.0) + cost_usd
            )

    return external_records, list(summaries_by_provider.values())


def summarize_claude_snapshot_records(
    rows: list[Any],
    start_time: datetime,
    end_time: datetime,
) -> tuple[list[UnifiedUsageRecord], list[UsageSummary]]:
    """Map Claude session snapshot rows onto the CLAUDE_CLI External Usage contract.

    Snapshots are the host-wide, launcher-independent source of truth for
    Claude CLI usage (cmux/tmux/iterm all leave transcripts that the session
    monitor already aggregates). One snapshot == one session == one request.
    """
    external_records: list[UnifiedUsageRecord] = []
    summary: UsageSummary | None = None

    for row in rows:
        input_tokens = getattr(row, "total_input_tokens", None) or 0
        output_tokens = getattr(row, "total_output_tokens", None) or 0
        cost_usd = getattr(row, "estimated_cost", None) or 0.0
        timestamp = getattr(row, "session_last_activity", None) or start_time
        model = getattr(row, "model", None)
        record_id = getattr(row, "id", None) or str(uuid.uuid4())

        external_records.append(
            UnifiedUsageRecord(
                id=str(record_id),
                provider=ExternalProvider.CLAUDE_CLI,
                timestamp=timestamp,
                bucket_width="event",
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=input_tokens + output_tokens,
                cost_usd=cost_usd,
                request_count=1,
                model=model,
                raw_data={
                    "snapshot_id": getattr(row, "id", None),
                    "project_name": getattr(row, "project_name", None),
                    "source_user": getattr(row, "source_user", None),
                },
            )
        )

        if summary is None:
            summary = UsageSummary(
                provider=ExternalProvider.CLAUDE_CLI,
                period_start=start_time,
                period_end=end_time,
            )
        summary.total_input_tokens += input_tokens
        summary.total_output_tokens += output_tokens
        summary.total_cost_usd += cost_usd
        summary.total_requests += 1
        if model:
            summary.model_breakdown[model] = summary.model_breakdown.get(model, 0.0) + cost_usd

    return external_records, ([summary] if summary is not None else [])


def _summary_tokens(summary: UsageSummary | None) -> int:
    if summary is None:
        return 0
    return summary.total_input_tokens + summary.total_output_tokens


def _merge_summaries(summaries: list[UsageSummary]) -> dict[ExternalProvider, UsageSummary]:
    merged: dict[ExternalProvider, UsageSummary] = {}
    for summary in summaries:
        target = merged.setdefault(
            summary.provider,
            UsageSummary(
                provider=summary.provider,
                period_start=summary.period_start,
                period_end=summary.period_end,
            ),
        )
        target.total_input_tokens += summary.total_input_tokens
        target.total_output_tokens += summary.total_output_tokens
        target.total_cost_usd += summary.total_cost_usd
        target.total_requests += summary.total_requests
        for model, cost in summary.model_breakdown.items():
            target.model_breakdown[model] = target.model_breakdown.get(model, 0.0) + cost
        for member, cost in summary.member_breakdown.items():
            target.member_breakdown[member] = target.member_breakdown.get(member, 0.0) + cost
    return merged


def _comparison_status(
    *,
    provider_billing_enabled: bool,
    internal_tokens: int,
    internal_requests: int,
    provider_tokens: int,
    provider_requests: int,
) -> str:
    has_internal = internal_tokens > 0 or internal_requests > 0
    has_provider = provider_tokens > 0 or provider_requests > 0
    if has_internal and has_provider:
        return "compared"
    if has_internal:
        return "ledger_only"
    if has_provider:
        return "provider_only"
    return "not_collected" if provider_billing_enabled else "provider_billing_disabled"


def build_reconciliation_summary(
    *,
    ledger_summaries: list[UsageSummary],
    provider_billing_summaries: list[UsageSummary],
    provider_billing_enabled: bool,
    provider_billing_record_count: int,
) -> UsageReconciliationSummary:
    """Build read-only comparison metadata without changing the primary summary."""
    ledger_by_provider = _merge_summaries(ledger_summaries)
    provider_by_provider = _merge_summaries(provider_billing_summaries)
    provider_keys = sorted(
        set(ledger_by_provider) | set(provider_by_provider),
        key=lambda provider: provider.value,
    )

    comparisons: list[UsageReconciliationComparison] = []
    for provider in provider_keys:
        internal_summary = ledger_by_provider.get(provider)
        provider_summary = provider_by_provider.get(provider)
        internal_tokens = _summary_tokens(internal_summary)
        provider_tokens = _summary_tokens(provider_summary)
        internal_cost = internal_summary.total_cost_usd if internal_summary else 0.0
        provider_cost = provider_summary.total_cost_usd if provider_summary else 0.0
        internal_requests = internal_summary.total_requests if internal_summary else 0
        provider_requests = provider_summary.total_requests if provider_summary else 0

        comparisons.append(
            UsageReconciliationComparison(
                provider=provider,
                internal_total_tokens=internal_tokens,
                internal_total_cost_usd=internal_cost,
                internal_total_requests=internal_requests,
                provider_billing_total_tokens=provider_tokens,
                provider_billing_total_cost_usd=provider_cost,
                provider_billing_total_requests=provider_requests,
                delta_tokens=provider_tokens - internal_tokens,
                delta_cost_usd=provider_cost - internal_cost,
                status=_comparison_status(
                    provider_billing_enabled=provider_billing_enabled,
                    internal_tokens=internal_tokens,
                    internal_requests=internal_requests,
                    provider_tokens=provider_tokens,
                    provider_requests=provider_requests,
                ),
            )
        )

    return UsageReconciliationSummary(
        primary_source="internal_ledger",
        provider_billing_enabled=provider_billing_enabled,
        internal_total_tokens=sum(_summary_tokens(summary) for summary in ledger_summaries),
        internal_total_cost_usd=sum(summary.total_cost_usd for summary in ledger_summaries),
        internal_total_requests=sum(summary.total_requests for summary in ledger_summaries),
        provider_billing_total_tokens=sum(
            _summary_tokens(summary) for summary in provider_billing_summaries
        ),
        provider_billing_total_cost_usd=sum(
            summary.total_cost_usd for summary in provider_billing_summaries
        ),
        provider_billing_total_requests=sum(
            summary.total_requests for summary in provider_billing_summaries
        ),
        provider_billing_record_count=provider_billing_record_count,
        comparisons=comparisons,
    )
