"""DB 모드에서 세션 생성은 파일시스템 슬러그로 프로젝트 인가를 우회할 수 없다.

`_resolve_project_context` 는 `get_project()`(in-memory `PROJECTS_REGISTRY`)를 먼저
조회하고 히트하면 `require_project_role` 전에 return 했다. `app.py` 가 DB 모드에서도
`projects/` 심링크 스캔을 돌리므로(`7ed7c46`) 그 레지스트리는 비어 있지 않고,
심링크 이름만 알면 DB 미등록 프로젝트를 세션에 붙일 수 있었다.

라우트 전체(프레임워크 배선 포함)를 지나가게 한다 — 핸들러 직접 호출은 의존성
해석을 건너뛰어 이 경로를 검증하지 못한다.
"""

from types import SimpleNamespace

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from models.project import PROJECTS_REGISTRY

FS_SLUG = "leaked-slug"


@pytest.fixture
def empty_registry():
    snapshot = dict(PROJECTS_REGISTRY)
    PROJECTS_REGISTRY.clear()
    yield PROJECTS_REGISTRY
    PROJECTS_REGISTRY.clear()
    PROJECTS_REGISTRY.update(snapshot)


class _EmptyResult:
    def scalar_one_or_none(self):
        return None

    def scalars(self):
        return SimpleNamespace(all=lambda: [])

    def all(self):
        return []


class _EmptyDatabase:
    """DB 에 그 프로젝트가 없는 상태."""

    async def execute(self, *_args, **_kwargs):
        return _EmptyResult()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None


@pytest_asyncio.fixture
async def db_mode_app(app, tmp_path, monkeypatch, empty_registry):
    from api.deps import get_current_user, get_db_session
    from models.project import register_project

    project_dir = tmp_path / "not-in-db"
    project_dir.mkdir()
    register_project(FS_SLUG, str(project_dir))

    async def _db():
        yield _EmptyDatabase()

    # 시스템 admin 은 인가를 우회하므로 일반 사용자로 판정한다.
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id="member-user", role="member", is_admin=False, is_active=True
    )
    app.dependency_overrides[get_db_session] = _db
    monkeypatch.setenv("USE_DATABASE", "true")
    monkeypatch.setattr("db.database.async_session_factory", lambda: _EmptyDatabase())
    yield app
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_db_session, None)


@pytest.mark.asyncio
async def test_session_creation_rejects_filesystem_slug_in_database_mode(db_mode_app):
    """DB 에 없는 프로젝트는 레지스트리에 있어도 세션에 붙일 수 없다."""
    transport = ASGITransport(app=db_mode_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/api/sessions", json={"project_id": FS_SLUG})

    assert response.status_code in (403, 404), response.text
