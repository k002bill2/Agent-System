"""DELETE endpoint tests for LLM model hard-delete + un-suppress.

Contract (frontend builds against this):
- DELETE /api/llm/models/{id}              → 200 ModelDeleteResponse | 401/403/404/409/501
- DELETE /api/llm/models/suppressions/{id} → 200 SuppressionDeleteResponse | 401/403/404/501

``api.llm.USE_DATABASE`` is a module constant read at call time; conftest sets it
false, so 501 is exercised without patching and the other paths patch it True.
The DB session and auth user are injected via FastAPI dependency overrides with
lightweight fakes (no real DB in the test env).
"""

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import Select
from sqlalchemy.dialects import postgresql

from api.deps import get_current_user_optional
from api.llm import router
from db.database import get_db
from models.llm_models import LLMModelRegistry

_ADMIN = SimpleNamespace(id="admin-1", role="admin", is_admin=True, is_active=True)
_NON_ADMIN = SimpleNamespace(id="user-1", role="user", is_admin=False, is_active=True)
_INACTIVE_ADMIN = SimpleNamespace(id="admin-2", role="admin", is_admin=True, is_active=False)
_SUPPRESSED_AT = datetime(2026, 7, 12, 4, 30, tzinfo=timezone.utc)


def _insert_params(stmt) -> dict:
    return stmt.compile(dialect=postgresql.dialect()).params


def _find_insert(db: "_FakeDB"):
    for stmt in db.executed:
        if type(stmt).__name__ == "Insert":
            return stmt
    raise AssertionError("no Insert statement captured")


# ─────────────────────────────────────────────────────────────
# Fake DB session: returns queued results for SELECTs, no-ops writes
# ─────────────────────────────────────────────────────────────


class _Result:
    def __init__(self, scalar=None, scalars_list=None):
        self._scalar = scalar
        self._scalars_list = scalars_list or []

    def scalar_one_or_none(self):
        return self._scalar

    def scalars(self):
        return self

    def all(self):
        return self._scalars_list


class _FakeDB:
    def __init__(self, select_results: list[_Result]):
        self._select_results = list(select_results)
        self.executed: list = []
        self.committed = False

    async def execute(self, stmt):
        self.executed.append(stmt)
        if isinstance(stmt, Select):
            return self._select_results.pop(0)
        return _Result()  # Insert / Delete / Update

    async def commit(self):
        self.committed = True

    def stmt_names(self) -> list[str]:
        return [type(s).__name__ for s in self.executed]


@pytest.fixture(autouse=True)
def _reset_registry_cache():
    """Isolate the module-global registry cache: tests here drive load_from_db,
    which mutates _db_cache/_db_index."""
    original_cache = LLMModelRegistry._db_cache
    original_index = LLMModelRegistry._db_index
    yield
    LLMModelRegistry._db_cache = original_cache
    LLMModelRegistry._db_index = original_index


@pytest.fixture
def app() -> FastAPI:
    test_app = FastAPI()
    test_app.include_router(router)
    return test_app


@pytest_asyncio.fixture
async def make_client(app: FastAPI):
    async def _make(db: _FakeDB | None, user) -> AsyncClient:
        if db is not None:
            app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_user_optional] = lambda: user
        return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")

    yield _make
    app.dependency_overrides.clear()


