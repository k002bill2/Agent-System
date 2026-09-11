"""DB 모드에서 터미널 런처(`/api/terminal/execute`·`/api/warp/open`)는 `ProjectModel.id` 를 해석해야 한다.

DB 모드의 link/create 는 `ProjectModel` 행만 만들고 in-memory `PROJECTS_REGISTRY`
(`projects/<심링크명>` 기준)는 채우지 않는다 — 심링크 생성이 바로 DB 모드 게이트가
막던 파일시스템 부작용이기 때문이다. 그런데 두 런처는 레거시 `get_project()` 만 봐서,
방금 등록한 프로젝트를 대시보드(`stores/agents.ts` Task Analyzer, orchestration
store 의 Warp 열기)에서 고르면 404 가 난다.

git API 가 이미 같은 문제를 `api/git/_shared.resolve_project` 로 풀었다(DB 모드는
DB 행만, 파일시스템 모드는 레거시 레지스트리). 두 런처도 그 해석기를 쓴다.

라우트 전체를 지나가게 한다 — 인가 의존성과 응답 직렬화까지 계약이다.
"""

from types import SimpleNamespace

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from models.project import PROJECTS_REGISTRY

DB_ID = "kvca"


@pytest.fixture
def empty_registry():
    """레거시 레지스트리가 비어 있어도 DB 행만으로 해석돼야 한다."""
    snapshot = dict(PROJECTS_REGISTRY)
    PROJECTS_REGISTRY.clear()
    yield PROJECTS_REGISTRY
    PROJECTS_REGISTRY.clear()
    PROJECTS_REGISTRY.update(snapshot)


@pytest_asyncio.fixture
async def db_project_app(authenticated_app, tmp_path, monkeypatch, empty_registry):
    """DB 에 slug id 프로젝트 1건만 있고 레거시 레지스트리는 빈 앱."""
    project_path = tmp_path / "KVCA"
    project_path.mkdir()

    row = SimpleNamespace(
        id=DB_ID,
        name="KVCA",
        slug="kvca",
        description="",
        path=str(project_path),
        is_active=True,
        settings={},
        organization_id=None,
    )

    class Result:
        def scalar_one_or_none(self):
            return row

    class Database:
        async def execute(self, *_args, **_kwargs):
            return Result()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

    monkeypatch.setenv("USE_DATABASE", "true")
    # `resolve_project` 는 주입 세션이 아니라 자체 세션을 연다 — 여기서 갈아끼운다.
    monkeypatch.setattr("db.database.async_session_factory", lambda: Database())
    yield authenticated_app, str(project_path)


async def _post(app, url, body):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        return await ac.post(url, json=body)


@pytest.mark.asyncio
async def test_terminal_execute_resolves_database_project(db_project_app, monkeypatch):
    app, project_path = db_project_app
    launched: dict = {}

    class Adapter:
        async def is_available(self):
            return True

        async def execute(self, **kwargs):
            launched.update(kwargs)
            return {"success": True, "terminal": "orca", "message": "started"}

    class Service:
        def get_adapter(self, _terminal_type):
            return Adapter()

    monkeypatch.setattr("api.terminal.get_terminal_service", lambda: Service())

    resp = await _post(
        app,
        "/api/terminal/execute",
        {"terminal": "orca", "project_id": DB_ID, "command": "echo hi"},
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["success"] is True
    assert launched["project_path"] == project_path


@pytest.mark.asyncio
async def test_warp_open_resolves_database_project(db_project_app, monkeypatch):
    app, _ = db_project_app

    class Warp:
        def is_warp_installed(self):
            return False

    monkeypatch.setattr("api.warp.get_warp_service", lambda: Warp())

    resp = await _post(app, "/api/warp/open", {"project_id": DB_ID})

    # 해석이 됐으면 404 가 아니라 "Warp 미설치" 응답(200, success=False)까지 간다.
    assert resp.status_code == 200, resp.text
    assert resp.json()["success"] is False
    assert "not installed" in resp.json()["error"]
