"""Tests for LLM access profile and entitlement service helpers."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from models.llm_access import LLMCLIProfileCreate, LLMEntitlementCreate
from services.llm_access_service import (
    DEFAULT_CODEX_PROFILE_ID,
    CLIHealthProbeResult,
    apply_cli_profile_health_result,
    build_cli_profile_row,
    build_entitlement_row,
    check_cli_profile_health,
    cli_profile_to_response,
    default_access_response,
    delete_cli_profile,
    entitlement_to_response,
)


def test_default_access_response_is_cli_first(monkeypatch) -> None:
    monkeypatch.setenv("CODEX_CLI_COMMAND", "codex")
    monkeypatch.setenv("CODEX_CLI_ARGS", "exec --sandbox read-only --color never")
    monkeypatch.delenv("LLM_API_FALLBACK_ENABLED", raising=False)

    response = default_access_response("user-1")

    assert response.api_fallback_enabled is False
    assert response.profiles[0].provider == "codex_cli"
    assert response.profiles[0].command == "codex"
    assert response.profiles[0].args_json == ["exec", "--sandbox", "read-only", "--color", "never"]
    assert response.entitlements[0].user_id == "user-1"
    assert response.entitlements[0].provider == "codex_cli"
    assert response.entitlements[0].mode == "cli"
    assert response.entitlements[0].enabled is True
    assert response.entitlements[0].allow_api_fallback is False


def test_build_cli_profile_row_from_create_contract() -> None:
    data = LLMCLIProfileCreate(
        provider="codex_cli",
        profile_name="Team Codex",
        command="codex",
        args_json=["exec", "--color", "never"],
        organization_id="org-1",
        auth_status="connected",
        metadata={"mount": "/home/aos/.codex"},
    )

    row = build_cli_profile_row(data, owner_user_id="user-1")

    assert row.owner_user_id == "user-1"
    assert row.organization_id == "org-1"
    assert row.provider == "codex_cli"
    assert row.profile_name == "Team Codex"
    assert row.args_json == ["exec", "--color", "never"]
    assert row.metadata_json == {"mount": "/home/aos/.codex"}


def test_build_cli_profile_row_allows_org_shared_profile() -> None:
    data = LLMCLIProfileCreate(
        provider="codex_cli",
        profile_name="Shared Codex",
        command="codex",
        organization_id="org-1",
    )

    row = build_cli_profile_row(data)

    assert row.owner_user_id is None
    assert row.organization_id == "org-1"


def test_build_entitlement_row_from_create_contract() -> None:
    data = LLMEntitlementCreate(
        user_id="user-1",
        organization_id="org-1",
        provider="codex_cli",
        mode="cli",
        source_scope="playground",
        cli_profile_id="profile-1",
        enabled=True,
        allow_api_fallback=False,
    )

    row = build_entitlement_row(data)

    assert row.user_id == "user-1"
    assert row.organization_id == "org-1"
    assert row.provider == "codex_cli"
    assert row.mode == "cli"
    assert row.source_scope == "playground"
    assert row.cli_profile_id == "profile-1"
    assert row.allow_api_fallback is False


def test_row_converters_preserve_response_contract() -> None:
    now = datetime(2026, 7, 2, 12, 0, tzinfo=UTC)
    profile = SimpleNamespace(
        id="profile-1",
        owner_user_id="user-1",
        organization_id=None,
        provider="codex_cli",
        profile_name="Default",
        command="codex",
        args_json=["exec"],
        working_directory=None,
        auth_status="unknown",
        metadata_json={"source": "test"},
        created_at=now,
        updated_at=now,
    )
    entitlement = SimpleNamespace(
        id="ent-1",
        user_id="user-1",
        organization_id=None,
        provider="codex_cli",
        mode="cli",
        source_scope="all",
        enabled=True,
        cli_profile_id="profile-1",
        allow_api_fallback=False,
        quota_policy_id=None,
        created_at=now,
        updated_at=now,
    )

    profile_response = cli_profile_to_response(profile)
    entitlement_response = entitlement_to_response(entitlement)

    assert profile_response.id == "profile-1"
    assert profile_response.metadata == {"source": "test"}
    assert entitlement_response.id == "ent-1"
    assert entitlement_response.cli_profile_id == "profile-1"


def test_apply_cli_profile_health_result_preserves_existing_metadata() -> None:
    checked_at = datetime(2026, 7, 2, 12, 0, tzinfo=UTC)
    row = SimpleNamespace(
        auth_status="unknown",
        metadata_json={"sandbox_preset": "workspace-write"},
    )
    result = CLIHealthProbeResult(
        auth_status="connected",
        command_found=True,
        exit_code=0,
        latency_ms=12,
        message="codex 1.2.3",
        checked_at=checked_at,
    )

    apply_cli_profile_health_result(row, result)

    assert row.auth_status == "connected"
    assert row.metadata_json["sandbox_preset"] == "workspace-write"
    assert row.metadata_json["health_check"] == {
        "auth_status": "connected",
        "command_found": True,
        "exit_code": 0,
        "latency_ms": 12,
        "message": "codex 1.2.3",
        "checked_at": checked_at.isoformat(),
    }


class _FakeScalarResult:
    def __init__(self, row) -> None:
        self.row = row

    def scalar_one_or_none(self):
        return self.row


class _FakeDb:
    def __init__(self, row) -> None:
        self.row = row
        self.executed = False
        self.flushed = False

    async def execute(self, _stmt):
        self.executed = True
        return _FakeScalarResult(self.row)

    async def flush(self) -> None:
        self.flushed = True


class _FakeListResult:
    def __init__(self, rows) -> None:
        self.rows = rows

    def scalars(self):
        return self

    def all(self):
        return self.rows


class _FakeSequenceDb:
    def __init__(self, results) -> None:
        self.results = list(results)
        self.deleted = None
        self.flushed = False

    async def execute(self, _stmt):
        return self.results.pop(0)

    async def delete(self, row) -> None:
        self.deleted = row

    async def flush(self) -> None:
        self.flushed = True


@pytest.mark.asyncio
async def test_delete_cli_profile_removes_profile_and_unassigns_entitlements() -> None:
    profile = SimpleNamespace(id="profile-1")
    entitlement = SimpleNamespace(cli_profile_id="profile-1", updated_at=None)
    db = _FakeSequenceDb([
        _FakeScalarResult(profile),
        _FakeListResult([entitlement]),
    ])

    deleted = await delete_cli_profile(db, "profile-1")

    assert deleted is True
    assert db.deleted is profile
    assert db.flushed is True
    assert entitlement.cli_profile_id is None
    assert entitlement.updated_at is not None


@pytest.mark.asyncio
async def test_delete_cli_profile_returns_false_for_missing_profile() -> None:
    db = _FakeSequenceDb([_FakeScalarResult(None)])

    deleted = await delete_cli_profile(db, "missing-profile")

    assert deleted is False
    assert db.deleted is None
    assert db.flushed is False


@pytest.mark.asyncio
async def test_check_cli_profile_health_updates_persisted_profile() -> None:
    now = datetime(2026, 7, 2, 12, 0, tzinfo=UTC)
    row = SimpleNamespace(
        id="profile-1",
        owner_user_id="user-1",
        organization_id=None,
        provider="codex_cli",
        profile_name="Default",
        command="codex",
        args_json=["exec"],
        working_directory=None,
        auth_status="unknown",
        metadata_json={},
        created_at=now,
        updated_at=now,
    )

    async def fake_runner(_profile):
        return CLIHealthProbeResult(
            auth_status="connected",
            command_found=True,
            exit_code=0,
            latency_ms=7,
            message="codex 1.2.3",
            checked_at=now,
        )

    db = _FakeDb(row)
    response = await check_cli_profile_health(db, "profile-1", runner=fake_runner)

    assert response is not None
    assert db.executed is True
    assert db.flushed is True
    assert response.auth_status == "connected"
    assert response.profile.auth_status == "connected"
    assert response.profile.metadata["health_check"]["latency_ms"] == 7


@pytest.mark.asyncio
async def test_check_default_cli_profile_health_returns_synthetic_response() -> None:
    now = datetime(2026, 7, 2, 12, 0, tzinfo=UTC)

    async def fake_runner(profile):
        assert profile.id == DEFAULT_CODEX_PROFILE_ID
        return CLIHealthProbeResult(
            auth_status="disconnected",
            command_found=False,
            exit_code=None,
            latency_ms=0,
            message="CLI command not found: codex",
            checked_at=now,
        )

    db = _FakeDb(None)
    response = await check_cli_profile_health(
        db,
        DEFAULT_CODEX_PROFILE_ID,
        fallback_user_id="user-1",
        runner=fake_runner,
    )

    assert response is not None
    assert db.executed is False
    assert db.flushed is False
    assert response.profile.owner_user_id == "user-1"
    assert response.auth_status == "disconnected"
    assert response.command_found is False
