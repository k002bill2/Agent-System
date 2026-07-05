"""External LLM usage monitoring service."""

from __future__ import annotations

import os
import uuid
from abc import ABC, abstractmethod
from datetime import UTC, datetime
from typing import Any

import httpx
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import LLMUsageLedgerModel
from models.external_usage import (
    ExternalProvider,
    ExternalUsageSummaryResponse,
    ProviderConfig,
    ProviderHealthStatus,
    UnifiedUsageRecord,
    UsageReconciliationComparison,
    UsageReconciliationSummary,
    UsageSummary,
)
from services.deployment_usage_credential_service import resolve_admin_key

_PROVIDER_ALIASES: dict[str, ExternalProvider] = {
    "google": ExternalProvider.GOOGLE_GEMINI,
    "google_gemini": ExternalProvider.GOOGLE_GEMINI,
}

_LEDGER_PROVIDER_FILTERS: dict[ExternalProvider, set[str]] = {
    ExternalProvider.CODEX_CLI: {"codex_cli"},
    ExternalProvider.CLAUDE_CLI: {"claude_cli"},
    ExternalProvider.OPENAI: {"openai"},
    ExternalProvider.ANTHROPIC: {"anthropic"},
    ExternalProvider.GOOGLE: {"google", "google_gemini"},
    ExternalProvider.GOOGLE_GEMINI: {"google", "google_gemini"},
    ExternalProvider.OLLAMA: {"ollama"},
}


def _bool_env(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


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


class BaseUsageCollector(ABC):
    """Abstract base for external LLM usage collectors."""

    @abstractmethod
    async def collect(self, start_time: datetime, end_time: datetime) -> list[UnifiedUsageRecord]:
        """Collect usage records for the given period."""
        ...

    @abstractmethod
    async def health_check(self) -> ProviderHealthStatus:
        """Check provider connectivity."""
        ...

    @abstractmethod
    def get_provider(self) -> ExternalProvider: ...


class OpenAIUsageCollector(BaseUsageCollector):
    """Collects usage from OpenAI Organization Usage API."""

    BASE_URL = "https://api.openai.com/v1"

    # Per-1K-token USD pricing (input, output), prefix-matched most-specific first
    # so "gpt-4o-mini" wins over "gpt-4o". The org usage endpoint returns token
    # counts only (no cost), so we price locally — same approach as
    # AnthropicUsageCollector. Mirrors api/llm_proxy.py COST_TABLE; unlisted
    # models fall back to $0 rather than fabricating a price.
    _COST_TABLE: tuple[tuple[str, float, float], ...] = (
        ("gpt-4o-mini", 0.00015, 0.0006),
        ("gpt-4o", 0.005, 0.015),
        ("o1-mini", 0.003, 0.012),
        ("o1", 0.015, 0.060),
    )

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    @classmethod
    def _calc_cost(cls, model: str | None, input_tokens: int, output_tokens: int) -> float:
        """Estimate USD cost from the local price table; 0.0 for unlisted models."""
        if not model:
            return 0.0
        for prefix, cost_in, cost_out in cls._COST_TABLE:
            if model.startswith(prefix):
                return (input_tokens / 1000) * cost_in + (output_tokens / 1000) * cost_out
        return 0.0

    def get_provider(self) -> ExternalProvider:
        return ExternalProvider.OPENAI

    async def health_check(self) -> ProviderHealthStatus:
        import time

        start = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{self.BASE_URL}/models",
                    headers={"Authorization": f"Bearer {self._api_key}"},
                )
                latency = (time.monotonic() - start) * 1000
                if resp.status_code == 200:
                    return ProviderHealthStatus(
                        provider=ExternalProvider.OPENAI,
                        is_healthy=True,
                        latency_ms=latency,
                    )
                return ProviderHealthStatus(
                    provider=ExternalProvider.OPENAI,
                    is_healthy=False,
                    error_message=f"HTTP {resp.status_code}",
                )
        except Exception as e:
            return ProviderHealthStatus(
                provider=ExternalProvider.OPENAI,
                is_healthy=False,
                error_message=str(e),
            )

    async def collect(self, start_time: datetime, end_time: datetime) -> list[UnifiedUsageRecord]:
        records: list[UnifiedUsageRecord] = []
        try:
            start_ts = int(start_time.timestamp())
            end_ts = int(end_time.timestamp())

            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{self.BASE_URL}/organization/usage/completions",
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    params={
                        "start_time": start_ts,
                        "end_time": end_ts,
                        "bucket_width": "1d",
                        "group_by[]": ["model", "user_id"],
                        "limit": 180,
                    },
                )
                if resp.status_code != 200:
                    return records

                data = resp.json()
                for bucket in data.get("data", []):
                    ts = datetime.fromtimestamp(bucket.get("start_time", 0), tz=UTC)
                    for result in bucket.get("results", []):
                        input_tok = result.get("input_tokens", 0) or 0
                        output_tok = result.get("output_tokens", 0) or 0
                        model = result.get("model")
                        records.append(
                            UnifiedUsageRecord(
                                provider=ExternalProvider.OPENAI,
                                timestamp=ts,
                                bucket_width="1d",
                                input_tokens=input_tok,
                                output_tokens=output_tok,
                                total_tokens=input_tok + output_tok,
                                cost_usd=self._calc_cost(model, input_tok, output_tok),
                                request_count=result.get("num_model_requests", 0) or 0,
                                model=model,
                                user_id=result.get("user_id"),
                                raw_data=result,
                            )
                        )
        except Exception:
            pass
        return records


