"""DB 모드에서 Git API 는 `ProjectModel.id`(UUID)를 해석할 수 있어야 한다.

DB 모드의 프로젝트 권위는 `ProjectModel` 이다 — `/api/projects` 도, 세션 리졸버
(`api/sessions.py:_resolve_project_context`)도, 인가(`deps.require_project_role`)도
전부 UUID 를 키로 쓴다. 그런데 `api/git` 은 in-memory `PROJECTS_REGISTRY`(키가
`projects/<심링크명>` 슬러그)만 조회하는 마지막 표면이라, 대시보드가 방금 목록에서
받은 id 를 그대로 보내면 404 가 난다:

    {"detail": "Project '2bb68d8f-3e23-4af3-a597-181dea321348' not found"}

라우트 전체(프레임워크 배선 포함)를 지나가게 해서, 핸들러 직접 호출이 건너뛰는
의존성 해석까지 함께 검증한다.
"""

from types import SimpleNamespace

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from models.project import PROJECTS_REGISTRY

DB_UUID = "2bb68d8f-3e23-4af3-a597-181dea321348"


@pytest.fixture
def empty_registry():
    """DB 모드에서 슬러그 엔트리에 기대지 않음을 보장한다."""
    snapshot = dict(PROJECTS_REGISTRY)
    PROJECTS_REGISTRY.clear()
    yield PROJECTS_REGISTRY
    PROJECTS_REGISTRY.clear()
    PROJECTS_REGISTRY.update(snapshot)


@pytest_asyncio.fixture
async def db_project_app(authenticated_app, tmp_path, monkeypatch, empty_registry):
    """DB 에 UUID id 프로젝트 1건만 있는 상태의 앱."""
    from api.deps import get_db_session

    project_path = tmp_path / "Agent-System"
    project_path.mkdir()

    row = SimpleNamespace(
        id=DB_UUID,
        name="Agent-System",
        slug="agent-system",
        description="",
        path=str(project_path),
        is_active=True,
        settings={},
        organization_id=None,
    )

    class Result:
        def scalar_one_or_none(self):
            return row

        def scalars(self):
            return SimpleNamespace(all=lambda: [row])

        def all(self):
            return [(row.id, row.path, row.organization_id)]

    class Database:
        async def execute(self, *_args, **_kwargs):
            return Result()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

    async def _override():
        yield Database()

    monkeypatch.setenv("USE_DATABASE", "true")
    # `resolve_project` 는 주입된 세션이 아니라 자체 세션을 연다(`_shared._get_db_session`
    # 과 같은 방식). 그래서 dependency override 만으로는 실 DB 에 붙는다 — 실제로 붙어
    # tmp_path 가 아닌 운영 행을 읽는 것을 이 테스트가 잡았다.
    monkeypatch.setattr("db.database.async_session_factory", lambda: Database())
    authenticated_app.dependency_overrides[get_db_session] = _override
    yield authenticated_app, str(project_path)
    authenticated_app.dependency_overrides.pop(get_db_session, None)


@pytest.mark.asyncio
async def test_git_status_resolves_database_project_id(db_project_app):
    """대시보드가 `/api/projects` 에서 받은 UUID 로 Git 상태를 조회할 수 있어야 한다."""
    app, project_path = db_project_app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get(f"/api/git/projects/{DB_UUID}/status")

    assert response.status_code == 200, response.text
    assert response.json()["effective_git_path"] == project_path


