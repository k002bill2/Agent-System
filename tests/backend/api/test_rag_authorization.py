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

`POST /api/rag/query`(cross_project_query)는 프로젝트를 해석하지 않아 이 변경의
범위 밖이므로 여기서 다루지 않는다.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from api import deps as api_deps
from api import rag
from models.project import Project

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
    """`{project_id}` 를 받는 RAG 라우트만 (method, 구체 경로) 로 낸다."""
    rows = [
        (method, path)
        for method, path, _ in snapshot(app.router)
        if path.startswith("/api/rag/") and "{project_id}" in path
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

    async def _deny(project_id, user, session):
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

    async def _allow(project_id, user, session):
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

    async def _allow(project_id, user, session):
        return db_project

    monkeypatch.setattr(rag, "authorize_db_project", _allow)
    monkeypatch.setattr(rag, "_safe_count", lambda _project_id: 7)
    monkeypatch.setattr(rag, "_collection_exists", lambda _project_id: True, raising=False)

    result = await rag.get_indexing_status(DB_PROJECT_ID, MEMBER, MagicMock())

    assert result["indexed"] is True
    assert result["document_count"] == 7
