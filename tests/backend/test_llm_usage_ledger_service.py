"""Tests for the internal LLM usage ledger service."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from models.llm_usage import (
    LLMRuntimeMode,
    LLMUsageMeasurementMethod,
    LLMUsageRecordCreate,
    LLMUsageSource,
    LLMUsageStatus,
)
from services.llm_usage_ledger_service import (
    LLMUsageQuotaExceededError,
    build_usage_ledger_row,
    enforce_usage_quota_preflight,
    enforce_usage_quota_preflight_best_effort,
    record_usage,
    summarize_usage_records,
)
from utils.time import utcnow


class _FakeScalars:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return _FakeScalars(self._rows)


def _record(**overrides):
    base = {
        "id": "rec-1",
        "user_id": "user-1",
        "organization_id": "org-1",
        "provider": "codex_cli",
        "mode": LLMRuntimeMode.CLI.value,
        "source": LLMUsageSource.PLAYGROUND.value,
        "model": "codex-cli",
        "input_tokens": 100,
        "output_tokens": 50,
        "total_tokens": 150,
        "measurement_method": LLMUsageMeasurementMethod.ESTIMATED.value,
        "estimated_cost_usd": 0.0,
        "status": LLMUsageStatus.SUCCESS.value,
        "session_id": "session-1",
        "task_id": None,
        "analysis_id": None,
        "project_id": "project-1",
        "latency_ms": 1200,
        "error_message": None,
        "metadata_json": {},
        "started_at": datetime(2026, 7, 1, 12, 0, tzinfo=UTC),
        "completed_at": datetime(2026, 7, 1, 12, 0, 1, tzinfo=UTC),
        "created_at": datetime(2026, 7, 1, 12, 0, 1, tzinfo=UTC),
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_summarize_usage_records_groups_by_provider_source_user_mode_and_status() -> None:
    start = datetime(2026, 7, 1, tzinfo=UTC)
    end = start + timedelta(days=1)
    records = [
        _record(id="rec-1", input_tokens=100, output_tokens=50, total_tokens=150),
        _record(
            id="rec-2",
            user_id="user-2",
            source=LLMUsageSource.GIT_DRAFT_COMMIT.value,
            model="codex-cli",
            input_tokens=200,
            output_tokens=100,
            total_tokens=300,
            estimated_cost_usd=0.01,
        ),
    ]

    summary = summarize_usage_records(records, start, end)

    assert summary.total_requests == 2
    assert summary.total_input_tokens == 300
    assert summary.total_output_tokens == 150
    assert summary.total_tokens == 450
    assert summary.estimated_cost_usd == pytest.approx(0.01)
    assert summary.provider_breakdown["codex_cli"].total_tokens == 450
    assert summary.source_breakdown["playground"].total_requests == 1
    assert summary.source_breakdown["git_draft_commit"].total_tokens == 300
    assert summary.member_breakdown["user-1"].total_tokens == 150
    assert summary.member_breakdown["user-2"].estimated_cost_usd == pytest.approx(0.01)
    assert summary.mode_breakdown["cli"].total_requests == 2
    assert summary.status_breakdown["success"].total_requests == 2
    assert summary.model_breakdown["codex-cli"].total_requests == 2


def test_build_usage_ledger_row_derives_total_tokens_when_omitted() -> None:
    started_at = datetime(2026, 7, 1, 12, 0, tzinfo=UTC)
    data = LLMUsageRecordCreate(
        user_id="user-1",
        provider="codex_cli",
        mode=LLMRuntimeMode.CLI,
        source=LLMUsageSource.PLAYGROUND,
        model="codex-cli",
        input_tokens=10,
        output_tokens=15,
        measurement_method=LLMUsageMeasurementMethod.ESTIMATED,
        status=LLMUsageStatus.SUCCESS,
        started_at=started_at,
        metadata={"request_id": "req-1"},
    )

    row = build_usage_ledger_row(data)

    assert row.total_tokens == 25
    assert row.metadata_json == {"request_id": "req-1"}
    assert row.started_at == started_at
    assert row.completed_at is None
    assert row.status == "success"


@pytest.mark.asyncio
async def test_record_usage_resolves_unique_user_org_and_updates_quota_counter() -> None:
    """A ledger write should inherit a user's sole active org and update org counters."""

    async def flush_side_effect():
        db.add.call_args.args[0].created_at = utcnow()

    db = SimpleNamespace(
        add=MagicMock(),
        flush=AsyncMock(side_effect=flush_side_effect),
        execute=AsyncMock(
            return_value=_FakeResult(
                [SimpleNamespace(organization_id="org-1", is_active=True)]
            )
        ),
    )
    data = LLMUsageRecordCreate(
        user_id="user-1",
        provider="codex_cli",
        mode=LLMRuntimeMode.CLI,
        source=LLMUsageSource.PLAYGROUND,
        model="codex-cli",
        input_tokens=120,
        output_tokens=30,
        measurement_method=LLMUsageMeasurementMethod.ESTIMATED,
        status=LLMUsageStatus.SUCCESS,
        session_id="session-1",
    )

    with patch(
        "services.llm_usage_ledger_service.OrganizationService.track_token_usage_async",
        new=AsyncMock(return_value=True),
    ) as track_usage:
        response = await record_usage(db, data)

    assert response.organization_id == "org-1"
    row = db.add.call_args.args[0]
    assert row.organization_id == "org-1"
    assert row.total_tokens == 150
    track_usage.assert_awaited_once_with(
        db,
        "org-1",
        150,
        user_id="user-1",
        session_id="session-1",
        model="codex-cli",
        commit=False,
        enforce_quota=False,
        record_member_usage=False,
    )