class GitHubCopilotCollector(BaseUsageCollector):
    """Collects metrics from GitHub Copilot Metrics API."""

    BASE_URL = "https://api.github.com"

    def __init__(self, token: str, org: str) -> None:
        self._token = token
        self._org = org

    def get_provider(self) -> ExternalProvider:
        return ExternalProvider.GITHUB_COPILOT

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    async def health_check(self) -> ProviderHealthStatus:
        import time

        start = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{self.BASE_URL}/orgs/{self._org}/copilot/metrics",
                    headers=self._headers(),
                )
                latency = (time.monotonic() - start) * 1000
                if resp.status_code in (200, 404):
                    return ProviderHealthStatus(
                        provider=ExternalProvider.GITHUB_COPILOT,
                        is_healthy=True,
                        latency_ms=latency,
                    )
                return ProviderHealthStatus(
                    provider=ExternalProvider.GITHUB_COPILOT,
                    is_healthy=False,
                    error_message=f"HTTP {resp.status_code}: {resp.text[:200]}",
                )
        except Exception as e:
            return ProviderHealthStatus(
                provider=ExternalProvider.GITHUB_COPILOT,
                is_healthy=False,
                error_message=str(e),
            )

    async def collect(self, start_time: datetime, end_time: datetime) -> list[UnifiedUsageRecord]:
        records: list[UnifiedUsageRecord] = []
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{self.BASE_URL}/orgs/{self._org}/copilot/metrics",
                    headers=self._headers(),
                    params={
                        "since": start_time.strftime("%Y-%m-%d"),
                        "until": end_time.strftime("%Y-%m-%d"),
                    },
                )
                if resp.status_code != 200:
                    return records

                for day_data in resp.json():
                    date_str = day_data.get("date", "")
                    try:
                        ts = datetime.fromisoformat(date_str).replace(tzinfo=UTC)
                    except ValueError:
                        continue

                    ide_completions = day_data.get("copilot_ide_code_completions") or {}
                    suggestions = ide_completions.get("total_code_suggestions", 0) or 0
                    acceptances = ide_completions.get("total_code_acceptances", 0) or 0
                    rate = (acceptances / suggestions) if suggestions > 0 else None

                    records.append(
                        UnifiedUsageRecord(
                            provider=ExternalProvider.GITHUB_COPILOT,
                            timestamp=ts,
                            bucket_width="1d",
                            request_count=day_data.get("total_active_users", 0) or 0,
                            code_suggestions=suggestions,
                            code_acceptances=acceptances,
                            acceptance_rate=rate,
                            raw_data=day_data,
                        )
                    )
        except Exception:
            pass
        return records


