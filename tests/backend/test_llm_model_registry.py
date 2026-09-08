"""Tests for claude-sonnet-5 registry entry, sync_to_db dual-default guard, and pricing."""

import logging
import re
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import Delete, Update
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql.dml import Insert

from models.llm_models import _MODELS, LLMModelRegistry, LLMProvider

# 공식 가격표(ai.google.dev/gemini-api/docs/pricing, 2026-09-08 확인)가
# "$0.75/$3.75 through December 31, 2026, $1.50/$7.50 starting January 1, 2027"
# 로 고지한다. 코드 주석은 알림을 주지 않으므로 게이트가 대신 기억한다 —
# 발효일이 지나면 이 테스트가 실패하고, 가격을 갱신하면 다시 통과한다.
GEMINI_FLASH_PRICE_CHANGE = date(2027, 1, 1)
_GEMINI_FLASH_IDS = ("gemini-3.8-flash", "gemini-3.7-flash")
_GEMINI_FLASH_PRICE_BEFORE = (0.00075, 0.00375)  # $0.75 / $3.75 per 1M
_GEMINI_FLASH_PRICE_ON_OR_AFTER = (0.0015, 0.0075)  # $1.50 / $7.50 per 1M


def _expected_gemini_flash_price(today: date) -> tuple[float, float]:
    """발효일 기준으로 그날 유효한 (input, output) per-1k 단가."""
    if today >= GEMINI_FLASH_PRICE_CHANGE:
        return _GEMINI_FLASH_PRICE_ON_OR_AFTER
    return _GEMINI_FLASH_PRICE_BEFORE


@pytest.fixture(autouse=True)
def _reset_registry_cache():
    """Ensure the registry serves the in-memory _MODELS list (no DB cache)."""
    original_cache = LLMModelRegistry._db_cache
    original_index = LLMModelRegistry._db_index
    LLMModelRegistry._db_cache = None
    LLMModelRegistry._db_index = {}
    yield
    LLMModelRegistry._db_cache = original_cache
    LLMModelRegistry._db_index = original_index


# ─────────────────────────────────────────────────────────────
# (a) claude-sonnet-5 exists and is the anthropic code default
# ─────────────────────────────────────────────────────────────


class TestSonnet5RegistryEntry:
    def test_sonnet5_exists_with_expected_spec(self):
        model = LLMModelRegistry.get_by_id("claude-sonnet-5")
        assert model is not None
        assert model.provider == LLMProvider.ANTHROPIC
        assert model.context_window == 1_000_000
        assert model.input_price == 0.002  # $2/1M tokens (per-1k)
        assert model.output_price == 0.010  # $10/1M tokens (per-1k)
        assert model.supports_tools is True
        assert model.supports_vision is True
        assert model.is_enabled is True

    def test_sonnet5_is_anthropic_code_default(self):
        # 후속 정책 2026-09-01 (plan §5): 검증된 claude-sonnet-5 를
        # anthropic code default 로 복원한다.
        assert LLMModelRegistry.get_default("anthropic") == "claude-sonnet-5"

    def test_anthropic_has_exactly_one_code_default(self):
        defaults = [m.id for m in _MODELS if m.provider == LLMProvider.ANTHROPIC and m.is_default]
        assert defaults == ["claude-sonnet-5"]


# ─────────────────────────────────────────────────────────────
# (a3) 2026-08-31 provider default policy — registry entries
# ─────────────────────────────────────────────────────────────


class TestSonnet46RegistryEntry:
    def test_sonnet46_spec_preserved(self):
        """default 이관은 스펙을 건드리지 않는다 (ID/가격/context 보존)."""
        model = LLMModelRegistry.get_by_id("claude-sonnet-4-6")
        assert model is not None
        assert model.provider == LLMProvider.ANTHROPIC
        assert model.context_window == 1_000_000
        assert model.input_price == 0.003
        assert model.output_price == 0.015
        assert model.supports_tools is True
        assert model.supports_vision is True
        assert model.is_enabled is True


class TestOpus47RegistryEntry:
    def test_opus47_exists_enabled_nondefault(self):
        model = LLMModelRegistry.get_by_id("claude-opus-4-7")
        assert model is not None
        assert model.provider == LLMProvider.ANTHROPIC
        assert model.context_window == 1_000_000
        assert model.input_price == 0.005  # $5/1M tokens (per-1k)
        assert model.output_price == 0.025  # $25/1M tokens (per-1k)
        assert model.supports_tools is True
        assert model.supports_vision is True
        assert model.is_enabled is True
        assert model.is_default is False


class TestCurrentModelRefreshEntries:
    @pytest.mark.parametrize(
        ("model_id", "provider", "context_window", "input_price", "output_price"),
        [
            ("claude-opus-5", LLMProvider.ANTHROPIC, 1_000_000, 0.005, 0.025),
            ("claude-fable-5-1", LLMProvider.ANTHROPIC, 1_000_000, 0.010, 0.050),
            # 예고된 인상(2027-01-01)이 있어 단가를 날짜에서 유도한다 — 박아 두면
            # 발효일에 이 테스트가 별도로 깨져 갱신 후에도 초록이 되지 않는다.
            (
                "gemini-3.8-flash",
                LLMProvider.GOOGLE,
                1_048_576,
                *_expected_gemini_flash_price(datetime.now(UTC).date()),
            ),
            ("gpt-6-astra", LLMProvider.OPENAI, 1_050_000, 0.010, 0.050),
        ],
    )
    def test_new_models_have_verified_specs_and_are_non_default(
        self, model_id, provider, context_window, input_price, output_price
    ):
        model = LLMModelRegistry.get_by_id(model_id)
        assert model is not None
        assert model.provider == provider
        assert model.context_window == context_window
        assert model.input_price == input_price
        assert model.output_price == output_price
        assert model.is_enabled is True
        assert model.is_default is False
        assert model.supports_tools is True
        assert model.supports_vision is True

    def test_existing_provider_defaults_are_not_promoted_without_smoke(self):
        assert LLMModelRegistry.get_default("anthropic") == "claude-sonnet-5"
        assert LLMModelRegistry.get_default("google") == "gemini-3.7-flash"
        assert LLMModelRegistry.get_default("openai") == "gpt-5.6"


class TestGpt56RegistryEntry:
    def test_gpt56_alias_enabled_with_official_spec(self):
        model = LLMModelRegistry.get_by_id("gpt-5.6")
        assert model is not None
        assert model.provider == LLMProvider.OPENAI
        assert model.context_window == 1_050_000
        assert model.input_price == 0.004  # $4/1M tokens (per-1k)
        assert model.output_price == 0.02  # $20/1M tokens (per-1k)
        assert model.supports_tools is True
        assert model.supports_vision is True
        assert model.is_enabled is True

    def test_gpt56_is_openai_code_default(self):
        assert LLMModelRegistry.get_default("openai") == "gpt-5.6"

    def test_openai_has_exactly_one_code_default(self):
        defaults = [m.id for m in _MODELS if m.provider == LLMProvider.OPENAI and m.is_default]
        assert defaults == ["gpt-5.6"]

    @pytest.mark.parametrize(
        ("model_id", "input_price", "output_price"),
        [
            ("gpt-5.6-sol", 0.004, 0.02),
            ("gpt-5.6-terra", 0.002, 0.012),
            ("gpt-5.6-luna", 0.0002, 0.0012),
        ],
    )
    def test_gpt56_tiers_are_enabled(self, model_id, input_price, output_price):
        model = LLMModelRegistry.get_by_id(model_id)
        assert model is not None
        assert model.provider == LLMProvider.OPENAI
        assert model.context_window == 1_050_000
        assert model.input_price == input_price
        assert model.output_price == output_price
        assert model.is_enabled is True
        assert model.is_default is False


