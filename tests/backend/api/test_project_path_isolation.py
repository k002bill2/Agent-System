"""Workspace isolation for `PUT /api/projects/{id}` path changes.

The stored path is not metadata. It decides which directory the context,
diagnostics and monitoring routes read, and `checks/run-all` executes the
commands it finds in that directory's `.aos-project.json` with `cwd` set to it
(`services/project_runner.py`). Before those routes were unblocked in database
mode this write was inert; now an unchecked repoint is a read-and-execute
primitive against any directory the backend can reach.
"""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

pytestmark = pytest.mark.asyncio


class _Rows:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _Db:
    """Serves the one `select(ProjectModel.id, ProjectModel.path)` the guard runs."""

    def __init__(self, rows=()):
        self._rows = list(rows)

    async def execute(self, _stmt):
        return _Rows(self._rows)


def _user(user_id="u1"):
    return SimpleNamespace(id=user_id, role="user", is_admin=False, is_active=True)


async def test_path_change_requires_owner_not_editor(monkeypatch, tmp_path):
    """An editor may rename a project; repointing its workspace is an owner act."""
    from api import routes as routes_module

    monkeypatch.setenv("USE_DATABASE", "true")
    asked = []

    async def record_role(project_id, current_user, db, min_role="viewer"):
        asked.append(min_role)
        if min_role == "owner":
            raise HTTPException(status_code=403, detail="Requires at least 'owner' role")
        return min_role

    monkeypatch.setattr(routes_module, "require_project_role", record_role)

    with pytest.raises(HTTPException) as exc_info:
        await routes_module._validate_project_path_change(
            "proj-a", str(tmp_path), _user(), _Db()
        )

    assert exc_info.value.status_code == 403
    assert asked == ["owner"]


async def test_path_change_rejects_another_projects_workspace(monkeypatch, tmp_path):
    """Two ids must not share one directory - project ACLs would mean nothing.

    Owner of A repointing A at B's directory would read B's CLAUDE.md and run
    B's configured check commands through A's id.
    """
    from api import routes as routes_module

    monkeypatch.setenv("USE_DATABASE", "true")

    async def allow(project_id, current_user, db, min_role="viewer"):
        return "owner"

    monkeypatch.setattr(routes_module, "require_project_role", allow)
    other = tmp_path / "project-b"
    other.mkdir()

    with pytest.raises(HTTPException) as exc_info:
        await routes_module._validate_project_path_change(
            "proj-a", str(other), _user(), _Db([("proj-b", str(other))])
        )

    assert exc_info.value.status_code == 409


async def test_path_change_rejects_a_nonexistent_directory(monkeypatch, tmp_path):
    """The DB branch used to store `request.path` raw, unlike the POST branch."""
    from api import routes as routes_module

    monkeypatch.setenv("USE_DATABASE", "true")
    monkeypatch.setattr(routes_module, "IS_DOCKER", False)

    async def allow(project_id, current_user, db, min_role="viewer"):
        return "owner"

    monkeypatch.setattr(routes_module, "require_project_role", allow)

    with pytest.raises(HTTPException) as exc_info:
        await routes_module._validate_project_path_change(
            "proj-a", str(tmp_path / "missing"), _user(), _Db()
        )

    assert exc_info.value.status_code == 400


async def test_owner_may_keep_the_projects_own_path(monkeypatch, tmp_path):
    """The collision check must not reject a project's existing directory."""
    from api import routes as routes_module

    monkeypatch.setenv("USE_DATABASE", "true")

    async def allow(project_id, current_user, db, min_role="viewer"):
        return "owner"

    monkeypatch.setattr(routes_module, "require_project_role", allow)

    result = await routes_module._validate_project_path_change(
        "proj-a", str(tmp_path), _user(), _Db([("proj-a", str(tmp_path))])
    )

    assert result == str(tmp_path)


async def test_shell_escapes_are_normalized(monkeypatch, tmp_path):
    r"""Paths pasted from a terminal carry backslash escapes ("Mobile\ Documents")."""
    from api import routes as routes_module

    monkeypatch.setenv("USE_DATABASE", "true")

    async def allow(project_id, current_user, db, min_role="viewer"):
        return "owner"

    monkeypatch.setattr(routes_module, "require_project_role", allow)
    spaced = tmp_path / "My Project"
    spaced.mkdir()

    result = await routes_module._validate_project_path_change(
        "proj-a", str(spaced).replace(" ", "\\ "), _user(), _Db()
    )

    assert result == str(spaced)
