"""Tests for ExternalUsageService — OpenAI usage cost computation."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from models.external_usage import ExternalProvider
from services.external_usage_service import (
    ExternalUsageService,
    OpenAIUsageCollector,
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
        provider="claude_cli",
        mode="cli",
        source="task_analyzer_execution",
        model="claude-code-cli",
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

    response = await ExternalUsageService().get_summary(db, start, end)

    assert response.reconciliation is not None
    assert response.reconciliation.primary_source == "internal_ledger"
    assert response.reconciliation.provider_billing_enabled is False
    assert response.reconciliation.internal_total_tokens == 168
    assert response.reconciliation.internal_total_requests == 1
    assert response.reconciliation.internal_total_cost_usd == pytest.approx(0.0123)
    assert response.reconciliation.provider_billing_total_tokens == 0
    assert response.reconciliation.comparisons[0].provider == ExternalProvider.CLAUDE_CLI
    assert response.reconciliation.comparisons[0].status == "ledger_only"
