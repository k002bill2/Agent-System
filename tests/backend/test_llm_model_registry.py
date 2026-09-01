"""Tests for claude-sonnet-5 registry entry, sync_to_db dual-default guard, and pricing."""

import logging

import pytest
from sqlalchemy import Delete, Update
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql.dml import Insert

from models.llm_models import _MODELS, LLMModelRegistry, LLMProvider


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
        assert model.input_price == 0.003  # $3/1M tokens (per-1k)
        assert model.output_price == 0.015  # $15/1M tokens (per-1k)
        assert model.supports_tools is True
        assert model.supports_vision is True
        assert model.is_enabled is True

    def test_sonnet5_is_anthropic_code_default(self):
        # 후속 정책 2026-09-01 (plan §5): 검증된 claude-sonnet-5 를
        # anthropic code default 로 복원한다.
        assert LLMModelRegistry.get_default("anthropic") == "claude-sonnet-5"

    def test_anthropic_has_exactly_one_code_default(self):
        defaults = [
            m.id
            for m in _MODELS
            if m.provider == LLMProvider.ANTHROPIC and m.is_default
        ]
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
        defaults = [
            m.id
            for m in _MODELS
            if m.provider == LLMProvider.OPENAI and m.is_default
        ]
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
        assert model.input_price == 0.00075  # $0.75/1M tokens (per-1k)
        assert model.output_price == 0.00375  # $3.75/1M tokens (per-1k)
        assert model.supports_tools is True
        assert model.supports_vision is True
        assert model.is_enabled is True

    def test_gemini37_flash_is_google_code_default(self):
        assert LLMModelRegistry.get_default("google") == "gemini-3.7-flash"

    def test_google_has_exactly_one_code_default(self):
        defaults = [
            m.id
            for m in _MODELS
            if m.provider == LLMProvider.GOOGLE and m.is_default
        ]
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
            assert len(defaults) == 1, (
                f"{provider.value}: defaults={[m.id for m in defaults]}"
            )
            assert defaults[0].is_enabled, (
                f"{provider.value}: default {defaults[0].id} is disabled"
            )

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
        defaults = [
            m.id
            for m in _MODELS
            if m.provider == LLMProvider.CLAUDE_CLI and m.is_default
        ]
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
    assert session.updates == [], (
        "sync must not clear/override admin flags on existing rows"
    )


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
        assert cost == pytest.approx(0.003 + 0.015)
        assert cost > 0.0

    def test_opus_4_8_matches_before_legacy_opus_4(self):
        from api.llm_proxy import _calc_cost

        # Must hit the claude-opus-4-8 row ($5/$25), not claude-opus-4 ($15/$75)
        assert _calc_cost("claude-opus-4-8", 1000, 1000) == pytest.approx(0.005 + 0.025)

    def test_haiku_4_5_matches_before_legacy_haiku_4(self):
        from api.llm_proxy import _calc_cost

        # Must hit the claude-haiku-4-5 row ($1/$5), not claude-haiku-4
        assert _calc_cost("claude-haiku-4-5-20251001", 1000, 1000) == pytest.approx(
            0.001 + 0.005
        )

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