class TestGemini37FlashRegistryEntry:
    def test_gemini37_flash_exists_with_official_spec(self):
        model = LLMModelRegistry.get_by_id("gemini-3.7-flash")
        assert model is not None
        assert model.provider == LLMProvider.GOOGLE
        assert model.context_window == 1_048_576
        expected_in, expected_out = _expected_gemini_flash_price(datetime.now(UTC).date())
        assert model.input_price == expected_in
        assert model.output_price == expected_out
        assert model.supports_tools is True
        assert model.supports_vision is True
        assert model.is_enabled is True

    def test_gemini37_flash_is_google_code_default(self):
        assert LLMModelRegistry.get_default("google") == "gemini-3.7-flash"

    def test_google_has_exactly_one_code_default(self):
        defaults = [m.id for m in _MODELS if m.provider == LLMProvider.GOOGLE and m.is_default]
        assert defaults == ["gemini-3.7-flash"]


# ─────────────────────────────────────────────────────────────
# (a4) 2026-09-01 follow-up policy — gpt-5.5 seed, alias/revision metadata
# ─────────────────────────────────────────────────────────────


class TestGpt55SeedPolicy:
    def test_gpt55_seed_is_disabled(self):
        """후속 정책 2026-09-01 (plan §5): gpt-5.5 는 live smoke 전까지 code
        seed 에서 즉시 enabled 로 두지 않는다. 행 자체는 호환성 위해 유지."""
        model = LLMModelRegistry.get_by_id("gpt-5.5")
        assert model is not None
        assert model.is_enabled is False
        assert model.is_default is False


class TestAliasAndRevisionMetadata:
    def test_gpt56_alias_maps_to_documented_concrete_model(self):
        """gpt-5.6 은 문서상 Sol 로 라우팅되는 alias — code-seed 의 optional
        구조화 metadata 로만 기록한다. provider 응답으로 확인한 값이 아니므로
        실행 귀속(resolved_model)에는 쓰지 않는다."""
        model = LLMModelRegistry.get_by_id("gpt-5.6")
        assert model is not None
        assert model.alias_for == "gpt-5.6-sol"

    def test_alias_for_defaults_none_for_regular_models(self):
        """구버전 직렬화/DB-loaded config 호환: alias_for 는 optional 기본 None."""
        model = LLMModelRegistry.get_by_id("claude-sonnet-5")
        assert model is not None
        assert model.alias_for is None

    @pytest.mark.asyncio
    async def test_sync_to_db_values_do_not_include_alias_for(self):
        """alias_for 는 code-seed 전용 metadata: DB 스키마에 컬럼이 없으므로
        INSERT values 에 포함되면 실제 DB 에서 sync 가 죽는다 (no migration)."""
        session = _FakeSession(
            select_results=[
                _FakeResult([]),  # suppressed ids
                _FakeResult([]),  # existing ids
                _FakeResult([]),  # providers with DB rows
                _FakeResult([]),  # final load_from_db select
            ]
        )
        await LLMModelRegistry.sync_to_db(session)
        for stmt in session.inserts:
            assert "alias_for" not in _insert_params(stmt)

    def test_registry_revision_reflects_serving_mode(self):
        """실행 계측용 registry revision: code seed 서빙과 DB 캐시 서빙을
        구분해 표시한다 (JSON-safe 문자열, 스키마 변경 없음)."""
        from models.llm_models import REGISTRY_REVISION

        assert LLMModelRegistry.get_revision() == f"code:{REGISTRY_REVISION}"
        LLMModelRegistry._db_cache = []
        LLMModelRegistry._db_index = {}
        assert LLMModelRegistry.get_revision() == f"db:{REGISTRY_REVISION}"


# ─────────────────────────────────────────────────────────────
# (a5) get_default — deterministic + fail-closed selection policy
# ─────────────────────────────────────────────────────────────


def _policy_cfg(
    model_id: str,
    *,
    is_default: bool = False,
    is_enabled: bool = True,
    input_price: float = 0.001,
    output_price: float = 0.002,
):
    from models.llm_models import LLMModelConfig

    return LLMModelConfig(
        id=model_id,
        display_name=model_id,
        provider=LLMProvider.GOOGLE,
        context_window=100_000,
        input_price=input_price,
        output_price=output_price,
        is_default=is_default,
        is_enabled=is_enabled,
    )


def _serve_from_cache(models: list) -> None:
    LLMModelRegistry._db_cache = models
    LLMModelRegistry._db_index = {m.id: m for m in models}


class TestGetDefaultSelectionPolicy:
    def test_every_seed_provider_has_exactly_one_enabled_default(self):
        """provider 별 code default 는 정확히 하나, 그리고 enabled 여야 한다 —
        disabled default 는 조용한 순서 의존 선택을 유발한다."""
        providers = {m.provider for m in _MODELS}
        for provider in providers:
            defaults = [m for m in _MODELS if m.provider == provider and m.is_default]
            assert len(defaults) == 1, f"{provider.value}: defaults={[m.id for m in defaults]}"
            assert defaults[0].is_enabled, f"{provider.value}: default {defaults[0].id} is disabled"

    def test_no_enabled_default_falls_back_to_cheapest_deterministically(self, caplog):
        """default 가 disabled 된 provider: 목록 순서(첫 요소)가 아니라
        결정론적(최저가 합산, id tie-break) 폴백을 고르고 경고를 남긴다."""
        _serve_from_cache(
            [
                _policy_cfg("z-expensive", input_price=0.01, output_price=0.05),
                _policy_cfg("a-cheap", input_price=0.0001, output_price=0.0004),
                _policy_cfg("m-disabled-default", is_default=True, is_enabled=False),
            ]
        )
        with caplog.at_level(logging.WARNING, logger="models.llm_models"):
            assert LLMModelRegistry.get_default("google") == "a-cheap"
        assert "no enabled default" in caplog.text

    def test_fallback_is_order_independent(self):
        models = [
            _policy_cfg("z-expensive", input_price=0.01, output_price=0.05),
            _policy_cfg("a-cheap", input_price=0.0001, output_price=0.0004),
        ]
        _serve_from_cache(models)
        first = LLMModelRegistry.get_default("google")
        _serve_from_cache(list(reversed(models)))
        assert LLMModelRegistry.get_default("google") == first == "a-cheap"

    def test_multiple_enabled_defaults_resolve_deterministically(self, caplog):
        """DB drift 로 enabled default 가 2개면 목록 순서가 아니라 id 순으로
        결정하고 경고를 남긴다 — 충돌을 조용히 숨기지 않는다."""
        _serve_from_cache(
            [
                _policy_cfg("z-default", is_default=True),
                _policy_cfg("a-default", is_default=True),
            ]
        )
        with caplog.at_level(logging.WARNING, logger="models.llm_models"):
            assert LLMModelRegistry.get_default("google") == "a-default"
        assert "multiple enabled defaults" in caplog.text

    def test_provider_without_enabled_models_fails_closed(self):
        """enabled 모델이 0개인 provider 는 타 provider 모델("codex-cli")을
        조용히 반환하지 않고 LookupError 로 fail-closed 한다."""
        _serve_from_cache([_policy_cfg("g-disabled", is_enabled=False)])
        with pytest.raises(LookupError, match="google"):
            LLMModelRegistry.get_default("google")

    def test_unknown_provider_string_fails_closed(self, caplog):
        """미지 provider 문자열은 "codex-cli" 로 조용히 라우팅하지 않고
        LookupError 로 fail-closed 한다 — 임의 문자열이 Codex 실행 경로로
        흘러가면 provider 정책·entitlement 게이트가 우회된다."""
        with caplog.at_level(logging.ERROR, logger="models.llm_models"):
            with pytest.raises(LookupError, match="not-a-provider"):
                LLMModelRegistry.get_default("not-a-provider")
        assert "unknown provider" in caplog.text.lower()

    def test_unknown_env_provider_fails_closed_without_provider_arg(self, monkeypatch):
        """provider 인자 없는 호출은 LLM_PROVIDER env 로 해석되는데, env 가
        미지 문자열이면 codex-cli 대체 없이 LookupError 로 fail-closed 한다."""
        monkeypatch.setenv("LLM_PROVIDER", "rogue-provider")
        with pytest.raises(LookupError, match="rogue-provider"):
            LLMModelRegistry.get_default()