# ─────────────────────────────────────────────────────────────
# DELETE /api/llm/models/{model_id}
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_model_success(monkeypatch, make_client):
    monkeypatch.setattr("api.llm.USE_DATABASE", True)
    db_model = SimpleNamespace(id="gpt-5.4-nano", provider="openai", is_default=False)
    suppression = SimpleNamespace(
        model_id="gpt-5.4-nano",
        provider="openai",
        reason="admin deletion",
        suppressed_at=_SUPPRESSED_AT,
    )
    # load_from_db reload returns the REMAINING models (deleted one absent),
    # exercising the real reload path → registry.get_by_id(deleted) is None.
    remaining = SimpleNamespace(
        id="claude-sonnet-5",
        display_name="Claude Sonnet 5",
        provider="anthropic",
        context_window=1_000_000,
        input_price=0.003,
        output_price=0.015,
        is_default=True,
        is_enabled=True,
        supports_tools=True,
        supports_vision=True,
    )
    db = _FakeDB(
        select_results=[
            _Result(scalar=db_model),                # SELECT config row (FOR UPDATE)
            _Result(scalar=suppression),             # read-back suppression
            _Result(scalars_list=[remaining]),       # load_from_db reload
        ]
    )
    client = await make_client(db, _ADMIN)
    async with client:
        resp = await client.delete("/llm/models/gpt-5.4-nano")

    assert resp.status_code == 200
    body = resp.json()
    assert body["model_id"] == "gpt-5.4-nano"
    assert body["provider"] == "openai"
    assert body["reason"] == "admin deletion"
    assert body["suppressed_at"].startswith("2026-07-12T04:30:00")
    # A suppression Insert and a config Delete were issued, then committed.
    assert "Insert" in db.stmt_names()
    assert "Delete" in db.stmt_names()
    assert db.committed is True
    # The suppression row is recorded with the right id/provider/reason.
    insert_params = _insert_params(_find_insert(db))
    assert insert_params["model_id"] == "gpt-5.4-nano"
    assert insert_params["provider"] == "openai"
    assert insert_params["reason"] == "admin deletion"
    # After reload, the hard-deleted model is gone from the registry cache.
    assert LLMModelRegistry.get_by_id("gpt-5.4-nano") is None
    assert LLMModelRegistry.get_by_id("claude-sonnet-5") is not None


@pytest.mark.asyncio
async def test_delete_model_suppression_readback_none_stays_200(monkeypatch, make_client):
    """P2: if the suppression row is not readable (a concurrent un-suppress
    removed it mid-transaction), the endpoint must NOT 500 — it falls back to the
    just-written values and still returns 200."""
    monkeypatch.setattr("api.llm.USE_DATABASE", True)
    db_model = SimpleNamespace(id="gpt-5.4-nano", provider="openai", is_default=False)
    db = _FakeDB(
        select_results=[
            _Result(scalar=db_model),   # SELECT config FOR UPDATE
            _Result(scalar=None),       # suppression readback → None (raced away)
            _Result(scalars_list=[]),   # load_from_db
        ]
    )
    client = await make_client(db, _ADMIN)
    async with client:
        resp = await client.delete("/llm/models/gpt-5.4-nano")

    assert resp.status_code == 200
    body = resp.json()
    assert body["model_id"] == "gpt-5.4-nano"
    assert body["provider"] == "openai"
    assert body["reason"] == "admin deletion"  # fallback to just-written value
    assert body["suppressed_at"]  # well-formed fallback timestamp, not null
    assert db.committed is True


@pytest.mark.asyncio
async def test_delete_model_not_found(monkeypatch, make_client):
    monkeypatch.setattr("api.llm.USE_DATABASE", True)
    db = _FakeDB(select_results=[_Result(scalar=None)])
    client = await make_client(db, _ADMIN)
    async with client:
        resp = await client.delete("/llm/models/does-not-exist")

    assert resp.status_code == 404
    assert "not found in DB" in resp.json()["detail"]
    assert db.committed is False


@pytest.mark.asyncio
async def test_delete_model_default_conflict(monkeypatch, make_client):
    monkeypatch.setattr("api.llm.USE_DATABASE", True)
    db_model = SimpleNamespace(id="claude-sonnet-5", provider="anthropic", is_default=True)
    db = _FakeDB(select_results=[_Result(scalar=db_model)])
    client = await make_client(db, _ADMIN)
    async with client:
        resp = await client.delete("/llm/models/claude-sonnet-5")

    assert resp.status_code == 409
    assert "default model" in resp.json()["detail"]
    assert db.committed is False


@pytest.mark.asyncio
async def test_delete_model_unauthenticated(monkeypatch, make_client):
    monkeypatch.setattr("api.llm.USE_DATABASE", True)
    client = await make_client(_FakeDB([]), None)
    async with client:
        resp = await client.delete("/llm/models/gpt-5.4-nano")

    assert resp.status_code == 401
    assert resp.json()["detail"] == "Not authenticated"


