"""내부 ledger·Claude 스냅샷 집계와 provider 대조 리포트.

순수 함수만 둔다 — 외부 I/O 도 모듈 상태도 없다.
"""

import uuid
from datetime import datetime
from typing import Any

from models.claude_session import PRICE_SOURCE_FALLBACK, resolve_model_price
from models.external_usage import (
    ExternalProvider,
    UnifiedUsageRecord,
    UsageCoverage,
    UsageReconciliationComparison,
    UsageReconciliationSummary,
    UsageSourceCoverage,
    UsageSummary,
)

COLLECTION_SOURCE_LEDGER = "internal_ledger"
COLLECTION_SOURCE_SNAPSHOT = "claude_session_snapshot"
COLLECTION_SOURCE_PROVIDER_BILLING = "provider_billing"
COLLECTION_SOURCE_PROXY = "proxy"

# Each collection source measures a different population. The note is rendered
# verbatim so the two dashboard cards are not read as one comparable total.
_SOURCE_TRAITS: dict[str, tuple[str, str | None]] = {
    COLLECTION_SOURCE_LEDGER: (
        "event",
        "AOS 내부 호출 ledger — 호스트 전역 Codex 사용량이 아님",
    ),
    COLLECTION_SOURCE_SNAPSHOT: (
        "session_last_activity",
        "호스트 Claude 세션 스냅샷 — 요청 단위는 세션",
    ),
    COLLECTION_SOURCE_PROVIDER_BILLING: (
        "event",
        "provider 청구 API — 내부 ledger 와 같은 사용을 두 번째로 측정한 값",
    ),
    COLLECTION_SOURCE_PROXY: ("event", "AOS LLM 프록시 인메모리 레코드"),
}

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


def resolve_cost_state(known: int, unknown: int) -> str:
    """Roll per-record cost measurement into a summary-level state.

    Fail-closed: with no records at all the answer is "unknown", not "known".
    """
    if known and unknown:
        return "partial"
    if known:
        return "known"
    return "unknown"


def _finalize_cost_state(summary: UsageSummary) -> UsageSummary:
    summary.cost_state = resolve_cost_state(
        summary.known_cost_requests, summary.unknown_cost_requests
    )
    return summary


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
        # Decide the state from the RAW value: `or 0.0` collapses None into 0.0
        # and would make an unmeasured row indistinguishable from a free one.
        raw_cost = getattr(record, "estimated_cost_usd", None)
        cost_state = "unknown" if raw_cost is None else "known"
        cost_usd = raw_cost or 0.0  # existing numeric contract unchanged
        measurement_method = getattr(record, "measurement_method", None)
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
                cost_state=cost_state,
                collection_source=COLLECTION_SOURCE_LEDGER,
                measurement_method=measurement_method,
                date_basis="event",
                # `raw_data["measurement_method"]` stays for older consumers; the
                # top-level field above is the canonical one going forward.
                raw_data={
                    "ledger_id": getattr(record, "id", None),
                    "source": getattr(record, "source", None),
                    "mode": getattr(record, "mode", None),
                    "status": getattr(record, "status", None),
                    "measurement_method": measurement_method,
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
                collection_source=COLLECTION_SOURCE_LEDGER,
                request_unit="ledger_record",
            ),
        )
        summary.total_input_tokens += input_tokens
        summary.total_output_tokens += output_tokens
        summary.total_cost_usd += cost_usd
        summary.total_requests += 1
        if cost_state == "known":
            summary.known_cost_requests += 1
        else:
            summary.unknown_cost_requests += 1
        if not user_id:
            summary.unattributed_member_requests += 1
        if model:
            summary.model_breakdown[model] = summary.model_breakdown.get(model, 0.0) + cost_usd
        if user_id:
            summary.member_breakdown[user_id] = (
                summary.member_breakdown.get(user_id, 0.0) + cost_usd
            )

    return external_records, [
        _finalize_cost_state(summary) for summary in summaries_by_provider.values()
    ]


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
        raw_cost = getattr(row, "estimated_cost", None)
        cost_state = "unknown" if raw_cost is None else "known"
        cost_usd = raw_cost or 0.0
        timestamp = getattr(row, "session_last_activity", None) or start_time
        model = getattr(row, "model", None)
        # The snapshot table does not persist `price_source`, so re-derive it from
        # the stored model with the same lookup the session monitor priced with.
        # A fallback rate keeps its amount (numeric contract unchanged) but is
        # counted separately so it is never presented as a registered price.
        price_source = resolve_model_price(model or "")[1] if raw_cost is not None else None
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
                cost_state=cost_state,
                collection_source=COLLECTION_SOURCE_SNAPSHOT,
                measurement_method="session_transcript",
                price_source=price_source,
                # Snapshots carry a whole session's totals stamped at its last
                # activity, so this is not a per-event date.
                date_basis="session_last_activity",
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
                collection_source=COLLECTION_SOURCE_SNAPSHOT,
                request_unit="session",
                # The snapshot table has no cache columns: not collected, not zero.
                cache_read_tokens=None,
                cache_creation_tokens=None,
            )
        summary.total_input_tokens += input_tokens
        summary.total_output_tokens += output_tokens
        summary.total_cost_usd += cost_usd
        summary.total_requests += 1
        if cost_state == "known":
            summary.known_cost_requests += 1
        else:
            summary.unknown_cost_requests += 1
        if price_source == PRICE_SOURCE_FALLBACK:
            summary.fallback_priced_requests += 1
        # Snapshots come from host OS sessions; mapping `source_user` onto an
        # authenticated user_id is explicitly out of scope, so every snapshot
        # request is member-unattributed.
        summary.unattributed_member_requests += 1
        if model:
            summary.model_breakdown[model] = summary.model_breakdown.get(model, 0.0) + cost_usd

    return external_records, ([_finalize_cost_state(summary)] if summary is not None else [])


