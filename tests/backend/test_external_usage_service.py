"""Tests for ExternalUsageService — OpenAI usage cost computation."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from models.external_usage import ExternalProvider, UnifiedUsageRecord
from services.external_usage_service import (
    AnthropicUsageCollector,
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
        "services.external_usage_service.collectors.httpx.AsyncClient",
        return_value=_mock_client(_usage_payload("gpt-4o-2024-08-06", 1000, 1000)),
    ):
        records = await collector.collect(
            datetime.now(tz=UTC) - timedelta(days=30), datetime.now(tz=UTC)
        )

    assert len(records) == 1
    rec = records[0]
    # gpt-4o: $0.0025/1K input + $0.010/1K output → 0.0125 for 1K+1K tokens
    # ($5/$15 는 gpt-4o-2024-05-13 스냅샷 전용 단가다)
    assert rec.cost_usd == pytest.approx(0.0125)
    assert rec.model == "gpt-4o-2024-08-06"
    assert rec.input_tokens == 1000


async def test_openai_collect_mini_prefix_matches_before_base() -> None:
    """gpt-4o-mini must match its own (cheaper) price, not gpt-4o."""
    collector = OpenAIUsageCollector("sk-admin-test")
    with patch(
        "services.external_usage_service.collectors.httpx.AsyncClient",
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
        "services.external_usage_service.collectors.httpx.AsyncClient",
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
        "services.external_usage_service.collectors.httpx.AsyncClient",
        return_value=_mock_client(_usage_payload("some-unlisted-model", 1000, 1000)),
    ):
        records = await collector.collect(
            datetime.now(tz=UTC) - timedelta(days=30), datetime.now(tz=UTC)
        )

    assert records[0].cost_usd == 0.0


def _anthropic_usage_payload(model: str, input_tok: int, output_tok: int) -> dict:
    return {
        "data": [
            {
                "bucket_end_time": "2026-06-01T00:00:00Z",
                "items": [
                    {
                        "model": model,
                        "input_tokens": input_tok,
                        "output_tokens": output_tok,
                        "num_requests": 5,
                    }
                ],
            }
        ]
    }


async def test_anthropic_collect_opus_4_6_matches_post_price_cut_row() -> None:
    """Opus 4.5+ price cut: opus-4-6 must hit $5/$25, not generic claude-opus-4 ($15/$75)."""
    collector = AnthropicUsageCollector("sk-ant-admin-test")
    with patch(
        "services.external_usage_service.collectors.httpx.AsyncClient",
        return_value=_mock_client(_anthropic_usage_payload("claude-opus-4-6", 1000, 1000)),
    ):
        records = await collector.collect(
            datetime.now(tz=UTC) - timedelta(days=30), datetime.now(tz=UTC)
        )

    assert len(records) == 1
    assert records[0].cost_usd == pytest.approx(0.005 + 0.025)


async def test_anthropic_collect_opus_4_1_keeps_legacy_price() -> None:
    """Opus 4.1 predates the price cut: must fall through to claude-opus-4 ($15/$75)."""
    collector = AnthropicUsageCollector("sk-ant-admin-test")
    with patch(
        "services.external_usage_service.collectors.httpx.AsyncClient",
        return_value=_mock_client(_anthropic_usage_payload("claude-opus-4-1", 1000, 1000)),
    ):
        records = await collector.collect(
            datetime.now(tz=UTC) - timedelta(days=30), datetime.now(tz=UTC)
        )

    assert len(records) == 1
    assert records[0].cost_usd == pytest.approx(0.015 + 0.075)


async def test_openai_collect_none_model_zero_cost() -> None:
    """A missing/None model name must short-circuit to zero cost, not raise."""
    collector = OpenAIUsageCollector("sk-admin-test")
    with patch(
        "services.external_usage_service.collectors.httpx.AsyncClient",
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


# ---------------------------------------------------------------------------
# 감사 §2/§3: unknown cost ≠ zero cost, 그리고 수집 provenance/coverage
# ---------------------------------------------------------------------------


def _ledger_row(
    *,
    cost: float | None,
    provider: str = "codex_cli",
    model: str = "gpt-5-codex",
    user_id: str | None = "user-1",
    input_tokens: int = 100,
    output_tokens: int = 50,
) -> SimpleNamespace:
    return SimpleNamespace(
        id="ledger-1",
        provider=provider,
        mode="cli",
        model=model,
        user_id=user_id,
        project_id=None,
        organization_id=None,
        source="cli",
        status="success",
        measurement_method="cli_reported",
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=input_tokens + output_tokens,
        estimated_cost_usd=cost,
        started_at=datetime(2026, 6, 1, tzinfo=UTC),
    )


def _snapshot_row(*, cost: float | None, model: str = "claude-opus-4-8") -> SimpleNamespace:
    return SimpleNamespace(
        id="snap-1",
        model=model,
        project_name="demo",
        source_user="tester",
        total_input_tokens=10,
        total_output_tokens=20,
        estimated_cost=cost,
        session_last_activity=datetime(2026, 6, 1, tzinfo=UTC),
    )


_WINDOW = (datetime(2026, 5, 1, tzinfo=UTC), datetime(2026, 6, 30, tzinfo=UTC))


async def test_ledger_null_cost_is_unknown_not_zero() -> None:
    """`estimated_cost_usd=None` 은 `cost_state="unknown"` 으로 보존된다 (감사 §2)."""
    records, summaries = summarize_internal_ledger_records([_ledger_row(cost=None)], *_WINDOW)

    assert records[0].cost_state == "unknown"
    assert records[0].cost_usd == 0.0  # 기존 숫자 계약 불변
    assert summaries[0].cost_state == "unknown"
    assert summaries[0].unknown_cost_requests == 1
    assert summaries[0].known_cost_requests == 0


async def test_ledger_measured_zero_cost_is_known() -> None:
    """측정된 0 과 미측정 0 이 API 에서 구분된다."""
    records, summaries = summarize_internal_ledger_records([_ledger_row(cost=0.0)], *_WINDOW)

    assert records[0].cost_state == "known"
    assert records[0].cost_usd == 0.0
    assert summaries[0].cost_state == "known"
    assert summaries[0].known_cost_requests == 1
    assert summaries[0].unknown_cost_requests == 0


async def test_ledger_mixed_cost_state_is_partial() -> None:
    _, summaries = summarize_internal_ledger_records(
        [_ledger_row(cost=None), _ledger_row(cost=0.25)], *_WINDOW
    )

    assert summaries[0].cost_state == "partial"
    assert summaries[0].known_cost_requests == 1
    assert summaries[0].unknown_cost_requests == 1


async def test_all_null_codex_sample_reports_unknown_cost_state() -> None:
    """감사 표본(16건 전부 NULL) 재현 — 합계 $0.00 이 '무료'로 읽히지 않는다."""
    rows = [_ledger_row(cost=None) for _ in range(16)]

    _, summaries = summarize_internal_ledger_records(rows, *_WINDOW)

    assert summaries[0].total_cost_usd == 0.0
    assert summaries[0].cost_state == "unknown"
    assert summaries[0].unknown_cost_requests == 16


async def test_ledger_records_carry_collection_provenance() -> None:
    records, summaries = summarize_internal_ledger_records([_ledger_row(cost=1.0)], *_WINDOW)

    assert records[0].collection_source == "internal_ledger"
    assert records[0].measurement_method == "cli_reported"
    assert records[0].date_basis == "event"
    # raw_data 의 기존 키는 구버전 소비자를 위해 그대로 남는다.
    assert records[0].raw_data["measurement_method"] == "cli_reported"
    assert summaries[0].collection_source == "internal_ledger"
    assert summaries[0].request_unit == "ledger_record"


async def test_ledger_counts_unattributed_member_requests() -> None:
    _, summaries = summarize_internal_ledger_records(
        [_ledger_row(cost=1.0, user_id=None), _ledger_row(cost=1.0, user_id="user-1")],
        *_WINDOW,
    )

    assert summaries[0].unattributed_member_requests == 1


async def test_snapshot_null_cost_is_unknown_and_unit_is_session() -> None:
    records, summaries = summarize_claude_snapshot_records([_snapshot_row(cost=None)], *_WINDOW)

    assert records[0].cost_state == "unknown"
    assert records[0].collection_source == "claude_session_snapshot"
    assert records[0].measurement_method == "session_transcript"
    assert records[0].date_basis == "session_last_activity"
    assert summaries[0].request_unit == "session"
    assert summaries[0].cost_state == "unknown"
    # 스냅샷 테이블에 cache 컬럼이 없다 → 0 이 아니라 '미수집'.
    assert summaries[0].cache_read_tokens is None
    assert summaries[0].cache_creation_tokens is None
    assert summaries[0].unattributed_member_requests == 1


async def test_summary_response_exposes_coverage_per_source_and_provider() -> None:
    """`coverage.sources` 가 (collection_source, provider) 쌍별로 1건씩 존재한다 (감사 §3)."""
    service = ExternalUsageService()
    ledger_rows = [_ledger_row(cost=None)]
    snapshot_rows = [_snapshot_row(cost=0.5)]

    with (
        patch.object(
            ExternalUsageService,
            "_collect_internal_ledger_records",
            AsyncMock(return_value=ledger_rows),
        ),
        patch.object(
            ExternalUsageService,
            "_collect_claude_snapshots",
            AsyncMock(return_value=snapshot_rows),
        ),
    ):
        response = await service.get_summary(MagicMock(), *_WINDOW)

    assert response.coverage is not None
    assert response.coverage.period_days == 60
    by_key = {(s.collection_source, s.provider.value): s for s in response.coverage.sources}
    assert ("internal_ledger", "codex_cli") in by_key
    assert ("claude_session_snapshot", "claude_cli") in by_key
    assert by_key[("internal_ledger", "codex_cli")].request_unit == "ledger_record"
    assert by_key[("claude_session_snapshot", "claude_cli")].request_unit == "session"
    assert by_key[("internal_ledger", "codex_cli")].cost_state == "unknown"
    assert by_key[("internal_ledger", "codex_cli")].note
    assert by_key[("claude_session_snapshot", "claude_cli")].date_basis == ("session_last_activity")


async def test_summary_coverage_includes_proxy_fallback_records() -> None:
    """ledger 가 비어 proxy 레코드로 폴백하면 coverage 에도 proxy 경로가 나타난다."""
    service = ExternalUsageService()
    service.add_record(
        UnifiedUsageRecord(
            provider=ExternalProvider.ANTHROPIC,
            timestamp=datetime(2026, 6, 1, tzinfo=UTC),
            request_count=3,
        )
    )

    with (
        patch.object(
            ExternalUsageService, "_collect_internal_ledger_records", AsyncMock(return_value=[])
        ),
        patch.object(ExternalUsageService, "_collect_claude_snapshots", AsyncMock(return_value=[])),
    ):
        response = await service.get_summary(MagicMock(), *_WINDOW)

    assert [r.collection_source for r in response.records] == ["proxy"]
    assert response.coverage is not None
    by_key = {(s.collection_source, s.provider.value): s for s in response.coverage.sources}
    proxy = by_key[("proxy", "anthropic")]
    assert proxy.record_count == 3
    assert proxy.cost_state == "unknown"
    assert proxy.note


async def test_openai_collector_marks_priced_records_known() -> None:
    """provider billing 경로도 cost_state 를 명시한다 (기본값 unknown 에 기대지 않는다)."""
    collector = OpenAIUsageCollector("sk-admin-test")
    with patch(
        "services.external_usage_service.collectors.httpx.AsyncClient",
        return_value=_mock_client(_usage_payload("gpt-4o-2024-08-06", 1000, 1000)),
    ):
        records = await collector.collect(*_WINDOW)

    assert records[0].cost_state == "known"
    assert records[0].price_source == "table"
    assert records[0].collection_source == "provider_billing"


async def test_openai_collector_marks_unpriced_model_unknown() -> None:
    """가격표에 없는 모델은 `$0.00` 이 아니라 '미가격'으로 표면화된다 (감사 §6)."""
    collector = OpenAIUsageCollector("sk-admin-test")
    with patch(
        "services.external_usage_service.collectors.httpx.AsyncClient",
        return_value=_mock_client(_usage_payload("some-unlisted-model", 1000, 1000)),
    ):
        records = await collector.collect(*_WINDOW)

    assert records[0].cost_usd == 0.0
    assert records[0].cost_state == "unknown"
    assert records[0].price_source == "unpriced"


async def test_summarize_claude_snapshot_records_flags_fallback_priced_sessions() -> None:
    """단가표 미등재 모델의 추정 비용은 금액을 유지하되 기본 단가임을 표면화한다."""
    start = datetime(2026, 7, 1, tzinfo=UTC)
    end = datetime(2026, 7, 31, tzinfo=UTC)
    rows = [
        SimpleNamespace(
            id="registered",
            model="claude-opus-4-8",
            total_input_tokens=10,
            total_output_tokens=10,
            estimated_cost=0.1,
            session_last_activity=datetime(2026, 7, 5, tzinfo=UTC),
        ),
        SimpleNamespace(
            id="unregistered",
            model="claude-unregistered-test-model",
            total_input_tokens=10,
            total_output_tokens=10,
            estimated_cost=0.2,
            session_last_activity=datetime(2026, 7, 6, tzinfo=UTC),
        ),
    ]

    records, summaries = summarize_claude_snapshot_records(rows, start, end)

    by_id = {r.id: r for r in records}
    assert by_id["registered"].price_source == "table"
    assert by_id["unregistered"].price_source == "fallback"
    # 금액은 그대로 합산된다 (기존 숫자 계약 유지).
    assert by_id["unregistered"].cost_usd == pytest.approx(0.2)
    assert summaries[0].total_cost_usd == pytest.approx(0.3)
    assert summaries[0].fallback_priced_requests == 1