class TestGetDefaultFailClosedCallerGuards:
    """get_default 의 LookupError(fail-closed)가 조회성 표면을 500 으로
    깨뜨리지 않도록, 명시적 폴백을 가진 호출부를 고정한다."""

    @pytest.mark.asyncio
    async def test_providers_endpoint_reports_none_default_for_empty_provider(self):
        """/api/llm/providers 는 enabled 모델 0개인 provider 를 500 없이
        default=None 으로 보고해야 한다 (타 provider 모델 이름을 대입하던
        기존 오답도 함께 제거)."""
        from api.llm import get_providers

        _serve_from_cache([_policy_cfg("g-disabled", is_enabled=False)])
        result = await get_providers()
        assert result["google"]["default"] is None
        assert result["google"]["models"] == []

    @pytest.mark.asyncio
    async def test_default_model_endpoint_returns_404_for_empty_provider(self):
        """/api/llm/models/default?provider=google 은 enabled 모델이 0개면
        500 이 아니라 404 로 fail-closed 한다."""
        from fastapi import HTTPException

        from api.llm import get_default_model

        _serve_from_cache([_policy_cfg("g-disabled", is_enabled=False)])
        with pytest.raises(HTTPException) as exc_info:
            await get_default_model(provider="google")
        assert exc_info.value.status_code == 404

    def test_update_probe_treats_empty_provider_as_unavailable(self):
        """12시간 update check 의 provider 프로브는 enabled 모델 0개를
        '사용 불가'(skip)로 취급해야 한다 — 스케줄러가 죽으면 안 된다."""
        from services.model_update_service import _provider_probe_available

        _serve_from_cache([_policy_cfg("g-disabled", is_enabled=False)])
        assert _provider_probe_available("google") is False


# ─────────────────────────────────────────────────────────────
# (a2) claude-cli exists (codex_cli-symmetric subscription runtime)
# ─────────────────────────────────────────────────────────────


class TestClaudeCliRegistryEntry:
    def test_claude_cli_exists_with_expected_spec(self):
        model = LLMModelRegistry.get_by_id("claude-cli")
        assert model is not None
        assert model.display_name == "Claude CLI"
        assert model.provider == LLMProvider.CLAUDE_CLI
        assert model.context_window == 200_000
        assert model.input_price == 0.0  # $0 subscription-backed runtime
        assert model.output_price == 0.0
        assert model.supports_tools is False  # CLI cannot emit LangChain tool calls
        assert model.supports_vision is False
        assert model.is_enabled is True

    def test_claude_cli_is_provider_default(self):
        # Only model under the claude_cli provider → it is the provider default.
        assert LLMModelRegistry.get_default("claude_cli") == "claude-cli"

    def test_claude_cli_provider_has_exactly_one_code_default(self):
        defaults = [m.id for m in _MODELS if m.provider == LLMProvider.CLAUDE_CLI and m.is_default]
        assert defaults == ["claude-cli"]

    def test_claude_cli_is_always_available(self):
        # CLI subscription runtime needs no API key → always available (like codex_cli).
        assert LLMModelRegistry.is_available("claude-cli") is True


# ─────────────────────────────────────────────────────────────
# (b) sync_to_db dual-default guard
# ─────────────────────────────────────────────────────────────


class _FakeResult:
    def __init__(self, rows: list[tuple] | None = None):
        self._rows = rows or []

    def fetchall(self) -> list[tuple]:
        return self._rows

    def scalars(self):  # for load_from_db at end of sync_to_db
        return self

    def all(self) -> list:
        return []


class _FakeSession:
    """Captures statements; serves queued results for SELECT calls in order."""

    def __init__(self, select_results: list[_FakeResult]):
        self._select_results = select_results
        self.inserts: list = []
        self.updates: list = []
        self.deletes: list = []
        self.selects: list = []
        self.committed = False

    async def execute(self, stmt):
        if isinstance(stmt, Insert):
            self.inserts.append(stmt)
            return _FakeResult()
        if isinstance(stmt, Update):
            self.updates.append(stmt)
            return _FakeResult()
        if isinstance(stmt, Delete):
            # Self-heal bulk delete: captured without consuming a select result.
            self.deletes.append(stmt)
            return _FakeResult()
        self.selects.append(stmt)
        return self._select_results.pop(0)

    async def commit(self):
        self.committed = True


def _insert_params(stmt) -> dict:
    return stmt.compile(dialect=postgresql.dialect()).params


def _find_insert(session: _FakeSession, model_id: str):
    for stmt in session.inserts:
        if _insert_params(stmt).get("id") == model_id:
            return stmt
    raise AssertionError(f"no insert captured for {model_id}")


class _RowAwareFakeSession(_FakeSession):
    """SQL-aware fake: answers each SELECT by applying its rendered WHERE
    filters to a simulated llm_model_configs table, so the provider-guard
    query's *semantics* (not the call order) determine the outcome.

    rows: [{"id", "provider", "is_default", "is_enabled"}, ...]
    """

    def __init__(self, rows: list[dict]):
        super().__init__(select_results=[])
        self._rows = rows

    async def execute(self, stmt):
        if isinstance(stmt, (Insert, Update, Delete)):
            return await super().execute(stmt)
        self.selects.append(stmt)
        sql = str(stmt.compile(dialect=postgresql.dialect()))
        if "llm_model_suppressions" in sql:
            return _FakeResult([])  # no suppressions in these scenarios
        columns = sql.split("FROM", 1)[0]
        if "display_name" in columns:
            return _FakeResult([])  # final load_from_db entity select
        rows = self._rows
        if "is_default IS true" in sql:
            rows = [r for r in rows if r["is_default"]]
        if "is_enabled IS true" in sql:
            rows = [r for r in rows if r["is_enabled"]]
        if "llm_model_configs.provider" in columns:
            return _FakeResult(sorted({(r["provider"],) for r in rows}))
        if "llm_model_configs.id" in columns:
            return _FakeResult([(r["id"],) for r in rows])
        raise AssertionError(f"unrecognized select in fake session: {sql}")


