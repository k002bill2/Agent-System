"""Regression guard (b): model discovery must not re-INSERT suppressed models.

After a hard delete, the model is absent from the registry, so ``_diff_models``
legitimately reports it as "new". The suppression guard lives at the INSERT
point in ``_apply_changes`` — this test drives a suppressed id through that path
and asserts it is skipped while a genuinely new model still inserts.
"""

import pytest
from sqlalchemy import Select
from sqlalchemy.dialects import postgresql


class _FakeResult:
    def __init__(self, rows: list[tuple] | None = None):
        self._rows = rows or []

    def fetchall(self) -> list[tuple]:
        return self._rows

    def scalars(self):  # for load_from_db select
        return self

    def all(self) -> list:
        return []


class _FakeSession:
    """Serves the suppressed-ids SELECT; captures inserts/updates."""

    def __init__(self, suppressed_rows: list[tuple]):
        self._suppressed_rows = suppressed_rows
        self.inserts: list = []
        self.updates: list = []
        self.deletes: list = []
        self.committed = False

    async def execute(self, stmt):
        if isinstance(stmt, Select):
            return _FakeResult(self._suppressed_rows)
        # pg_insert Insert / core Update / core Delete
        name = type(stmt).__name__
        if name == "Insert":
            self.inserts.append(stmt)
        elif name == "Update":
            self.updates.append(stmt)
        elif name == "Delete":
            self.deletes.append(stmt)
        return _FakeResult()

    async def commit(self):
        self.committed = True


class _CtxManager:
    def __init__(self, session: _FakeSession):
        self._session = session

    async def __aenter__(self) -> _FakeSession:
        return self._session

    async def __aexit__(self, *exc) -> bool:
        return False


def _make_factory(session: _FakeSession):
    def factory():
        return _CtxManager(session)

    return factory


def _insert_params(stmt) -> dict:
    return stmt.compile(dialect=postgresql.dialect()).params


@pytest.mark.asyncio
async def test_apply_changes_skips_suppressed_new_model(monkeypatch):
    from services.model_update_service import ModelChange, ModelUpdateService

    session = _FakeSession(suppressed_rows=[("gpt-5.4-nano",)])
    # _apply_changes imports async_session_factory lazily from db.database,
    # so patch it at the source module.
    monkeypatch.setattr(
        "db.database.async_session_factory",
        _make_factory(session),
    )

    new_models = [
        ModelChange(
            model_id="gpt-5.4-nano",  # suppressed → must be skipped
            change_type="new",
            new_value={"display_name": "GPT-5.4 Nano", "provider": "openai"},
        ),
        ModelChange(
            model_id="brand-new-model",  # not suppressed → must insert
            change_type="new",
            new_value={"display_name": "Brand New", "provider": "openai"},
        ),
    ]

    await ModelUpdateService._apply_changes(new_models, [])

    inserted_ids = {_insert_params(s).get("id") for s in session.inserts}
    assert "gpt-5.4-nano" not in inserted_ids
    assert "brand-new-model" in inserted_ids
    assert session.committed is True


@pytest.mark.asyncio
async def test_apply_changes_self_heals_suppressed_config_rows(monkeypatch):
    """P1-2 self-heal: _apply_changes must issue a bulk DELETE removing config
    rows whose id is suppressed (race recovery). Verified at the statement level:
    DELETE FROM llm_model_configs filtered by the suppressions subquery, with
    synchronize_session=False so a real Postgres run won't raise."""
    from services.model_update_service import ModelUpdateService

    session = _FakeSession(suppressed_rows=[("gpt-5.4-nano",)])
    monkeypatch.setattr(
        "db.database.async_session_factory",
        _make_factory(session),
    )

    await ModelUpdateService._apply_changes([], [])

    assert session.deletes, "expected a self-heal DELETE on llm_model_configs"
    compiled = session.deletes[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "DELETE FROM llm_model_configs" in sql
    assert "llm_model_suppressions" in sql
    assert (
        session.deletes[0].get_execution_options().get("synchronize_session") is False
    )