class AnthropicUsageCollector(BaseUsageCollector):
    """Collects usage from Anthropic Usage Report API."""

    BASE_URL = "https://api.anthropic.com/v1"

    def __init__(self, admin_key: str) -> None:
        self._admin_key = admin_key

    def get_provider(self) -> ExternalProvider:
        return ExternalProvider.ANTHROPIC

    async def health_check(self) -> ProviderHealthStatus:
        import time

        t0 = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{self.BASE_URL}/models",
                    headers={
                        "x-api-key": self._admin_key,
                        "anthropic-version": "2023-06-01",
                    },
                )
                latency = (time.monotonic() - t0) * 1000
                if resp.status_code == 200:
                    return ProviderHealthStatus(
                        provider=ExternalProvider.ANTHROPIC,
                        is_healthy=True,
                        latency_ms=latency,
                    )
                return ProviderHealthStatus(
                    provider=ExternalProvider.ANTHROPIC,
                    is_healthy=False,
                    error_message=f"HTTP {resp.status_code}",
                )
        except Exception as e:
            return ProviderHealthStatus(
                provider=ExternalProvider.ANTHROPIC,
                is_healthy=False,
                error_message=str(e),
            )

    async def collect(self, start_time: datetime, end_time: datetime) -> list[UnifiedUsageRecord]:
        """Collect from Anthropic Usage Report API."""
        records: list[UnifiedUsageRecord] = []

        costs: dict[str, tuple[float, float]] = {
            "claude-opus-4": (0.015, 0.075),
            "claude-sonnet-4": (0.003, 0.015),
            "claude-haiku-4": (0.00025, 0.00125),
        }

        async with httpx.AsyncClient(timeout=30) as client:
            params: dict = {
                "starting_at": start_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "ending_at": end_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "bucket_width": "1d",
                "limit": 100,
            }
            resp = await client.get(
                f"{self.BASE_URL}/organizations/usage_report/messages",
                headers={
                    "x-api-key": self._admin_key,
                    "anthropic-version": "2023-06-01",
                },
                params=params,
            )

            if resp.status_code != 200:
                return records

            data = resp.json()
            for bucket in data.get("data", []):
                bucket_end_str = bucket.get("bucket_end_time", "")
                try:
                    bucket_end = datetime.fromisoformat(bucket_end_str.replace("Z", "+00:00"))
                except ValueError:
                    continue

                for item in bucket.get("items", []):
                    model = item.get("model", "unknown")
                    input_tok = item.get("input_tokens", 0)
                    output_tok = item.get("output_tokens", 0)
                    cost = 0.0
                    for prefix, (ci, co) in costs.items():
                        if model.startswith(prefix):
                            cost = (input_tok / 1000) * ci + (output_tok / 1000) * co
                            break
                    records.append(
                        UnifiedUsageRecord(
                            provider=ExternalProvider.ANTHROPIC,
                            timestamp=bucket_end,
                            bucket_width="1d",
                            input_tokens=input_tok,
                            output_tokens=output_tok,
                            total_tokens=input_tok + output_tok,
                            cost_usd=cost,
                            request_count=item.get("num_requests", 0),
                            model=model,
                            raw_data=item,
                        )
                    )

        return records


