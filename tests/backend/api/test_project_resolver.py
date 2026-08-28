"""`api.deps.resolve_project` — the DB-mode project registry bridge.

Database mode mints `ProjectModel.id` as a UUID while the in-memory
`PROJECTS_REGISTRY` is keyed by the `projects/<name>` symlink directory, so the
two id spaces never overlap. Every filesystem-backed project route used to read
only the latter, which is why PR #318 could put a blanket 503 on them without
anyone noticing the routes were already 404-ing. These lock the bridge.
"""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

pytestmark = pytest.mark.asyncio


class _Result:
    def __init__(self, row):
        self._row = row

    def scalar_one_or_none(self):
        return self._row


class _Db:
    """Minimal async session stand-in that counts round trips."""

    def __init__(self, row=None, error: Exception | None = None):
        self._row = row
        self._error = error
        self.executed = 0

    async def execute(self, _stmt):
        self.executed += 1
        if self._error is not None:
            raise self._error
        return _Result(self._row)


def _row(tmp_path, **overrides):
    base = {
        "id": "05c4302d-9602-4b70-8267-65964f5bed4d",
        "name": "DB Project",
        "path": str(tmp_path),
        "description": "from the DB registry",
        "organization_id": None,
        "settings": {},
    }
    base.update(overrides)
    return SimpleNamespace(**base)


async def test_database_row_gains_its_filesystem_fields(monkeypatch, tmp_path):
    """The DB row has no CLAUDE.md or git columns — rebuild them from the path.

    `/projects/{id}/claude-md` reads `claude_md` and the diagnostics git
    category reads `git_enabled`; a bare `Project(**db_columns)` answers 404 and
    "git not configured" for a project that has both.
    """
    from api.deps import resolve_project

    (tmp_path / "CLAUDE.md").write_text("# Instructions\n", encoding="utf-8")
    (tmp_path / ".git").mkdir()
    monkeypatch.setenv("USE_DATABASE", "true")

    project = await resolve_project("05c4302d-9602-4b70-8267-65964f5bed4d", _Db(_row(tmp_path)))

    assert project is not None
    assert project.claude_md == "# Instructions\n"
    assert project.git_enabled is True


async def test_database_columns_win_over_the_on_disk_metadata(monkeypatch, tmp_path):
    """`.aos-project.json` is a cache; the DB registry is the source of truth."""
    from api.deps import resolve_project

    (tmp_path / ".aos-project.json").write_text(
        '{"name": "Stale Name", "description": "stale"}', encoding="utf-8"
    )
    monkeypatch.setenv("USE_DATABASE", "true")

    project = await resolve_project(
        "05c4302d-9602-4b70-8267-65964f5bed4d",
        _Db(_row(tmp_path, organization_id="org-9")),
    )

    assert project is not None
    assert project.name == "DB Project"
    assert project.description == "from the DB registry"
    assert project.organization_id == "org-9"


async def test_pathless_row_does_not_resolve(monkeypatch, tmp_path):
    """`ProjectModel.path` is nullable — an empty path must not become CWD.

    A `Project(path="")` handed to the diagnostics or monitoring service sends
    it walking the backend's own working directory and reporting that as the
    project's workspace.
    """
    from api.deps import resolve_project

    monkeypatch.setenv("USE_DATABASE", "true")

    assert await resolve_project("uuid", _Db(_row(tmp_path, path=None))) is None
    assert await resolve_project("uuid", _Db(_row(tmp_path, path="   "))) is None


async def test_unknown_id_resolves_to_none(monkeypatch, tmp_path):
    from api.deps import resolve_project

    monkeypatch.setenv("USE_DATABASE", "true")

    assert await resolve_project("ghost", _Db(None)) is None


async def test_registry_lookup_failure_is_a_controlled_503(monkeypatch):
    """A broken registry query must not surface as a 500 or a silent 404."""
    from api.deps import resolve_project

    monkeypatch.setenv("USE_DATABASE", "true")

    with pytest.raises(HTTPException) as exc_info:
        await resolve_project("uuid", _Db(error=RuntimeError("connection reset")))

    assert exc_info.value.status_code == 503


async def test_memory_mode_uses_the_filesystem_registry_only(monkeypatch, tmp_path):
    """Memory mode keeps its registry-only behaviour — no new DB round trip."""
    from api.deps import resolve_project
    from models.project import Project

    monkeypatch.setenv("USE_DATABASE", "false")
    registry_project = Project(id="obsidian", name="Obsidian", path=str(tmp_path))
    monkeypatch.setattr("models.project.get_project", lambda pid: registry_project)

    db = _Db(_row(tmp_path))
    project = await resolve_project("obsidian", db)

    assert project is registry_project
    assert db.executed == 0


async def test_get_project_or_404_raises_for_an_unresolvable_id(monkeypatch):
    from api.deps import get_project_or_404

    monkeypatch.setenv("USE_DATABASE", "true")

    with pytest.raises(HTTPException) as exc_info:
        await get_project_or_404("ghost", _Db(None))

    assert exc_info.value.status_code == 404