@pytest.mark.asyncio
async def test_delete_model_forbidden_non_admin(monkeypatch, make_client):
    monkeypatch.setattr("api.llm.USE_DATABASE", True)
    client = await make_client(_FakeDB([]), _NON_ADMIN)
    async with client:
        resp = await client.delete("/llm/models/gpt-5.4-nano")

    assert resp.status_code == 403
    assert resp.json()["detail"] == "Admin access required"


@pytest.mark.asyncio
async def test_delete_model_forbidden_inactive_admin(monkeypatch, make_client):
    # M1: a deactivated admin must not retain destructive privileges → 403.
    monkeypatch.setattr("api.llm.USE_DATABASE", True)
    client = await make_client(_FakeDB([]), _INACTIVE_ADMIN)
    async with client:
        resp = await client.delete("/llm/models/gpt-5.4-nano")

    assert resp.status_code == 403
    assert resp.json()["detail"] == "User is inactive"


@pytest.mark.asyncio
async def test_delete_model_requires_db_mode(make_client):
    # USE_DATABASE stays false (conftest default) → 501 before any DB access.
    client = await make_client(_FakeDB([]), _ADMIN)
    async with client:
        resp = await client.delete("/llm/models/gpt-5.4-nano")

    assert resp.status_code == 501
    assert "DB mode required" in resp.json()["detail"]


# ─────────────────────────────────────────────────────────────
# DELETE /api/llm/models/suppressions/{model_id}
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_unsuppress_success(monkeypatch, make_client):
    monkeypatch.setattr("api.llm.USE_DATABASE", True)
    suppression = SimpleNamespace(model_id="gpt-5.4-nano", provider="openai")
    db = _FakeDB(select_results=[_Result(scalar=suppression)])
    client = await make_client(db, _ADMIN)
    async with client:
        resp = await client.delete("/llm/models/suppressions/gpt-5.4-nano")

    assert resp.status_code == 200
    assert resp.json() == {"model_id": "gpt-5.4-nano", "unsuppressed": True}
    assert "Delete" in db.stmt_names()
    assert db.committed is True


@pytest.mark.asyncio
async def test_unsuppress_not_found(monkeypatch, make_client):
    monkeypatch.setattr("api.llm.USE_DATABASE", True)
    db = _FakeDB(select_results=[_Result(scalar=None)])
    client = await make_client(db, _ADMIN)
    async with client:
        resp = await client.delete("/llm/models/suppressions/never-suppressed")

    assert resp.status_code == 404
    assert "No suppression found" in resp.json()["detail"]
    assert db.committed is False


# ─────────────────────────────────────────────────────────────
# PATCH /api/llm/models/{model_id} — row lock must not break the happy path
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_patch_model_success_with_row_lock(monkeypatch, make_client):
    """P1: the target row is now selected FOR UPDATE. Confirm the lock does not
    break the PATCH happy path — it stays a Select the session serves → 200."""
    monkeypatch.setattr("api.llm.USE_DATABASE", True)
    db_model = SimpleNamespace(id="gpt-4o", provider="openai", is_default=False)
    reloaded = SimpleNamespace(
        id="gpt-4o",
        display_name="GPT-4o Renamed",
        provider="openai",
        context_window=128000,
        input_price=0.005,
        output_price=0.015,
        is_default=False,
        is_enabled=True,
        supports_tools=True,
        supports_vision=True,
    )
    db = _FakeDB(
        select_results=[
            _Result(scalar=db_model),          # SELECT config FOR UPDATE
            _Result(scalars_list=[reloaded]),  # load_from_db reload
        ]
    )
    client = await make_client(db, _ADMIN)
    async with client:
        resp = await client.patch("/llm/models/gpt-4o", json={"display_name": "GPT-4o Renamed"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == "gpt-4o"
    assert body["display_name"] == "GPT-4o Renamed"
    assert db.committed is True