@pytest.mark.asyncio
async def test_filesystem_slug_is_not_reachable_in_database_mode(
    authenticated_app, tmp_path, monkeypatch, empty_registry
):
    """DB 모드에서 `projects/` 슬러그는 git API 에 닿지 못한다.

    파일시스템 폴백을 두면 심링크 이름만 알면 DB 미등록 프로젝트의 저장소 내용에
    닿을 수 있고, 라우터의 프로젝트 인가도 그 경로로 통째로 우회된다.
    (`.planning/STATE.md` 후속 2 가 제기한 우려가 정확히 이것이다.)
    """
    from api.deps import get_db_session
    from models.project import register_project

    project_path = tmp_path / "not-in-db"
    project_path.mkdir()
    register_project("leaked-slug", str(project_path))

    class EmptyResult:
        def scalar_one_or_none(self):
            return None

        def scalars(self):
            return SimpleNamespace(all=lambda: [])

        def all(self):
            return []

    class EmptyDatabase:
        async def execute(self, *_args, **_kwargs):
            return EmptyResult()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

    async def _override():
        yield EmptyDatabase()

    monkeypatch.setenv("USE_DATABASE", "true")
    monkeypatch.setattr("db.database.async_session_factory", lambda: EmptyDatabase())
    authenticated_app.dependency_overrides[get_db_session] = _override
    try:
        transport = ASGITransport(app=authenticated_app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.get("/api/git/projects/leaked-slug/status")
    finally:
        authenticated_app.dependency_overrides.pop(get_db_session, None)

    assert response.status_code == 404, response.text


@pytest.mark.asyncio
async def test_routes_without_project_id_still_work(db_project_app):
    """`enforce_git_project_access` 가 `{project_id}` 없는 라우트를 깨뜨리지 않는다.

    의존성이 `project_id` 를 파라미터로 선언하면 FastAPI 가 이런 라우트에서 그것을
    필수 쿼리 파라미터로 해석해 422 가 된다 — 그 배선 실수를 잡는 대조군이다.
    """
    app, _ = db_project_app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/api/git/repositories")

    assert response.status_code != 422, response.text


@pytest.mark.asyncio
async def test_viewer_can_read_but_not_mutate(db_project_app, monkeypatch):
    """viewer 역할은 읽기만 — `models/git/permissions.py` 의 viewer 는 READ 전용이다.

    전 라우트를 `min_role="viewer"` 로 통과시키면 viewer 가 커밋·푸시·브랜치 삭제까지
    하게 된다. 시스템 admin 우회를 타지 않도록 일반 사용자로 갈아끼운 뒤 판정한다.
    """
    from api.deps import get_current_user
    from services.project_access_service import ProjectAccessService

    app, _ = db_project_app
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id="viewer-user", role="member", is_admin=False, is_active=True
    )

    async def _has_acl(*_args, **_kwargs):
        return True

    async def _check_access(*_args, **_kwargs):
        return "viewer"

    monkeypatch.setattr(ProjectAccessService, "has_any_access_control", _has_acl)
    monkeypatch.setattr(ProjectAccessService, "check_access", _check_access)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        read = await ac.get(f"/api/git/projects/{DB_UUID}/status")
        write = await ac.post(
            f"/api/git/projects/{DB_UUID}/branches", json={"name": "feature/x"}
        )

    assert read.status_code == 200, read.text
    assert write.status_code == 403, write.text


@pytest.mark.asyncio
async def test_git_path_save_does_not_overwrite_db_name(
    authenticated_app, tmp_path, monkeypatch, empty_registry
):
    """git-path 저장이 DB 의 이름·설명을 파일시스템 기본값으로 덮지 않는다.

    `Project.from_path` 는 이름을 폴더명에서 파생한다. 그대로 `set_project_git_path`
    에 넘기면 `.aos-project.json` 에 폴더명이 기록돼 DB 레코드와 갈린다.
    """
    import json

    from api.deps import get_db_session

    project_path = tmp_path / "folder-name-differs"
    project_path.mkdir()
    (project_path / ".git").mkdir()

    row = SimpleNamespace(
        id=DB_UUID,
        name="관리자가 정한 이름",
        slug="db-named",
        description="DB 설명",
        path=str(project_path),
        is_active=True,
        settings={},
        organization_id=None,
    )

    class Result:
        def scalar_one_or_none(self):
            return row

        def scalars(self):
            return SimpleNamespace(all=lambda: [row])

        def all(self):
            return [(row.id, row.path, row.organization_id)]

    class Database:
        async def execute(self, *_args, **_kwargs):
            return Result()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

    async def _override():
        yield Database()

    monkeypatch.setenv("USE_DATABASE", "true")
    monkeypatch.setattr("db.database.async_session_factory", lambda: Database())
    authenticated_app.dependency_overrides[get_db_session] = _override
    try:
        transport = ASGITransport(app=authenticated_app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.put(
                f"/api/git/projects/{DB_UUID}/git-path",
                json={"git_path": str(project_path)},
            )
    finally:
        authenticated_app.dependency_overrides.pop(get_db_session, None)

    assert response.status_code == 200, response.text
    metadata = json.loads((project_path / ".aos-project.json").read_text(encoding="utf-8"))
    assert metadata["name"] == "관리자가 정한 이름"
    assert metadata["description"] == "DB 설명"
