"""ExternalUsageService — 수집·집계 오케스트레이션과 싱글턴 홀더.

`_service_instance` 는 `get_external_usage_service` 가 `global` 로
재바인딩하므로 반드시 같은 모듈에 있어야 한다 — 가르면 인스턴스 사본이
분열되고, ruff·mypy·테스트를 모두 통과한 채로 두 개가 살아 있게 된다.
"""

import logging
import os
from datetime import datetime
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import LLMUsageLedgerModel
from models.external_usage import (
    ExternalProvider,
    ExternalUsageSummaryResponse,
    ProviderConfig,
    ProviderHealthStatus,
    UnifiedUsageRecord,
    UsageSummary,
)
from services.deployment_usage_credential_service import resolve_admin_key

from .collectors import (
    AnthropicUsageCollector,
    BaseUsageCollector,
    GitHubCopilotCollector,
    OpenAIUsageCollector,
)
from .summaries import (
    build_reconciliation_summary,
    summarize_claude_snapshot_records,
    summarize_internal_ledger_records,
)

logger = logging.getLogger(__name__)


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
        claude_cli_providers = _LEDGER_PROVIDER_FILTERS[ExternalProvider.CLAUDE_CLI]
        # Claude CLI usage is sourced host-wide from session snapshots
        # (launcher-independent). Drop ledger claude_cli rows so they never
        # double-count against the snapshot summary.
        return [
            row
            for row in result.scalars().all()
            if getattr(row, "provider", None) not in claude_cli_providers
        ]

    async def _collect_claude_snapshots(
        self,
        db: AsyncSession,
        start_time: datetime,
        end_time: datetime,
        providers: list[ExternalProvider] | None,
    ) -> list[Any]:
        """Fetch host-wide Claude session snapshots for the CLAUDE_CLI source.

        Best-effort: returns [] when CLAUDE_CLI is filtered out or on any query
        failure, so snapshot issues never break the primary ledger summary.
        """
        if providers is not None and ExternalProvider.CLAUDE_CLI not in providers:
            return []
        try:
            from db.models.claude_session import ClaudeSessionSnapshotModel

            stmt = select(ClaudeSessionSnapshotModel).where(
                ClaudeSessionSnapshotModel.session_last_activity >= start_time,
                ClaudeSessionSnapshotModel.session_last_activity <= end_time,
            )
            result = await db.execute(stmt)
            return list(result.scalars().all())
        except Exception:
            logger.warning("claude_snapshot_collect_failed", exc_info=True)
            return []

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

        snapshot_rows = await self._collect_claude_snapshots(
            db,
            start_time,
            end_time,
            providers,
        )
        snapshot_records, snapshot_summaries = summarize_claude_snapshot_records(
            snapshot_rows,
            start_time,
            end_time,
        )
        all_records.extend(snapshot_records)
        summaries.extend(snapshot_summaries)

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
                ledger_summaries=ledger_summaries + snapshot_summaries,
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