def summarize_proxy_records_for_coverage(
    records: list[UnifiedUsageRecord],
    start_time: datetime,
    end_time: datetime,
) -> list[UsageSummary]:
    """Roll legacy proxy fallback records into per-provider summaries for `coverage`.

    Coverage only: the proxy fallback has never fed `providers` or the cost
    total, and this does not change that — it just keeps the collection path
    from disappearing out of the provenance report.
    """
    by_provider: dict[ExternalProvider, UsageSummary] = {}
    for record in records:
        summary = by_provider.setdefault(
            record.provider,
            UsageSummary(
                provider=record.provider,
                period_start=start_time,
                period_end=end_time,
                collection_source=COLLECTION_SOURCE_PROXY,
            ),
        )
        summary.total_requests += record.request_count
        if record.cost_state == "known":
            summary.known_cost_requests += record.request_count
        else:
            summary.unknown_cost_requests += record.request_count
    return [_finalize_cost_state(summary) for summary in by_provider.values()]


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


def build_usage_coverage(
    summaries: list[UsageSummary],
    start_time: datetime,
    end_time: datetime,
) -> UsageCoverage:
    """Describe what each collection source actually covered for this window.

    One entry per (collection_source, provider) pair. Two entries with different
    `request_unit` values are a signal that their totals are not comparable —
    a Codex ledger record and a Claude session are not the same "request".
    """
    by_key: dict[tuple[str, ExternalProvider], UsageSourceCoverage] = {}
    # Roll the raw counters, then derive `cost_state` once. Merging the derived
    # states pairwise instead would let "known" + "unknown" resolve to "known".
    counters: dict[tuple[str, ExternalProvider], tuple[int, int]] = {}

    for summary in summaries:
        key = (summary.collection_source, summary.provider)
        date_basis, note = _SOURCE_TRAITS.get(summary.collection_source, ("event", None))
        source = by_key.get(key)
        if source is None:
            source = UsageSourceCoverage(
                collection_source=summary.collection_source,
                provider=summary.provider,
                request_unit=summary.request_unit,
                date_basis=date_basis,
                note=note,
            )
            by_key[key] = source
            counters[key] = (0, 0)
        source.record_count += summary.total_requests
        known, unknown = counters[key]
        counters[key] = (
            known + summary.known_cost_requests,
            unknown + summary.unknown_cost_requests,
        )

    for key, source in by_key.items():
        source.cost_state = resolve_cost_state(*counters[key])

    return UsageCoverage(
        requested_start=start_time,
        requested_end=end_time,
        period_days=max((end_time - start_time).days, 0),
        sources=list(by_key.values()),
    )