@pytest.mark.asyncio
async def test_sync_to_db_new_default_demoted_when_db_default_exists():
    """New is_default=True model must INSERT as is_default=False when the
    provider already has rows in DB (existing admin state respected)."""
    session = _FakeSession(
        select_results=[
            _FakeResult([]),  # suppressed ids (none)
            # existing IDs: sonnet-5 is NEW, sonnet-4-6 already exists
            _FakeResult([("claude-sonnet-4-6",), ("claude-opus-4-8",)]),
            # providers that already have DB rows
            _FakeResult([("anthropic",)]),
            # final load_from_db select
            _FakeResult([]),
        ]
    )

    await LLMModelRegistry.sync_to_db(session)

    params = _insert_params(_find_insert(session, "claude-sonnet-5"))
    assert params["is_default"] is False
    assert session.committed is True


@pytest.mark.asyncio
async def test_sync_to_db_new_default_kept_when_provider_has_zero_rows():
    """New is_default=True model keeps is_default=True only when the provider
    has ZERO rows in DB (bootstrap of a fresh provider)."""
    session = _FakeSession(
        select_results=[
            _FakeResult([]),  # suppressed ids (none)
            _FakeResult([("gpt-4o",)]),  # only an openai row: anthropic is empty
            _FakeResult([("openai",)]),  # providers with DB rows
            _FakeResult([]),  # final load_from_db select
        ]
    )

    await LLMModelRegistry.sync_to_db(session)

    # 2026-09-01 정책: anthropic code default 는 claude-sonnet-5 로 복원됨.
    params = _insert_params(_find_insert(session, "claude-sonnet-5"))
    assert params["is_default"] is True


@pytest.mark.asyncio
async def test_sync_to_db_new_default_demoted_when_prior_default_is_disabled():
    """승격 차단 회귀 (plan §5): provider의 유일한 default 행이 DISABLED여도
    admin 결정이다 — 신규 code default는 non-default로 INSERT되고, 기존 행의
    admin 플래그(is_default/is_enabled)를 건드리는 UPDATE가 발행되면 안 된다."""
    session = _RowAwareFakeSession(
        rows=[
            {
                "id": "claude-sonnet-4-6",
                "provider": "anthropic",
                "is_default": True,
                "is_enabled": False,  # admin이 disable해 둔 구 default
            }
        ]
    )

    await LLMModelRegistry.sync_to_db(session)

    params = _insert_params(_find_insert(session, "claude-sonnet-5"))
    assert params["is_default"] is False
    assert session.updates == [], "sync must not clear/override admin flags on existing rows"


@pytest.mark.asyncio
async def test_sync_to_db_new_default_demoted_when_provider_has_only_nondefault_rows():
    """승격 차단 회귀 (plan §5): default 행이 하나도 없어도 provider에 DB 행이
    존재하면 신규 code default는 non-default로 INSERT된다 — zero-row provider의
    bootstrap만 예외."""
    session = _RowAwareFakeSession(
        rows=[
            {
                "id": "claude-opus-4-8",
                "provider": "anthropic",
                "is_default": False,
                "is_enabled": True,
            }
        ]
    )

    await LLMModelRegistry.sync_to_db(session)

    params = _insert_params(_find_insert(session, "claude-sonnet-5"))
    assert params["is_default"] is False


@pytest.mark.asyncio
async def test_sync_to_db_bootstraps_default_for_provider_with_zero_rows():
    """다른 provider에 행이 있어도, 행이 0개인 provider의 code default는
    그대로 bootstrap된다 (SQL-aware 시뮬레이션으로 의미론 검증)."""
    session = _RowAwareFakeSession(
        rows=[
            {
                "id": "gpt-4o",
                "provider": "openai",
                "is_default": True,
                "is_enabled": True,
            }
        ]
    )

    await LLMModelRegistry.sync_to_db(session)

    # 2026-09-01 정책: anthropic code default 는 claude-sonnet-5 로 복원됨.
    params = _insert_params(_find_insert(session, "claude-sonnet-5"))
    assert params["is_default"] is True


@pytest.mark.asyncio
async def test_sync_to_db_no_default_clear_when_enabled_db_default_exists():
    """enabled DB default가 있으면 신규 모델은 demote되고 클리어 UPDATE도
    발행되지 않는다 (admin default 행 보존)."""
    session = _FakeSession(
        select_results=[
            _FakeResult([]),  # suppressed ids (none)
            _FakeResult([("claude-sonnet-4-6",)]),  # sonnet-5 is NEW
            _FakeResult([("anthropic",)]),  # anthropic enabled default 존재
            _FakeResult([]),
        ]
    )

    await LLMModelRegistry.sync_to_db(session)

    for stmt in session.updates:
        compiled = stmt.compile(dialect=postgresql.dialect())
        assert "anthropic" not in compiled.params.values(), (
            "must not clear defaults for a provider with an enabled DB default"
        )


@pytest.mark.asyncio
async def test_sync_to_db_on_conflict_preserves_admin_fields():
    """ON CONFLICT DO UPDATE must not touch is_default / is_enabled."""
    session = _FakeSession(
        select_results=[
            _FakeResult([]),  # suppressed ids (none)
            _FakeResult([("claude-sonnet-5",)]),  # sonnet-5 already exists
            _FakeResult([("anthropic",)]),
            _FakeResult([]),
        ]
    )

    await LLMModelRegistry.sync_to_db(session)

    stmt = _find_insert(session, "claude-sonnet-5")
    sql = str(stmt.compile(dialect=postgresql.dialect()))
    assert "DO UPDATE SET" in sql
    update_clause = sql.split("DO UPDATE SET", 1)[1]
    assert "is_default" not in update_clause
    assert "is_enabled" not in update_clause


# ─────────────────────────────────────────────────────────────
# (a-suppression) startup re-INSERT guard: suppressed ids are skipped
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_sync_to_db_skips_suppressed_model_id():
    """Regression guard (a): a suppressed model id must NOT be re-INSERTed by
    startup sync_to_db, even though it is still present in code _MODELS."""
    session = _FakeSession(
        select_results=[
            _FakeResult([("claude-opus-4-8",)]),  # suppressed ids
            _FakeResult([]),  # existing ids: table empty
            _FakeResult([]),  # providers with a DB default
            _FakeResult([]),  # final load_from_db select
        ]
    )

    await LLMModelRegistry.sync_to_db(session)

    inserted_ids = {_insert_params(s).get("id") for s in session.inserts}
    # Suppressed model is NOT re-inserted...
    assert "claude-opus-4-8" not in inserted_ids
    # ...while other code models still sync normally.
    assert "claude-sonnet-5" in inserted_ids


