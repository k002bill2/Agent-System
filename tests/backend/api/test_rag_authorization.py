"""Authorization + resolution contract for the RAG API.

DB 레지스트리 프로젝트를 RAG 가 해석하게 되면서 생긴 노출을 고정한다.
그 전에는 DB 프로젝트가 전부 404 였으므로 이 계약은 새로 필요해진 것이다.

계약:
1. 프로젝트 스코프 RAG 라우트는 **전부** 미인증 호출을 401 로 막는다.
   (`Depends` 를 일곱 중 여섯에만 붙이는 실수를 라우트 표로 잡는다.)
2. 접근 권한 없는 member 는 DB 프로젝트를 404 로 본다 — 존재를 알리지 않는다.
3. `path` 가 비어 있는 DB 프로젝트는 404 이며, 인덱싱 작업이 **예약되지 않는다**.
   (`Path("").resolve()` 는 서버 작업 디렉터리라, 통과하면 그 전체를 인덱싱한다.)
4. `/rag/status` 는 DB 프로젝트에도 `indexed` 를 사실대로 보고한다.

`GET /api/rag/collections` 는 프로젝트 스코프가 아니라 여기서 제외한다 —
이 변경이 건드리지 않은 기존 표면이다.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from api import deps as api_deps
from api import rag
from models.project import Project
from services.rag_service import QueryResult

from .route_table import snapshot

MEMBER_ID = "11111111-1111-1111-1111-111111111111"
DB_PROJECT_ID = "05c4302d-9602-4b70-8267-65964f5bed4d"


def _make_user(user_id: str, role: str = "member", is_admin: bool = False) -> MagicMock:
    user = MagicMock()
    user.id = user_id
    user.email = f"{role}@example.com"
    user.name = role
    user.role = role
    user.is_admin = is_admin
    user.is_active = True
    return user


MEMBER = _make_user(MEMBER_ID)


@pytest_asyncio.fixture
async def app(monkeypatch):
    from api.app import create_app

    # RateLimitService 는 프로세스 전역 싱글턴이라, 여기서 예산을 태우면
    # 뒤따르는 테스트 모듈이 429 로 죽는다 (순서 의존 실패).
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "false")

    test_app = create_app(title="RAG AuthZ Test", debug=True)
    test_app.dependency_overrides[api_deps.get_db_session] = lambda: MagicMock()
    yield test_app
    test_app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def _project_scoped_rag_routes(app) -> list[tuple[str, str]]:
    """프로젝트 데이터를 읽거나 바꾸는 RAG 라우트를 (method, 구체 경로) 로 낸다.

    `{project_id}` 라우트에 더해 교차 프로젝트 검색(`POST /api/rag/query`)도
    포함한다 — 인덱싱된 청크를 그대로 내주므로 같은 경계에 있다.
    """
    rows = [
        (method, path)
        for method, path, _ in snapshot(app.router)
        if path.startswith("/api/rag/")
        and ("{project_id}" in path or path == "/api/rag/query")
    ]
    assert rows, "RAG 라우트가 하나도 안 잡혔다 — 라우터가 안 붙었거나 경로가 바뀌었다"
    return [(method, path.replace("{project_id}", DB_PROJECT_ID)) for method, path in rows]


@pytest.mark.asyncio
async def test_every_project_scoped_rag_route_requires_authentication(app, client) -> None:
    """미인증 호출은 전 라우트에서 401 — 한 곳이라도 빠지면 그게 구멍이다."""
    unprotected: list[tuple[str, str, int]] = []
    for method, path in _project_scoped_rag_routes(app):
        response = await client.request(method, path, json={})
        if response.status_code != 401:
            unprotected.append((method, path, response.status_code))

    assert not unprotected, f"인증 없이 도달 가능한 RAG 라우트: {unprotected}"


@pytest.mark.asyncio
async def test_member_without_access_cannot_resolve_a_db_project(monkeypatch) -> None:
    """권한 없는 member 에게는 DB 프로젝트가 존재하지 않는 것으로 보인다."""
    monkeypatch.setattr(rag, "get_project", lambda _project_id: None)

    async def _deny(project_id, user, session, min_role="viewer"):
        return None

    monkeypatch.setattr(rag, "authorize_db_project", _deny)

    assert await rag._resolve_project(DB_PROJECT_ID, MEMBER, MagicMock()) is None


@pytest.mark.asyncio
async def test_db_project_without_a_path_is_rejected_before_scheduling(monkeypatch) -> None:
    """`path` 가 빈 DB 프로젝트는 404 이고, 인덱싱이 예약되지 않아야 한다.

    `Path("").resolve()` 는 서버의 작업 디렉터리다 — 통과하면 저장소 전체가
    그 프로젝트 컬렉션으로 들어간다.
    """
    pathless = Project(id=DB_PROJECT_ID, name="Pathless", path="")
    monkeypatch.setattr(rag, "get_project", lambda _project_id: None)

    async def _allow(project_id, user, session, min_role="viewer"):
        return pathless

    monkeypatch.setattr(rag, "authorize_db_project", _allow)

    scheduled: list[str] = []
    monkeypatch.setattr(
        rag,
        "trigger_background_indexing",
        lambda **kwargs: scheduled.append(kwargs["project_id"]) or True,
    )

    assert await rag._resolve_project(DB_PROJECT_ID, MEMBER, MagicMock()) is None
    assert scheduled == [], "해석에 실패했는데 인덱싱이 예약됐다"


@pytest.mark.asyncio
async def test_status_reports_indexed_for_a_db_registry_project(monkeypatch) -> None:
    """DB 전용 프로젝트도 인덱싱 후 `indexed: true` 로 보고돼야 한다."""
    db_project = Project(id=DB_PROJECT_ID, name="Agent System", path="/workspace/agent-system")
    monkeypatch.setattr(rag, "get_project", lambda _project_id: None)

    async def _allow(project_id, user, session, min_role="viewer"):
        return db_project

    monkeypatch.setattr(rag, "authorize_db_project", _allow)
    monkeypatch.setattr(rag, "_safe_count", lambda _project_id: 7)
    monkeypatch.setattr(rag, "_collection_exists", lambda _project_id: True, raising=False)

    result = await rag.get_indexing_status(DB_PROJECT_ID, MEMBER, MagicMock())

    assert result["indexed"] is True
    assert result["document_count"] == 7


@pytest.mark.asyncio
async def test_cross_project_search_is_narrowed_to_authorized_projects(monkeypatch) -> None:
    """member 가 남의 project_id 를 지목해도 그 컬렉션은 검색되지 않는다.

    인증만 걸고 대상 집합을 좁히지 않으면 단건 라우트의 ACL 이 무의미해진다.
    """
    monkeypatch.setattr(rag, "PROJECTS_REGISTRY", {})

    async def _only_mine(project_ids, user, session):
        mine = MagicMock()
        mine.id = DB_PROJECT_ID
        return [mine] if project_ids is None or DB_PROJECT_ID in project_ids else []

    monkeypatch.setattr(rag, "authorize_db_projects", _only_mine)

    allowed = await rag._authorized_project_ids(
        [DB_PROJECT_ID, "someone-elses-project"], MEMBER, MagicMock()
    )

    assert allowed == [DB_PROJECT_ID]


@pytest.mark.parametrize(
    "handler_name, kwargs",
    [("get_project_entities", {}), ("get_project_dependencies", {})],
)
@pytest.mark.asyncio
async def test_code_scanning_routes_do_not_subscript_the_project(
    monkeypatch, tmp_path, handler_name, kwargs
) -> None:
    """`Project` 는 Pydantic 모델이라 `project["path"]` 는 TypeError → 500 이었다.

    소스 문자열이 아니라 **핸들러를 실제로 호출해서** 고정한다.
    """
    project = Project(id=DB_PROJECT_ID, name="Agent System", path=str(tmp_path))

    async def _resolve(project_id, user, session, min_role="viewer"):
        return project

    monkeypatch.setattr(rag, "_resolve_project", _resolve)
    monkeypatch.setattr(rag, "extract_entities", lambda *a, **kw: [])
    monkeypatch.setattr(rag, "extract_dependencies", lambda *a, **kw: [])

    handler = getattr(rag, handler_name)
    result = await handler(DB_PROJECT_ID, MEMBER, MagicMock(), **kwargs)

    assert isinstance(result, dict)
    assert result["project_id"] == DB_PROJECT_ID


@pytest.mark.parametrize(
    "handler_name, expected_min_role",
    [
        ("index_project", "editor"),
        ("delete_project_index", "editor"),
        ("get_project_stats", "viewer"),
    ],
)
@pytest.mark.asyncio
async def test_mutating_rag_routes_demand_editor_access(
    monkeypatch, tmp_path, handler_name, expected_min_role
) -> None:
    """viewer 는 재인덱싱·컬렉션 삭제를 못 한다.

    `ProjectAccess` 를 user_id 로만 거르면 viewer 도 통과해, 비싼 재인덱싱과
    벡터 컬렉션 전체 삭제가 열린다.
    """
    project = Project(id=DB_PROJECT_ID, name="Agent System", path=str(tmp_path))
    seen: list[str] = []

    async def _record(project_id, user, session, min_role="viewer"):
        seen.append(min_role)
        return project

    monkeypatch.setattr(rag, "get_project", lambda _project_id: None)
    monkeypatch.setattr(rag, "_get_db_project", _record)
    monkeypatch.setattr(rag, "trigger_background_indexing", lambda **kwargs: True)
    monkeypatch.setattr(rag, "_safe_count", lambda _project_id: 0)

    handler = getattr(rag, handler_name)
    args: list[object] = [DB_PROJECT_ID]
    if handler_name == "index_project":
        args.append(MagicMock())  # BackgroundTasks
    args += [MEMBER, MagicMock()]

    try:
        await handler(*args)
    except Exception:
        # 이 테스트가 고정하는 것은 요구 권한 수준뿐이다 — Qdrant 부재 등
        # 하위 실패는 관심 밖이다.
        pass

    assert seen == [expected_min_role]


@pytest.mark.asyncio
async def test_shared_query_is_limited_to_authorized_collections(monkeypatch, tmp_path) -> None:
    """`include_shared` 는 ACL 없이 다른 컬렉션을 전부 훑는다 — 대상을 좁혀 넘긴다."""
    project = Project(id=DB_PROJECT_ID, name="Agent System", path=str(tmp_path))

    async def _resolve(project_id, user, session, min_role="viewer"):
        return project

    monkeypatch.setattr(rag, "_resolve_project", _resolve)

    async def _authorized(requested_ids, user, session):
        return [DB_PROJECT_ID, "another-project-i-can-see"]

    monkeypatch.setattr(rag, "_authorized_project_ids", _authorized)

    captured: dict[str, object] = {}

    class _Store:
        async def query(self, **kwargs):
            captured.update(kwargs)
            return QueryResult(query=kwargs["query"], documents=[], total_found=0)

    monkeypatch.setattr(rag, "get_vector_store", lambda: _Store())

    await rag.query_project(
        DB_PROJECT_ID,
        rag.QueryRequest(query="secret", include_shared=True),
        MEMBER,
        MagicMock(),
    )

    assert captured["allowed_shared_project_ids"] == [
        DB_PROJECT_ID,
        "another-project-i-can-see",
    ]
