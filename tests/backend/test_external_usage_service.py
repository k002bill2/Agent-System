"""Tests for ExternalUsageService — OpenAI usage cost computation."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from models.external_usage import ExternalProvider, UnifiedUsageRecord
from services.external_usage_service import (
    ExternalUsageService,
    OpenAIUsageCollector,
    summarize_claude_snapshot_records,
    summarize_internal_ledger_records,
)

# 이 저장소는 pytest 실행 시 rootdir이 repo 루트로 잡혀 src/backend/pyproject.toml의
# asyncio_mode=auto가 적용되지 않는다(실질 STRICT). 기존 테스트 관례대로 명시적으로 마킹.
pytestmark = pytest.mark.asyncio


def _mock_client(payload: dict, status: int = 200) -> AsyncMock:
    """Build an async-context-manager httpx client mock returning a canned response."""
    mock_response = MagicMock()
    mock_response.status_code = status
    mock_response.json = MagicMock(return_value=payload)

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    return mock_client


def _usage_payload(model: str | None, input_tok: int, output_tok: int) -> dict:
    return {
        "data": [
            {
                "start_time": int(datetime(2026, 6, 1, tzinfo=UTC).timestamp()),
                "results": [
                    {
                        "input_tokens": input_tok,
                        "output_tokens": output_tok,
                        "num_model_requests": 5,
                        "model": model,
                        "user_id": "user-1",
                    }
                ],
            }
        ]
    }


async def test_openai_collect_computes_cost_for_known_model() -> None:
    """Priced models must produce a non-zero cost_usd from the local price table."""
    collector = OpenAIUsageCollector("sk-admin-test")
    with patch(
        "services.external_usage_service.httpx.AsyncClient",
        return_value=_mock_client(_usage_payload("gpt-4o-2024-08-06", 1000, 1000)),
    ):
        records = await collector.collect(
            datetime.now(tz=UTC) - timedelta(days=30), datetime.now(tz=UTC)
        )

    assert len(records) == 1
    rec = records[0]
    # gpt-4o: $0.005/1K input + $0.015/1K output → 0.02 for 1K+1K tokens
    assert rec.cost_usd == pytest.approx(0.02)
    assert rec.model == "gpt-4o-2024-08-06"
    assert rec.input_tokens == 1000


async def test_openai_collect_mini_prefix_matches_before_base() -> None:
    """gpt-4o-mini must match its own (cheaper) price, not gpt-4o."""
    collector = OpenAIUsageCollector("sk-admin-test")
    with patch(
        "services.external_usage_service.httpx.AsyncClient",
        return_value=_mock_client(_usage_payload("gpt-4o-mini-2024-07-18", 1000, 1000)),
    ):
        records = await collector.collect(
            datetime.now(tz=UTC) - timedelta(days=30), datetime.now(tz=UTC)
        )

    # gpt-4o-mini: $0.00015/1K input + $0.0006/1K output → 0.00075
    assert records[0].cost_usd == pytest.approx(0.00075)


async def test_openai_collect_o1_mini_prefix_matches_before_base() -> None:
    """o1-mini must match its own price, not the pricier o1 row above it in the table."""
    collector = OpenAIUsageCollector("sk-admin-test")
    with patch(
        "services.external_usage_service.httpx.AsyncClient",
        return_value=_mock_client(_usage_payload("o1-mini-2024-09-12", 1000, 1000)),
    ):
        records = await collector.collect(
            datetime.now(tz=UTC) - timedelta(days=30), datetime.now(tz=UTC)
        )

    # o1-mini: $0.003/1K input + $0.012/1K output → 0.015 (NOT o1's 0.075)
    assert records[0].cost_usd == pytest.approx(0.015)


async def test_openai_collect_unknown_model_zero_cost() -> None:
    """Unlisted models fall back to zero cost (no fabricated pricing)."""
    collector = OpenAIUsageCollector("sk-admin-test")
    with patch(
        "services.external_usage_service.httpx.AsyncClient",
        return_value=_mock_client(_usage_payload("some-unlisted-model", 1000, 1000)),
    ):
        records = await collector.collect(
            datetime.now(tz=UTC) - timedelta(days=30), datetime.now(tz=UTC)
        )

    assert records[0].cost_usd == 0.0


async def test_openai_collect_none_model_zero_cost() -> None:
    """A missing/None model name must short-circuit to zero cost, not raise."""
    collector = OpenAIUsageCollector("sk-admin-test")
    with patch(
        "services.external_usage_service.httpx.AsyncClient",
        return_value=_mock_client(_usage_payload(None, 1000, 1000)),
    ):
        records = await collector.collect(
            datetime.now(tz=UTC) - timedelta(days=30), datetime.now(tz=UTC)
        )

    assert records[0].cost_usd == 0.0
    assert records[0].model is None


async def test_summarize_internal_ledger_records_maps_cli_usage_to_external_contract() -> None:
    """External Usage summary should be able to render internal CLI ledger rows."""
    start = datetime(2026, 7, 1, tzinfo=UTC)
    end = datetime(2026, 7, 2, tzinfo=UTC)
    row = SimpleNamespace(
        id="ledger-1",
        provider="codex_cli",
        mode="cli",
        source="playground",
        model="gpt-5",
        input_tokens=100,
        output_tokens=50,
        total_tokens=150,
        estimated_cost_usd=0.0,
        status="success",
        measurement_method="cli_metadata",
        user_id="user-1",
        organization_id="org-1",
        project_id="project-1",
        started_at=start,
    )

    records, summaries = summarize_internal_ledger_records([row], start, end)

    assert len(records) == 1
    assert records[0].provider == ExternalProvider.CODEX_CLI
    assert records[0].input_tokens == 100
    assert records[0].output_tokens == 50
    assert records[0].request_count == 1
    assert records[0].raw_data["source"] == "playground"
    assert records[0].raw_data["mode"] == "cli"

    assert len(summaries) == 1
    assert summaries[0].provider == ExternalProvider.CODEX_CLI
    assert summaries[0].total_input_tokens == 100
    assert summaries[0].total_output_tokens == 50
    assert summaries[0].total_requests == 1
    assert summaries[0].model_breakdown["gpt-5"] == 0.0


async def test_get_summary_includes_reconciliation_totals(monkeypatch) -> None:
    """External Usage summary should expose ledger-vs-provider reconciliation metadata."""
    start = datetime(2026, 7, 1, tzinfo=UTC)
    end = datetime(2026, 7, 2, tzinfo=UTC)
    row = SimpleNamespace(
        id="ledger-1",
        provider="codex_cli",
        mode="cli",
        source="task_analyzer_execution",
        model="gpt-5",
        input_tokens=123,
        output_tokens=45,
        total_tokens=168,
        estimated_cost_usd=0.0123,
        status="success",
        measurement_method="cli_metadata",
        user_id="user-1",
        organization_id="org-1",
        project_id="project-1",
        started_at=start,
    )
    result = MagicMock()
    result.scalars.return_value.all.return_value = [row]
    db = AsyncMock()
    db.execute.return_value = result

    monkeypatch.setenv("EXTERNAL_USAGE_INCLUDE_PROVIDER_BILLING", "false")

    # Isolate the ledger path: the global db.execute mock would otherwise feed
    # the same row into the snapshot collector too. Snapshots are covered by
    # their own tests.
    with patch.object(
        ExternalUsageService,
        "_collect_claude_snapshots",
        AsyncMock(return_value=[]),
        create=True,
    ):
        response = await ExternalUsageService().get_summary(db, start, end)

    assert response.reconciliation is not None
    assert response.reconciliation.primary_source == "internal_ledger"
    assert response.reconciliation.provider_billing_enabled is False
    assert response.reconciliation.internal_total_tokens == 168
    assert response.reconciliation.internal_total_requests == 1
    assert response.reconciliation.internal_total_cost_usd == pytest.approx(0.0123)
    assert response.reconciliation.provider_billing_total_tokens == 0
    assert response.reconciliation.comparisons[0].provider == ExternalProvider.CODEX_CLI
    assert response.reconciliation.comparisons[0].status == "ledger_only"


async def test_get_summary_does_not_double_count_provider_billing(monkeypatch) -> None:
    """Provider billing measures the SAME usage as the internal ledger a second
    way, so it must feed reconciliation only — never the primary summaries /
    records / total (regression: double-count when billing is enabled)."""
    start = datetime(2026, 7, 1, tzinfo=UTC)
    end = datetime(2026, 7, 2, tzinfo=UTC)
    ledger_row = SimpleNamespace(
        id="ledger-1",
        provider="openai",
        mode="api",
        source="agent",
        model="gpt-5",
        input_tokens=100,
        output_tokens=0,
        total_tokens=100,
        estimated_cost_usd=1.0,
        status="success",
        measurement_method="api",
        user_id="user-1",
        organization_id="org-1",
        project_id="project-1",
        started_at=start,
    )
    result = MagicMock()
    result.scalars.return_value.all.return_value = [ledger_row]
    db = AsyncMock()
    db.execute.return_value = result

    # Provider billing reports the same OpenAI usage a second way.
    billing_record = UnifiedUsageRecord(
        id="billing-1",
        provider=ExternalProvider.OPENAI,
        timestamp=start,
        input_tokens=100,
        output_tokens=0,
        total_tokens=100,
        cost_usd=1.0,
        request_count=1,
        model="gpt-5",
        user_id="user-1",
    )
    collector = AsyncMock()
    collector.collect = AsyncMock(return_value=[billing_record])

    monkeypatch.setenv("EXTERNAL_USAGE_INCLUDE_PROVIDER_BILLING", "true")

    with (
        patch.object(
            ExternalUsageService,
            "_build_collectors",
            AsyncMock(return_value={ExternalProvider.OPENAI: collector}),
        ),
        patch.object(
            ExternalUsageService,
            "_collect_claude_snapshots",
            AsyncMock(return_value=[]),
            create=True,
        ),
    ):
        response = await ExternalUsageService().get_summary(db, start, end)

    # Primary total reflects the ledger only — not ledger (1.0) + billing (1.0).
    assert response.total_cost_usd == pytest.approx(1.0)
    openai_summaries = [s for s in response.providers if s.provider == ExternalProvider.OPENAI]
    assert len(openai_summaries) == 1
    assert openai_summaries[0].total_cost_usd == pytest.approx(1.0)
    # The records feed (re-aggregated by the dashboard) holds only the ledger row.
    assert len(response.records) == 1
    assert response.records[0].raw_data["ledger_id"] == "ledger-1"
    # Billing still reaches the UI, but via reconciliation only.
    assert response.reconciliation.provider_billing_enabled is True
    assert response.reconciliation.provider_billing_total_cost_usd == pytest.approx(1.0)


async def test_summarize_claude_snapshot_records_aggregates_host_usage() -> None:
    """Claude session snapshots should map onto the CLAUDE_CLI external contract."""
    start = datetime(2026, 7, 1, tzinfo=UTC)
    end = datetime(2026, 7, 31, tzinfo=UTC)
    rows = [
        SimpleNamespace(
            id="sess-1",
            model="claude-sonnet-4",
            total_input_tokens=1000,
            total_output_tokens=200,
            estimated_cost=0.5,
            project_name="aos",
            source_user="younghwan",
            session_last_activity=datetime(2026, 7, 5, tzinfo=UTC),
        ),
        SimpleNamespace(
            id="sess-2",
            model="claude-sonnet-4",
            total_input_tokens=300,
            total_output_tokens=100,
            estimated_cost=0.25,
            project_name="other",
            source_user="younghwan",
            session_last_activity=datetime(2026, 7, 6, tzinfo=UTC),
        ),
    ]

    records, summaries = summarize_claude_snapshot_records(rows, start, end)

    assert len(records) == 2
    assert records[0].provider == ExternalProvider.CLAUDE_CLI
    assert records[0].input_tokens == 1000
    assert records[0].output_tokens == 200
    assert records[0].total_tokens == 1200
    assert records[0].request_count == 1
    assert records[0].cost_usd == pytest.approx(0.5)
    assert records[0].raw_data["snapshot_id"] == "sess-1"

    assert len(summaries) == 1
    summary = summaries[0]
    assert summary.provider == ExternalProvider.CLAUDE_CLI
    assert summary.total_input_tokens == 1300
    assert summary.total_output_tokens == 300
    assert summary.total_requests == 2
    assert summary.total_cost_usd == pytest.approx(0.75)
    assert summary.model_breakdown["claude-sonnet-4"] == pytest.approx(0.75)


async def test_summarize_claude_snapshot_records_empty_returns_no_summary() -> None:
    """No snapshots must yield no CLAUDE_CLI summary (card stays absent, not zeroed)."""
    start = datetime(2026, 7, 1, tzinfo=UTC)
    end = datetime(2026, 7, 31, tzinfo=UTC)

    records, summaries = summarize_claude_snapshot_records([], start, end)

    assert records == []
    assert summaries == []


async def test_get_summary_excludes_claude_cli_ledger_rows(monkeypatch) -> None:
    """claude_cli ledger rows must NOT feed CLAUDE_CLI summary — snapshots are the
    single source of truth, so ledger claude_cli would double-count (regression)."""
    start = datetime(2026, 7, 1, tzinfo=UTC)
    end = datetime(2026, 7, 31, tzinfo=UTC)
    claude_ledger_row = SimpleNamespace(
        id="ledger-claude-1",
        provider="claude_cli",
        mode="cli",
        source="task_analyzer_execution",
        model="claude-code-cli",
        input_tokens=999,
        output_tokens=999,
        total_tokens=1998,
        estimated_cost_usd=9.99,
        status="success",
        measurement_method="cli_metadata",
        user_id=None,
        organization_id=None,
        project_id=None,
        started_at=start,
    )
    result = MagicMock()
    result.scalars.return_value.all.return_value = [claude_ledger_row]
    db = AsyncMock()
    db.execute.return_value = result

    monkeypatch.setenv("EXTERNAL_USAGE_INCLUDE_PROVIDER_BILLING", "false")

    # Snapshots collected separately; return empty so we isolate the ledger guard.
    with patch.object(
        ExternalUsageService,
        "_collect_claude_snapshots",
        AsyncMock(return_value=[]),
        create=True,
    ):
        response = await ExternalUsageService().get_summary(db, start, end)

    # No CLAUDE_CLI summary from the ledger row, and its tokens are not in the total.
    claude_summaries = [s for s in response.providers if s.provider == ExternalProvider.CLAUDE_CLI]
    assert claude_summaries == []
    assert response.reconciliation.internal_total_tokens == 0
    assert all(r.provider != ExternalProvider.CLAUDE_CLI for r in response.records)


async def test_get_summary_includes_claude_snapshot_usage(monkeypatch) -> None:
    """Snapshots must surface as CLAUDE_CLI tokens in the card and the total."""
    start = datetime(2026, 7, 1, tzinfo=UTC)
    end = datetime(2026, 7, 31, tzinfo=UTC)
    # Ledger returns nothing; snapshots carry the Claude usage.
    ledger_result = MagicMock()
    ledger_result.scalars.return_value.all.return_value = []
    db = AsyncMock()
    db.execute.return_value = ledger_result

    snapshot_row = SimpleNamespace(
        id="sess-1",
        model="claude-sonnet-4",
        total_input_tokens=1000,
        total_output_tokens=200,
        estimated_cost=0.5,
        project_name="aos",
        source_user="younghwan",
        session_last_activity=datetime(2026, 7, 5, tzinfo=UTC),
    )

    monkeypatch.setenv("EXTERNAL_USAGE_INCLUDE_PROVIDER_BILLING", "false")

    with patch.object(
        ExternalUsageService,
        "_collect_claude_snapshots",
        AsyncMock(return_value=[snapshot_row]),
    ):
        response = await ExternalUsageService().get_summary(db, start, end)

    claude = [s for s in response.providers if s.provider == ExternalProvider.CLAUDE_CLI]
    assert len(claude) == 1
    assert claude[0].total_input_tokens == 1000
    assert claude[0].total_output_tokens == 200
    assert claude[0].total_cost_usd == pytest.approx(0.5)
    assert response.total_cost_usd == pytest.approx(0.5)
    assert response.reconciliation.internal_total_tokens == 1200
    claude_records = [r for r in response.records if r.provider == ExternalProvider.CLAUDE_CLI]
    assert len(claude_records) == 1


async def test_collect_claude_snapshots_respects_provider_filter() -> None:
    """When providers is restricted and excludes CLAUDE_CLI, skip the snapshot query."""
    start = datetime(2026, 7, 1, tzinfo=UTC)
    end = datetime(2026, 7, 31, tzinfo=UTC)
    db = AsyncMock()

    rows = await ExternalUsageService()._collect_claude_snapshots(
        db, start, end, [ExternalProvider.CODEX_CLI]
    )

    assert rows == []
    db.execute.assert_not_awaited()
