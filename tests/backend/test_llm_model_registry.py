"""Tests for claude-sonnet-5 registry entry, sync_to_db dual-default guard, and pricing."""

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
        assert LLMModelRegistry.get_default("anthropic") == "claude-sonnet-5"

    def test_anthropic_has_exactly_one_code_default(self):
        defaults = [
            m.id
            for m in _MODELS
            if m.provider == LLMProvider.ANTHROPIC and m.is_default
        ]
        assert defaults == ["claude-sonnet-5"]


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


@pytest.mark.asyncio
async def test_sync_to_db_new_default_demoted_when_db_default_exists():
    """New is_default=True model must INSERT as is_default=False when the
    provider already has a default row in DB (existing DB default respected)."""
    session = _FakeSession(
        select_results=[
            _FakeResult([]),  # suppressed ids (none)
            # existing IDs: sonnet-5 is NEW, sonnet-4-6 already exists
            _FakeResult([("claude-sonnet-4-6",), ("claude-opus-4-8",)]),
            # providers that already have a DB default row
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
async def test_sync_to_db_new_default_kept_when_no_db_default():
    """New is_default=True model keeps is_default=True when the provider has
    no default row in DB."""
    session = _FakeSession(
        select_results=[
            _FakeResult([]),  # suppressed ids (none)
            _FakeResult([("claude-sonnet-4-6",)]),  # sonnet-5 is NEW
            _FakeResult([]),  # no provider has a DB default
            _FakeResult([]),  # final load_from_db select
        ]
    )

    await LLMModelRegistry.sync_to_db(session)

    params = _insert_params(_find_insert(session, "claude-sonnet-5"))
    assert params["is_default"] is True


@pytest.mark.asyncio
async def test_sync_to_db_default_guard_ignores_disabled_db_defaults():
    """The dual-default guard must only count ENABLED default rows: a provider
    whose only DB default is disabled still accepts the new code default."""
    session = _FakeSession(
        select_results=[
            _FakeResult([]),  # suppressed ids (none)
            _FakeResult([("claude-sonnet-4-6",)]),  # sonnet-5 is NEW
            # Guard select returns no providers: the anthropic default row in
            # DB is disabled, so the is_enabled filter excludes it.
            _FakeResult([]),
            _FakeResult([]),  # final load_from_db select
        ]
    )

    await LLMModelRegistry.sync_to_db(session)

    # The guard query itself must filter on BOTH is_default and is_enabled.
    # selects[0]=suppressed ids, [1]=existing ids, [2]=providers_with_db_default.
    guard_select = session.selects[2]
    sql = str(guard_select.compile(dialect=postgresql.dialect()))
    assert "is_default" in sql
    assert "is_enabled" in sql

    # And the new model keeps its code-level default flag
    params = _insert_params(_find_insert(session, "claude-sonnet-5"))
    assert params["is_default"] is True


@pytest.mark.asyncio
async def test_sync_to_db_clears_stale_disabled_default_before_new_default_insert():
    """disable→sync→re-enable 시나리오: 구 default(예: sonnet-4-6)가 disabled인
    상태에서 sync가 신규 default(sonnet-5)를 INSERT하면, 구 행의 is_default를
    False로 클리어하는 UPDATE가 함께 발행되어야 한다 — 이후 admin이 구 행을
    re-enable해도 provider default가 2개가 되지 않도록."""
    session = _FakeSession(
        select_results=[
            _FakeResult([]),  # suppressed ids (none)
            _FakeResult([("claude-sonnet-4-6",)]),  # sonnet-5 is NEW
            # anthropic의 유일한 default 행이 disabled → enabled 필터에 걸러져
            # 가드 통과 (신규 모델이 default로 INSERT되는 경로)
            _FakeResult([]),
            _FakeResult([]),  # final load_from_db select
        ]
    )

    await LLMModelRegistry.sync_to_db(session)

    # 신규 모델은 default로 INSERT됨
    params = _insert_params(_find_insert(session, "claude-sonnet-5"))
    assert params["is_default"] is True

    # anthropic provider의 잔존 default 행을 클리어하는 UPDATE 발행 확인
    anthropic_clears = []
    for stmt in session.updates:
        compiled = stmt.compile(dialect=postgresql.dialect())
        if (
            "anthropic" in compiled.params.values()
            and compiled.params.get("is_default") is False
        ):
            anthropic_clears.append(str(compiled))
    assert anthropic_clears, "expected is_default-clearing UPDATE for anthropic"
    sql = anthropic_clears[0]
    assert "SET is_default" in sql
    # 클리어 UPDATE는 is_default만 만지고 enable 상태는 건드리지 않는다
    assert "is_enabled" not in sql.split("SET", 1)[1].split("WHERE", 1)[0]
    # WHERE절이 is_enabled=False 조건을 포함해야 한다: 가드 SELECT와 이
    # UPDATE 사이에 admin이 구 default를 re-enable하는 경쟁(READ COMMITTED)
    # 에서도 "disabled default만 정리" 불변식이 SQL 자체로 보장되도록.
    where_clause = sql.split("WHERE", 1)[1]
    assert "is_enabled IS false" in where_clause


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