class ExternalUsageService:
    """Orchestrates usage collection from multiple external providers."""

    def __init__(self) -> None:
        self._proxy_records: list[UnifiedUsageRecord] = []

    async def _build_collectors(
        self, db: AsyncSession
    ) -> dict[ExternalProvider, BaseUsageCollector]:
        """Build per-request collectors from resolved deployment usage keys.

        Keys resolve via ``resolve_admin_key`` (active DB row > ``EXTERNAL_*`` env).
        GitHub's token is DB-overridable; its org stays env-only.
        """
        collectors: dict[ExternalProvider, BaseUsageCollector] = {}

        openai_key = await resolve_admin_key(db, ExternalProvider.OPENAI)
        if openai_key:
            collectors[ExternalProvider.OPENAI] = OpenAIUsageCollector(openai_key)

        gh_token = await resolve_admin_key(db, ExternalProvider.GITHUB_COPILOT)
        gh_org = os.getenv("EXTERNAL_GITHUB_ORG")
        if gh_token and gh_org:
            collectors[ExternalProvider.GITHUB_COPILOT] = GitHubCopilotCollector(gh_token, gh_org)

        anthropic_key = await resolve_admin_key(db, ExternalProvider.ANTHROPIC)
        if anthropic_key:
            collectors[ExternalProvider.ANTHROPIC] = AnthropicUsageCollector(anthropic_key)

        return collectors

    def add_record(self, record: UnifiedUsageRecord) -> None:
        """Add a proxy-collected record to in-memory store."""
        self._proxy_records.append(record)

    @staticmethod
    def _mask_key(key: str) -> str:
        if len(key) <= 8:
            return "***"
        return key[:8] + "..."

    async def _collect_internal_ledger_records(
        self,
        db: AsyncSession,
        start_time: datetime,
        end_time: datetime,
        providers: list[ExternalProvider] | None,
    ) -> list[LLMUsageLedgerModel]:
        stmt = select(LLMUsageLedgerModel).where(
            LLMUsageLedgerModel.started_at >= start_time,
            LLMUsageLedgerModel.started_at <= end_time,
        )

        if providers:
            provider_values: set[str] = set()
            mode_values: set[str] = set()
            for provider in providers:
                provider_values.update(_LEDGER_PROVIDER_FILTERS.get(provider, {provider.value}))
                if provider == ExternalProvider.INTERNAL_CLI:
                    mode_values.add("cli")
                elif provider == ExternalProvider.INTERNAL_API:
                    mode_values.add("api")

            clauses = []
            if provider_values:
                clauses.append(LLMUsageLedgerModel.provider.in_(provider_values))
            if mode_values:
                clauses.append(LLMUsageLedgerModel.mode.in_(mode_values))
            if clauses:
                stmt = stmt.where(or_(*clauses))

        result = await db.execute(stmt.order_by(LLMUsageLedgerModel.started_at.desc()))
        return list(result.scalars().all())

    async def get_summary(
        self,
        db: AsyncSession,
        start_time: datetime,
        end_time: datetime,
        providers: list[ExternalProvider] | None = None,
    ) -> ExternalUsageSummaryResponse:
        all_records: list[UnifiedUsageRecord] = []
        summaries: list[UsageSummary] = []
        provider_billing_records: list[UnifiedUsageRecord] = []
        provider_billing_summaries: list[UsageSummary] = []

        ledger_rows = await self._collect_internal_ledger_records(
            db,
            start_time,
            end_time,
            providers,
        )
        ledger_records, ledger_summaries = summarize_internal_ledger_records(
            ledger_rows,
            start_time,
            end_time,
        )
        all_records.extend(ledger_records)
        summaries.extend(ledger_summaries)

        provider_billing_enabled = _bool_env(
            "EXTERNAL_USAGE_INCLUDE_PROVIDER_BILLING", default=False
        )
        if provider_billing_enabled:
            collectors = await self._build_collectors(db)
            target_collectors = {
                p: c for p, c in collectors.items() if providers is None or p in providers
            }

            for provider, collector in target_collectors.items():
                try:
                    records = await collector.collect(start_time, end_time)
                    # Provider billing measures the SAME usage as the internal
                    # ledger a second way. It must not enter the primary
                    # summaries/records/total (that would double-count); it
                    # reaches the UI only via `reconciliation` below.
                    provider_billing_records.extend(records)

                    summary = UsageSummary(
                        provider=provider,
                        period_start=start_time,
                        period_end=end_time,
                    )
                    for rec in records:
                        summary.total_input_tokens += rec.input_tokens
                        summary.total_output_tokens += rec.output_tokens
                        summary.total_cost_usd += rec.cost_usd
                        summary.total_requests += rec.request_count
                        if rec.model:
                            summary.model_breakdown[rec.model] = (
                                summary.model_breakdown.get(rec.model, 0.0) + rec.cost_usd
                            )
                        if rec.user_id:
                            summary.member_breakdown[rec.user_id] = (
                                summary.member_breakdown.get(rec.user_id, 0.0) + rec.cost_usd
                            )
                    provider_billing_summaries.append(summary)
                except Exception:
                    continue

        # Legacy fallback for deployments without the DB ledger enabled.
        if not ledger_records:
            filtered_proxy = [
                r for r in self._proxy_records if start_time <= r.timestamp <= end_time
            ]
            all_records.extend(filtered_proxy)

        total_cost = sum(s.total_cost_usd for s in summaries)
        return ExternalUsageSummaryResponse(
            providers=summaries,
            total_cost_usd=total_cost,
            records=all_records,
            period_start=start_time,
            period_end=end_time,
            reconciliation=build_reconciliation_summary(
                ledger_summaries=ledger_summaries,
                provider_billing_summaries=provider_billing_summaries,
                provider_billing_enabled=provider_billing_enabled,
                provider_billing_record_count=len(provider_billing_records),
            ),
        )

    async def get_provider_health(self, db: AsyncSession) -> list[ProviderHealthStatus]:
        statuses: list[ProviderHealthStatus] = []
        collectors = await self._build_collectors(db)
        for collector in collectors.values():
            try:
                status = await collector.health_check()
                statuses.append(status)
            except Exception as e:
                statuses.append(
                    ProviderHealthStatus(
                        provider=collector.get_provider(),
                        is_healthy=False,
                        error_message=str(e),
                    )
                )
        return statuses

    async def get_configured_providers(self, db: AsyncSession) -> list[ProviderConfig]:
        configs: list[ProviderConfig] = []

        openai_key = await resolve_admin_key(db, ExternalProvider.OPENAI)
        configs.append(
            ProviderConfig(
                provider=ExternalProvider.OPENAI,
                enabled=bool(openai_key),
                api_key_masked=self._mask_key(openai_key) if openai_key else None,
            )
        )

        gh_token = await resolve_admin_key(db, ExternalProvider.GITHUB_COPILOT)
        gh_org = os.getenv("EXTERNAL_GITHUB_ORG")
        # Collection needs BOTH token and org (see _build_collectors), so the
        # badge must reflect both — a token alone would show "configured" while
        # collection silently skips.
        configs.append(
            ProviderConfig(
                provider=ExternalProvider.GITHUB_COPILOT,
                enabled=bool(gh_token and gh_org),
                api_key_masked=self._mask_key(gh_token) if gh_token else None,
                org_id=gh_org,
            )
        )

        configs.append(
            ProviderConfig(
                provider=ExternalProvider.GOOGLE_GEMINI,
                enabled=False,
            )
        )

        anthropic_key = await resolve_admin_key(db, ExternalProvider.ANTHROPIC)
        configs.append(
            ProviderConfig(
                provider=ExternalProvider.ANTHROPIC,
                enabled=bool(anthropic_key),
                api_key_masked=self._mask_key(anthropic_key) if anthropic_key else None,
            )
        )
        return configs


_service_instance: ExternalUsageService | None = None


def get_external_usage_service() -> ExternalUsageService:
    """Return singleton ExternalUsageService."""
    global _service_instance
    if _service_instance is None:
        _service_instance = ExternalUsageService()
    return _service_instance