@pytest.mark.asyncio
async def test_sync_to_db_self_heals_suppressed_config_rows():
    """P1-2 self-heal: sync_to_db must issue a bulk DELETE removing any config
    row whose id is suppressed, recovering from a snapshot↔DELETE race that left
    a stray config behind. Verified at the statement level (no real DB): the
    DELETE targets llm_model_configs filtered by the suppressions subquery, with
    synchronize_session=False so a real Postgres run cannot raise on the
    non-evaluable subquery WHERE."""
    session = _FakeSession(
        select_results=[
            _FakeResult([]),  # suppressed ids
            _FakeResult([]),  # existing ids
            _FakeResult([]),  # providers with DB default
            _FakeResult([]),  # final load_from_db
        ]
    )

    await LLMModelRegistry.sync_to_db(session)

    assert session.deletes, "expected a self-heal DELETE on llm_model_configs"
    compiled = session.deletes[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "DELETE FROM llm_model_configs" in sql
    assert "llm_model_suppressions" in sql
    assert session.deletes[0].get_execution_options().get("synchronize_session") is False


# ─────────────────────────────────────────────────────────────
# (P2) load_from_db: empty-success clears cache vs preserves fallback
# ─────────────────────────────────────────────────────────────


class _FakeLoadResult:
    def __init__(self, rows: list):
        self._rows = rows

    def scalars(self):
        return self

    def all(self) -> list:
        return self._rows


class _FakeLoadSession:
    def __init__(self, rows: list):
        self._rows = rows

    async def execute(self, stmt):
        return _FakeLoadResult(self._rows)


@pytest.mark.asyncio
async def test_load_from_db_empty_clears_existing_db_cache():
    """A successful EMPTY read while already in DB mode (cache is a list) must
    clear the cache — otherwise a hard-deleted last model lingers stale."""
    from models.llm_models import LLMModelConfig

    LLMModelRegistry._db_cache = [
        LLMModelConfig(
            id="stale-model",
            display_name="Stale",
            provider=LLMProvider.OPENAI,
            context_window=128000,
            input_price=0.001,
            output_price=0.002,
        )
    ]
    LLMModelRegistry._db_index = {"stale-model": LLMModelRegistry._db_cache[0]}

    await LLMModelRegistry.load_from_db(_FakeLoadSession(rows=[]))

    assert LLMModelRegistry._db_cache == []
    assert LLMModelRegistry.get_by_id("stale-model") is None


@pytest.mark.asyncio
async def test_load_from_db_empty_preserves_fallback_on_first_load():
    """A successful EMPTY read on the FIRST load (no cache yet) must keep the
    in-memory _MODELS fallback (cache stays None) so startup serves models even
    before sync_to_db populates the table."""
    LLMModelRegistry._db_cache = None
    LLMModelRegistry._db_index = {}

    await LLMModelRegistry.load_from_db(_FakeLoadSession(rows=[]))

    assert LLMModelRegistry._db_cache is None
    # Fallback still serves the code registry.
    assert LLMModelRegistry.get_by_id("claude-sonnet-5") is not None


def test_evict_reflects_in_none_cache_fallback():
    """P2: evict must drop the id even with no DB cache (fallback mode). It
    materializes the cache from _MODELS minus the id, so a failed post-delete
    reload cannot let the in-memory fallback keep serving a hard-deleted model."""
    LLMModelRegistry._db_cache = None
    LLMModelRegistry._db_index = {}
    # Present in the code registry before eviction.
    assert LLMModelRegistry.get_by_id("gpt-5.4-nano") is not None

    LLMModelRegistry.evict("gpt-5.4-nano")

    assert LLMModelRegistry.get_by_id("gpt-5.4-nano") is None
    # Other models remain reachable.
    assert LLMModelRegistry.get_by_id("claude-sonnet-5") is not None


# ─────────────────────────────────────────────────────────────
# (c) llm_proxy pricing matches claude-sonnet-5 (non-zero)
# ─────────────────────────────────────────────────────────────


class TestLLMProxyCostTable:
    def test_sonnet5_cost_is_nonzero(self):
        from api.llm_proxy import _calc_cost

        cost = _calc_cost("claude-sonnet-5", 1000, 1000)
        assert cost == pytest.approx(0.002 + 0.010)
        assert cost > 0.0

    def test_gpt6_astra_and_fable5_costs_are_priced(self):
        from api.llm_proxy import _calc_cost

        assert _calc_cost("gpt-6-astra", 1000, 1000) == pytest.approx(0.010 + 0.050)
        assert _calc_cost("claude-fable-5-1", 1000, 1000) == pytest.approx(0.010 + 0.050)

    def test_opus_5_does_not_fall_through_to_legacy_opus_4(self):
        """`claude-opus-5` 는 generic `claude-opus-4` 행($15/$75)에 걸리면 안 된다."""
        from api.llm_proxy import _calc_cost

        assert _calc_cost("claude-opus-5", 1000, 1000) == pytest.approx(0.005 + 0.025)

    def test_gemini_3_flash_models_are_priced(self):
        """미매칭 모델은 조용히 $0 로 정산된다 — Flash 3.7/3.8 은 행이 있어야 한다."""
        from api.llm_proxy import _calc_cost

        expected = sum(_expected_gemini_flash_price(datetime.now(UTC).date()))
        for model in ("gemini-3.8-flash", "gemini-3.7-flash"):
            assert _calc_cost(model, 1000, 1000) == pytest.approx(expected), model

    def test_opus_4_8_matches_before_legacy_opus_4(self):
        from api.llm_proxy import _calc_cost

        # Must hit the claude-opus-4-8 row ($5/$25), not claude-opus-4 ($15/$75)
        assert _calc_cost("claude-opus-4-8", 1000, 1000) == pytest.approx(0.005 + 0.025)

    def test_haiku_4_5_matches_before_legacy_haiku_4(self):
        from api.llm_proxy import _calc_cost

        # Must hit the claude-haiku-4-5 row ($1/$5), not claude-haiku-4
        assert _calc_cost("claude-haiku-4-5-20251001", 1000, 1000) == pytest.approx(0.001 + 0.005)

    def test_opus_4_5_and_later_match_post_price_cut_rows(self):
        """Opus price cut ($5/$25) applies from 4.5 onward: the specific
        4-5/4-6/4-7 prefixes must win over the generic claude-opus-4 row."""
        from api.llm_proxy import _calc_cost

        for model in ("claude-opus-4-5-20251101", "claude-opus-4-6", "claude-opus-4-7"):
            assert _calc_cost(model, 1000, 1000) == pytest.approx(0.005 + 0.025), model

    def test_opus_4_1_and_4_0_keep_legacy_price(self):
        """Pre-4.5 Opus generations fall through to claude-opus-4 ($15/$75)."""
        from api.llm_proxy import _calc_cost

        for model in ("claude-opus-4-1", "claude-opus-4-0"):
            assert _calc_cost(model, 1000, 1000) == pytest.approx(0.015 + 0.075), model


# ─────────────────────────────────────────────────────────────
# (d) get_context_limit converges on the registry (SSOT)
# ─────────────────────────────────────────────────────────────


class TestContextLimitRegistrySSOT:
    def test_registry_models_resolve_registry_context_window(self):
        from models.context_usage import get_context_limit

        # 1M-context models must report the registry value, not the old
        # 200K legacy dict entries
        assert get_context_limit("anthropic", "claude-sonnet-5") == 1_000_000
        assert get_context_limit("anthropic", "claude-sonnet-4-6") == 1_000_000
        assert get_context_limit("anthropic", "claude-opus-4-8") == 1_000_000
        assert get_context_limit("openai", "gpt-4o") == 128_000

    def test_unknown_model_falls_back_to_legacy_dict(self):
        from models.context_usage import get_context_limit

        # Not in the registry → legacy substring matching still applies
        assert get_context_limit("google", "gemini-1.5-pro") == 1_000_000
        assert get_context_limit("openai", "gpt-3.5-turbo") == 16_385

    def test_fully_unknown_model_uses_provider_default(self):
        from models.context_usage import get_context_limit

        assert get_context_limit("anthropic", "some-future-model") == 200_000
        assert get_context_limit("not-a-provider", "whatever") == 100_000


# ─────────────────────────────────────────────────────────────
# (e) claude_session MODEL_COSTS (exact-id lookup table)
# ─────────────────────────────────────────────────────────────


class TestClaudeSessionModelCosts:
    def test_opus_4_7_has_exact_entry_post_price_cut(self):
        """MODEL_COSTS는 정확-ID 조회 테이블: opus-4-7 항목이 없으면
        calculate_cost가 sonnet 폴백($3/$15)으로 과소 집계된다."""
        from models.claude_session import calculate_cost

        assert calculate_cost("claude-opus-4-7", 1000, 1000) == pytest.approx(0.030)

    def test_opus_4_5_plus_family_all_priced_at_5_25(self):
        from models.claude_session import calculate_cost

        for model in (
            "claude-opus-4-8",
            "claude-opus-4-6",
            "claude-opus-4-5-20251101",
        ):
            assert calculate_cost(model, 1000, 1000) == pytest.approx(0.030), model


# ─────────────────────────────────────────────────────────────
# (f) 비용표 ↔ 레지스트리 드리프트 방지 불변식
# ─────────────────────────────────────────────────────────────

# CLI/로컬 런타임은 구독·무료 실행이라 per-token 비용표의 대상이 아니다.
_UNPRICED_PROVIDERS = frozenset({LLMProvider.CODEX_CLI, LLMProvider.CLAUDE_CLI, LLMProvider.OLLAMA})

_PRICED_MODELS = [m for m in _MODELS if m.provider not in _UNPRICED_PROVIDERS]

# 입력·출력 토큰 수를 다르게 준다. 같은 수(예: 1000/1000)면 비용이 (in+out) 대칭 합이 되어
# 행의 두 값을 뒤바꿔 적은 전치 오류가 그대로 통과한다 — 15행을 손으로 옮기는 작업에서
# 가장 현실적인 오류가 전치이므로 비대칭으로 고정한다.
_IN_TOKENS, _OUT_TOKENS = 1000, 3000


def _expected_cost(model) -> float:
    return model.input_price * (_IN_TOKENS / 1000) + model.output_price * (_OUT_TOKENS / 1000)


class TestCostTableRegistryDrift:
    """_MODELS(SSOT) 에 있는데 비용표에 행이 없으면 _calc_cost 가 조용히 0.0 을
    돌려줘 전액 미집계된다. is_enabled 와 무관하게 전수 검사한다 — disabled
    모델도 admin 의 PATCH 한 번으로 즉시 라이브가 되기 때문이다."""

    def test_every_priced_registry_model_is_covered_by_llm_proxy(self):
        from api.llm_proxy import _calc_cost

        mismatched = []
        for model in _PRICED_MODELS:
            expected = _expected_cost(model)
            actual = _calc_cost(model.id, _IN_TOKENS, _OUT_TOKENS)
            if actual != pytest.approx(expected):
                mismatched.append((model.id, expected, actual))

        assert not mismatched, f"llm_proxy COST_TABLE 미커버/오단가: {mismatched}"

    def test_every_openai_registry_model_is_covered_by_usage_collector(self):
        from services.external_usage_service.collectors import OpenAIUsageCollector

        mismatched = []
        for model in _PRICED_MODELS:
            if model.provider != LLMProvider.OPENAI:
                continue
            expected = _expected_cost(model)
            actual = OpenAIUsageCollector._calc_cost(model.id, _IN_TOKENS, _OUT_TOKENS)
            if actual != pytest.approx(expected):
                mismatched.append((model.id, expected, actual))

        assert not mismatched, f"OpenAIUsageCollector._COST_TABLE 미커버/오단가: {mismatched}"

    def test_every_anthropic_registry_model_is_covered_by_usage_collector(self):
        """AnthropicUsageCollector 의 표는 collect() 지역 변수였다가 클래스 속성으로
        승격됐다(2026-09-08). 그 전에는 이 불변식을 걸 수 없어 조용히 드리프트했다."""
        from services.external_usage_service.collectors import AnthropicUsageCollector

        mismatched = []
        for model in _PRICED_MODELS:
            if model.provider != LLMProvider.ANTHROPIC:
                continue
            expected = _expected_cost(model)
            actual = AnthropicUsageCollector._calc_cost(model.id, _IN_TOKENS, _OUT_TOKENS)
            if actual != pytest.approx(expected):
                mismatched.append((model.id, expected, actual))

        assert not mismatched, f"AnthropicUsageCollector._COST_TABLE 미커버/오단가: {mismatched}"

    def test_every_anthropic_registry_model_is_in_claude_session_costs(self):
        """MODEL_COSTS 는 정확-ID 조회라 신규 Anthropic 모델이 빠지면 sonnet 단가로
        폴백해 오집계된다(비싼 모델이면 과소, 싼 모델이면 과대)."""
        from models.claude_session import MODEL_COSTS

        mismatched = []
        for model in _PRICED_MODELS:
            if model.provider != LLMProvider.ANTHROPIC:
                continue
            entry = MODEL_COSTS.get(model.id)
            if entry is None:
                mismatched.append((model.id, "미등록"))
            elif entry["input"] != pytest.approx(model.input_price) or entry[
                "output"
            ] != pytest.approx(model.output_price):
                mismatched.append((model.id, entry))

        assert not mismatched, f"claude_session.MODEL_COSTS 미커버/오단가: {mismatched}"


class TestCostTablePrefixOrdering:
    """비용표는 startswith 선착 매칭이라 삽입 순서가 계약이다: 구체 변종이
    bare alias 행보다 뒤에 오면 조용히 alias 단가로 재가격된다."""

    @staticmethod
    def _shadowed(prefixes: list[str]) -> list[tuple[str, str]]:
        """뒤쪽 행이 앞쪽 행의 확장(prefix 관계)이면 영원히 도달 불가."""
        return [
            (specific, generic)
            for i, generic in enumerate(prefixes)
            for specific in prefixes[i + 1 :]
            if specific.startswith(generic)
        ]

    def test_llm_proxy_table_has_no_shadowed_row(self):
        """오늘의 id 를 고정하는 대신 구조를 단언한다 — 새 행이 추가돼도 살아남는다."""
        from api.llm_proxy import COST_TABLE

        shadowed = self._shadowed([row[0] for row in COST_TABLE])
        assert not shadowed, f"COST_TABLE: 구체 prefix 가 generic 뒤에 있어 도달 불가: {shadowed}"

    def test_usage_collector_table_has_no_shadowed_row(self):
        from services.external_usage_service.collectors import (
            AnthropicUsageCollector,
            OpenAIUsageCollector,
        )

        for collector in (OpenAIUsageCollector, AnthropicUsageCollector):
            shadowed = self._shadowed([row[0] for row in collector._COST_TABLE])
            assert not shadowed, (
                f"{collector.__name__}._COST_TABLE: 구체 prefix 가 generic 뒤에 있어 "
                f"도달 불가: {shadowed}"
            )

    def test_gpt56_variants_are_not_repriced_by_alias_row(self):
        from api.llm_proxy import _calc_cost

        # gpt-5.6 alias 는 $4/$20 — terra/luna 행이 그 뒤에 오면 과대 집계된다.
        assert _calc_cost("gpt-5.6-terra", 1000, 3000) == pytest.approx(0.002 + 3 * 0.012)
        assert _calc_cost("gpt-5.6-luna", 1000, 3000) == pytest.approx(0.0002 + 3 * 0.0012)
        assert _calc_cost("gpt-5.6", 1000, 3000) == pytest.approx(0.004 + 3 * 0.02)

    def test_gpt54_variants_are_not_repriced_by_base_row(self):
        from api.llm_proxy import _calc_cost

        # gpt-5.4 는 $2.5/$15 — mini/nano 행이 그 뒤에 오면 과대 집계된다.
        assert _calc_cost("gpt-5.4-mini", 1000, 3000) == pytest.approx(0.00075 + 3 * 0.0045)
        assert _calc_cost("gpt-5.4-nano", 1000, 3000) == pytest.approx(0.0002 + 3 * 0.00125)
        assert _calc_cost("gpt-5.4", 1000, 3000) == pytest.approx(0.0025 + 3 * 0.015)

    def test_o3_variants_are_not_repriced_by_generic_row(self):
        """o3-mini/o3-pro 는 SSOT 미등재라 드리프트 불변식이 보지 못한다 —
        generic "o3" 행이 이들을 삼키지 않는지 직접 고정한다."""
        from api.llm_proxy import _calc_cost
        from services.external_usage_service.collectors import OpenAIUsageCollector

        for calc in (_calc_cost, OpenAIUsageCollector._calc_cost):
            assert calc("o3-pro", 1000, 3000) == pytest.approx(0.020 + 3 * 0.080)
            assert calc("o3-mini", 1000, 3000) == pytest.approx(0.0011 + 3 * 0.0044)
            assert calc("o3", 1000, 3000) == pytest.approx(0.002 + 3 * 0.008)

    def test_swallowed_variants_keep_their_own_price(self):
        """generic 행이 SSOT 미등재 변종을 삼키던 사례들(2026-09-08 수정).
        전부 레지스트리 밖 id 라 드리프트 불변식이 보지 못한다."""
        from api.llm_proxy import _calc_cost
        from services.external_usage_service.collectors import OpenAIUsageCollector

        for calc in (_calc_cost, OpenAIUsageCollector._calc_cost):
            # o1-pro $150/$600 vs generic o1 $15/$60 — 삼켜지면 10배 과소 집계
            assert calc("o1-pro", 1000, 3000) == pytest.approx(0.150 + 3 * 0.600)
            assert calc("o1", 1000, 3000) == pytest.approx(0.015 + 3 * 0.060)
            # dated 스냅샷은 구 단가를 유지하고, 현행 gpt-4o 는 표준가를 쓴다
            assert calc("gpt-4o-2024-05-13", 1000, 3000) == pytest.approx(0.005 + 3 * 0.015)
            assert calc("gpt-4o", 1000, 3000) == pytest.approx(0.0025 + 3 * 0.010)
            assert calc("gpt-4o-mini", 1000, 3000) == pytest.approx(0.00015 + 3 * 0.0006)

        # Gemini 는 수집기가 없어 llm_proxy 만 해당
        assert _calc_cost("gemini-2.5-flash-lite", 1000, 3000) == pytest.approx(0.0001 + 3 * 0.0004)
        assert _calc_cost("gemini-2.5-flash", 1000, 3000) == pytest.approx(0.0003 + 3 * 0.0025)

    def test_usage_collector_keeps_the_same_variant_ordering(self):
        from services.external_usage_service.collectors import OpenAIUsageCollector

        calc = OpenAIUsageCollector._calc_cost
        assert calc("gpt-5.6-terra", 1000, 3000) == pytest.approx(0.002 + 3 * 0.012)
        assert calc("gpt-5.6-luna", 1000, 3000) == pytest.approx(0.0002 + 3 * 0.0012)
        assert calc("gpt-5.4-nano", 1000, 3000) == pytest.approx(0.0002 + 3 * 0.00125)


class TestDashboardFallbackMirror:
    """settings.ts 의 오프라인 폴백 목록은 자동 동기화가 없는 수동 미러라 조용히
    드리프트한다(2026-09-07 에 enabled 4종 누락으로 실재). 프론트 테스트는 id 를
    손으로 열거하므로 누락을 잡지 못한다 — 백엔드에서 집합 비교로 닫는다."""

    _PROVIDER_KEYS = {
        "anthropic": "anthropic",
        "google": "google",
        "openai": "openai",
        "codex_cli": "codex_cli",
        "claude_cli": "claude_cli",
        "local": "ollama",
    }

    @staticmethod
    def _settings_ts() -> str:
        path = Path(__file__).resolve().parents[2] / "src/dashboard/src/stores/settings.ts"
        assert path.exists(), f"settings.ts 경로가 바뀌었다(이 테스트의 앵커 갱신 필요): {path}"
        return path.read_text(encoding="utf-8")

    def _parse_fallback_models(self, source: str) -> dict[str, list[str]]:
        block = re.search(r"const fallbackModels[^{]*\{(.*?)\n\}", source, re.S)
        assert block, "settings.ts 의 fallbackModels 선언을 찾지 못했다"
        parsed = {}
        for line in block.group(1).strip().splitlines():
            entry = re.match(r"\s*(\w+):\s*\[(.*)\],", line)
            if entry:
                parsed[entry.group(1)] = [
                    x.strip().strip("'") for x in entry.group(2).split(",") if x.strip()
                ]
        # 파싱 가드: 정규식이 빗나가면 빈 dict 로 조용히 통과할 수 있다.
        assert set(parsed) == set(self._PROVIDER_KEYS), f"파싱된 키가 어긋남: {sorted(parsed)}"
        return parsed

    def test_fallback_models_mirror_enabled_registry_models(self):
        parsed = self._parse_fallback_models(self._settings_ts())

        drift = {}
        for key, provider in self._PROVIDER_KEYS.items():
            backend = {m.id for m in _MODELS if m.provider.value == provider and m.is_enabled}
            frontend = set(parsed[key])
            if backend != frontend:
                drift[key] = {
                    "프론트에 없음": sorted(backend - frontend),
                    "백엔드 enabled 아님": sorted(frontend - backend),
                }

        assert not drift, f"settings.ts fallbackModels 미러 드리프트: {drift}"

    def test_fallback_default_ids_mirror_registry_defaults(self):
        source = self._settings_ts()
        # 선언에 앵커를 건다. `fallbackDefaultModelIds` 만으로 찾으면 위쪽 주석의
        # 언급이 먼저 걸려 fallbackModels 배열을 삼킨다(실측).
        block = re.search(
            r"const fallbackDefaultModelIds[^=]*=\s*new Set\(\[(.*?)\]\)", source, re.S
        )
        assert block, "settings.ts 의 fallbackDefaultModelIds 선언을 찾지 못했다"
        frontend = {
            x.strip().strip("'")
            for x in re.sub(r"//[^\n]*", "", block.group(1)).split(",")
            if x.strip()
        }
        # 파싱 가드: 정규식이 빗나가면 선언 밖 텍스트가 섞여 조용히 통과할 수 있다.
        malformed = [x for x in frontend if not re.fullmatch(r"[A-Za-z0-9._:\-]+", x)]
        assert not malformed, f"파싱 결과에 id 가 아닌 항목이 섞였다: {malformed}"
        backend = {m.id for m in _MODELS if m.is_default and m.is_enabled}

        assert frontend == backend, (
            f"default 미러 드리프트: 프론트에 없음={sorted(backend - frontend)}, "
            f"백엔드 default 아님={sorted(frontend - backend)}"
        )


class TestOpenAIStandardTierPricing:
    """공식 가격표는 Standard / Batch / Flex 를 나란히 싣는다. 싼 쪽(Batch·Flex)을
    옮겨 적으면 표준 사용분이 조용히 과소 집계된다 — o4-mini 가 실제로 그랬다."""

    def test_o4_mini_uses_standard_tier_not_batch(self):
        model = next(m for m in _MODELS if m.id == "o4-mini")

        # $0.55/$2.20 은 Batch/Flex 단가다. 표준은 $1.10/$4.40.
        assert model.input_price == pytest.approx(0.0011)
        assert model.output_price == pytest.approx(0.0044)


class TestProxyUsageExtraction:
    """비용표에 행이 있어도 응답에서 모델 id 를 못 읽으면 _calc_cost 는 "unknown" 을
    받아 0.0 을 돌려준다. Gemini 응답은 top-level "model" 이 없고 modelVersion 만 준다
    — 이 한 칸이 비면 COST_TABLE 의 gemini 행 전체가 죽은 코드가 된다."""

    def test_gemini_model_id_comes_from_model_version(self):
        from api.llm_proxy import _calc_cost, _extract_usage

        response = {
            "modelVersion": "gemini-3.7-flash",
            "usageMetadata": {"promptTokenCount": 1000, "candidatesTokenCount": 3000},
        }
        in_tok, out_tok, model = _extract_usage("google_gemini", response)

        assert (in_tok, out_tok) == (1000, 3000)
        assert model == "gemini-3.7-flash"
        # 비용표까지 실제로 이어지는지 — 0.0 이면 gemini 행이 도달 불가라는 뜻이다.
        # 단가는 날짜에서 유도한다(2027-01-01 예고 인상). 박아 두면 발효일 갱신
        # 후에도 이 테스트가 남아 스위트가 초록으로 돌아오지 못한다.
        price_in, price_out = _expected_gemini_flash_price(datetime.now(UTC).date())
        expected = price_in * (in_tok / 1000) + price_out * (out_tok / 1000)
        assert _calc_cost(model, in_tok, out_tok) == pytest.approx(expected)

    def test_openai_and_anthropic_keep_reading_top_level_model(self):
        from api.llm_proxy import _extract_usage

        openai_resp = {"model": "gpt-5.6", "usage": {"prompt_tokens": 1, "completion_tokens": 2}}
        anthropic_resp = {
            "model": "claude-sonnet-5",
            "usage": {"input_tokens": 1, "output_tokens": 2},
        }

        assert _extract_usage("openai", openai_resp)[2] == "gpt-5.6"
        assert _extract_usage("anthropic", anthropic_resp)[2] == "claude-sonnet-5"


# ─────────────────────────────────────────────────────────────
# (g) 예고된 가격 변경 — 발효일에 스스로 RED 가 되는 가드
# ─────────────────────────────────────────────────────────────


def _gemini_flash_price_mismatches(today: date) -> list[tuple[str, str, tuple, tuple]]:
    """레지스트리·COST_TABLE 이 그날 유효한 단가와 어긋나는 지점."""
    from api.llm_proxy import COST_TABLE

    expected = _expected_gemini_flash_price(today)
    mismatches: list[tuple[str, str, tuple, tuple]] = []

    index = {m.id: m for m in _MODELS}
    for model_id in _GEMINI_FLASH_IDS:
        model = index[model_id]
        actual = (model.input_price, model.output_price)
        if actual != pytest.approx(expected):
            mismatches.append(("_MODELS", model_id, expected, actual))

    table = {row[0]: (row[1], row[2]) for row in COST_TABLE}
    for model_id in _GEMINI_FLASH_IDS:
        actual = table[model_id]
        if actual != pytest.approx(expected):
            mismatches.append(("COST_TABLE", model_id, expected, actual))

    return mismatches


class TestGeminiFlashScheduledPriceChange:
    """Gemini 3.x Flash 는 2027-01-01 부터 단가가 2배가 된다고 공식 고지돼 있다.
    그날 갱신을 잊으면 절반 가격으로 조용히 집계되므로 게이트가 기억한다."""

    def test_two_tiers_are_actually_different(self):
        """두 티어가 같으면 이 가드는 아무것도 지키지 못한다."""
        # 경계 날짜는 상수에서 유도한다 — 하드코딩하면 발효일을 옮길 때
        # 이 sanity 테스트가 같이 깨져 진짜 신호를 가린다.
        day_before = GEMINI_FLASH_PRICE_CHANGE - timedelta(days=1)

        assert _GEMINI_FLASH_PRICE_BEFORE != _GEMINI_FLASH_PRICE_ON_OR_AFTER
        assert _expected_gemini_flash_price(day_before) == _GEMINI_FLASH_PRICE_BEFORE
        assert _expected_gemini_flash_price(GEMINI_FLASH_PRICE_CHANGE) == (
            _GEMINI_FLASH_PRICE_ON_OR_AFTER
        )

    def test_prices_match_the_tier_in_effect_today(self):
        """발효일이 지나면 여기서 실패한다. 조치는 두 곳을 새 단가로 올리는 것:
        `models/llm_models.py` 의 gemini-3.8/3.7-flash 항목과
        `api/llm_proxy.py` COST_TABLE 의 같은 두 행."""
        today = datetime.now(UTC).date()

        mismatches = _gemini_flash_price_mismatches(today)

        assert not mismatches, (
            f"{today} 기준 Gemini Flash 단가가 어긋난다(발효일 "
            f"{GEMINI_FLASH_PRICE_CHANGE}). (위치, 모델, 기대, 실제): {mismatches}"
        )