@pytest.mark.asyncio
async def test_record_usage_does_not_guess_org_when_user_has_multiple_memberships() -> None:
    """Ambiguous memberships must stay personal/unscoped rather than charging an org."""

    async def flush_side_effect():
        db.add.call_args.args[0].created_at = utcnow()

    db = SimpleNamespace(
        add=MagicMock(),
        flush=AsyncMock(side_effect=flush_side_effect),
        execute=AsyncMock(
            return_value=_FakeResult(
                [
                    SimpleNamespace(organization_id="org-1", is_active=True),
                    SimpleNamespace(organization_id="org-2", is_active=True),
                ]
            )
        ),
    )
    data = LLMUsageRecordCreate(
        user_id="user-1",
        provider="codex_cli",
        mode=LLMRuntimeMode.CLI,
        source=LLMUsageSource.PLAYGROUND,
        model="codex-cli",
        total_tokens=150,
        measurement_method=LLMUsageMeasurementMethod.ESTIMATED,
        status=LLMUsageStatus.SUCCESS,
    )

    with patch(
        "services.llm_usage_ledger_service.OrganizationService.track_token_usage_async",
        new=AsyncMock(return_value=True),
    ) as track_usage:
        response = await record_usage(db, data)

    assert response.organization_id is None
    assert db.add.call_args.args[0].organization_id is None
    track_usage.assert_not_awaited()


@pytest.mark.asyncio
async def test_record_usage_accepts_explicit_org_scope_for_active_member() -> None:
    """A multi-org user can charge the selected org when membership is active."""

    async def flush_side_effect():
        db.add.call_args.args[0].created_at = utcnow()

    db = SimpleNamespace(
        add=MagicMock(),
        flush=AsyncMock(side_effect=flush_side_effect),
        execute=AsyncMock(
            return_value=_FakeResult(
                [SimpleNamespace(organization_id="org-2", is_active=True)]
            )
        ),
    )
    data = LLMUsageRecordCreate(
        user_id="user-1",
        organization_id="org-2",
        provider="codex_cli",
        mode=LLMRuntimeMode.CLI,
        source=LLMUsageSource.PLAYGROUND,
        model="codex-cli",
        total_tokens=150,
        measurement_method=LLMUsageMeasurementMethod.ESTIMATED,
        status=LLMUsageStatus.SUCCESS,
    )

    with patch(
        "services.llm_usage_ledger_service.OrganizationService.track_token_usage_async",
        new=AsyncMock(return_value=True),
    ) as track_usage:
        response = await record_usage(db, data)

    assert response.organization_id == "org-2"
    assert db.add.call_args.args[0].organization_id == "org-2"
    track_usage.assert_awaited_once()
    assert track_usage.await_args.args[1:3] == ("org-2", 150)


@pytest.mark.asyncio
async def test_record_usage_rejects_explicit_org_scope_for_non_member() -> None:
    """An invalid selected org must not be charged to another tenant."""

    async def flush_side_effect():
        db.add.call_args.args[0].created_at = utcnow()

    db = SimpleNamespace(
        add=MagicMock(),
        flush=AsyncMock(side_effect=flush_side_effect),
        execute=AsyncMock(return_value=_FakeResult([])),
    )
    data = LLMUsageRecordCreate(
        user_id="user-1",
        organization_id="org-2",
        provider="codex_cli",
        mode=LLMRuntimeMode.CLI,
        source=LLMUsageSource.PLAYGROUND,
        model="codex-cli",
        total_tokens=150,
        measurement_method=LLMUsageMeasurementMethod.ESTIMATED,
        status=LLMUsageStatus.SUCCESS,
    )

    with patch(
        "services.llm_usage_ledger_service.OrganizationService.track_token_usage_async",
        new=AsyncMock(return_value=True),
    ) as track_usage:
        response = await record_usage(db, data)

    assert response.organization_id is None
    assert db.add.call_args.args[0].organization_id is None
    track_usage.assert_not_awaited()


@pytest.mark.asyncio
async def test_enforce_usage_quota_preflight_allows_with_remaining_quota() -> None:
    db = SimpleNamespace(
        execute=AsyncMock(
            return_value=_FakeResult(
                [SimpleNamespace(organization_id="org-1", is_active=True)]
            )
        ),
    )
    org = SimpleNamespace(
        id="org-1",
        max_tokens_per_month=100,
        tokens_used_this_month=50,
    )

    with patch(
        "services.llm_usage_ledger_service.OrganizationService.get_organization_async",
        new=AsyncMock(return_value=org),
    ) as get_org:
        result = await enforce_usage_quota_preflight(
            db,
            user_id="user-1",
            organization_id="org-1",
            estimated_tokens=25,
        )

    assert result == "org-1"
    get_org.assert_awaited_once_with(db, "org-1")


@pytest.mark.asyncio
async def test_enforce_usage_quota_preflight_raises_when_quota_exceeded() -> None:
    db = SimpleNamespace(
        execute=AsyncMock(
            return_value=_FakeResult(
                [SimpleNamespace(organization_id="org-1", is_active=True)]
            )
        ),
    )
    org = SimpleNamespace(
        id="org-1",
        max_tokens_per_month=100,
        tokens_used_this_month=90,
    )

    with patch(
        "services.llm_usage_ledger_service.OrganizationService.get_organization_async",
        new=AsyncMock(return_value=org),
    ):
        with pytest.raises(LLMUsageQuotaExceededError) as exc_info:
            await enforce_usage_quota_preflight(
                db,
                user_id="user-1",
                organization_id="org-1",
                estimated_tokens=25,
            )

    assert str(exc_info.value) == "Monthly token limit reached (100)"
    assert exc_info.value.organization_id == "org-1"
    assert exc_info.value.requested_tokens == 25


@pytest.mark.asyncio
async def test_enforce_usage_quota_preflight_best_effort_disabled_skips_database(
    monkeypatch,
) -> None:
    monkeypatch.delenv("LLM_USAGE_PREFLIGHT_QUOTA_ENABLED", raising=False)
    monkeypatch.setenv("USE_DATABASE", "true")

    with patch(
        "services.llm_usage_ledger_service.enforce_usage_quota_preflight",
        new=AsyncMock(),
    ) as enforce_preflight:
        result = await enforce_usage_quota_preflight_best_effort(
            user_id="user-1",
            organization_id="org-1",
            estimated_tokens=25,
        )

    assert result is None
    enforce_preflight.assert_not_awaited()


@pytest.mark.asyncio
async def test_enforce_usage_quota_preflight_best_effort_unscoped_skips_database(
    monkeypatch,
) -> None:
    monkeypatch.setenv("LLM_USAGE_PREFLIGHT_QUOTA_ENABLED", "true")
    monkeypatch.setenv("USE_DATABASE", "true")

    with patch(
        "services.llm_usage_ledger_service.enforce_usage_quota_preflight",
        new=AsyncMock(),
    ) as enforce_preflight:
        result = await enforce_usage_quota_preflight_best_effort(
            user_id=None,
            organization_id=None,
            estimated_tokens=25,
        )

    assert result is None
    enforce_preflight.assert_not_awaited()
