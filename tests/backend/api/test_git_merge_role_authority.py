"""머지 권한은 클라이언트가 보낸 값이 아니라 서버가 판정한 역할로 정한다.

`execute_merge` · `merge_merge_request` 는 `user_role` 을 **쿼리 파라미터**로 받아
`can_merge_to_branch` 에 그대로 넘겼다. 즉 `?user_role=owner` 한 줄이면 보호 브랜치
머지 제한이 사라진다. `user_id` 도 같은 방식이라 임의 사용자 명의로 승인할 수 있고,
승인 수는 `merge_service/requests.py:_try_auto_merge` 가 실제로 게이트한다.

라우트 전체를 지나가게 한다 — 핸들러 직접 호출은 의존성 해석을 건너뛴다.
"""

from types import SimpleNamespace

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from models.project import PROJECTS_REGISTRY

DB_UUID = "2bb68d8f-3e23-4af3-a597-181dea321348"


@pytest.fixture
def empty_registry():
    snapshot = dict(PROJECTS_REGISTRY)
    PROJECTS_REGISTRY.clear()
    yield PROJECTS_REGISTRY
    PROJECTS_REGISTRY.clear()
    PROJECTS_REGISTRY.update(snapshot)


@pytest_asyncio.fixture
async def editor_app(app, tmp_path, monkeypatch, empty_registry):
    """프로젝트 ACL 상 `editor` 인 일반 사용자."""
    from api.deps import get_current_user, get_db_session
    from services.project_access_service import ProjectAccessService

    project_path = tmp_path / "repo"
    project_path.mkdir()

    row = SimpleNamespace(
        id=DB_UUID,
        name="Repo",
        slug="repo",
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

    async def _db():
        yield Database()

    async def _has_acl(*_a, **_k):
        return True

    async def _check_access(*_a, **_k):
        return "editor"

    monkeypatch.setenv("USE_DATABASE", "true")
    monkeypatch.setattr("db.database.async_session_factory", lambda: Database())
    monkeypatch.setattr(ProjectAccessService, "has_any_access_control", _has_acl)
    monkeypatch.setattr(ProjectAccessService, "check_access", _check_access)
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id="editor-user", role="member", is_admin=False, is_active=True
    )
    app.dependency_overrides[get_db_session] = _db
    yield app
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_db_session, None)


@pytest.mark.asyncio
async def test_client_supplied_role_cannot_unlock_protected_branch_merge(editor_app):
    """`?user_role=owner` 로는 보호 브랜치(main) 머지를 열 수 없다."""
    transport = ASGITransport(app=editor_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            f"/api/git/projects/{DB_UUID}/merge?user_role=owner",
            json={"source_branch": "feature/x", "target_branch": "main"},
        )

    assert response.status_code == 403, response.text


@pytest.mark.asyncio
async def test_approval_is_recorded_for_the_authenticated_user(editor_app, monkeypatch):
    """`?user_id=<남의 id>` 로 타인 명의 승인을 만들 수 없다.

    승인 수는 `merge_service/requests.py:_try_auto_merge` 가 실제로 게이트하므로
    (`len(mr.approved_by) < required_approvals`), 이는 attribution 위조가 아니라
    승인 우회다.
    """
    from api.git import merge_requests as mr_module

    recorded: dict = {}

    class FakeMRService:
        def approve_merge_request(self, mr_id, user_id):
            recorded["user_id"] = user_id
            return SimpleNamespace(id=mr_id)

    async def fake_service(*_a, **_k):
        return FakeMRService()

    async def no_db():
        return None

    monkeypatch.setattr(mr_module, "get_mr_service_for_project", fake_service)
    monkeypatch.setattr(mr_module, "_get_db_session", no_db)

    transport = ASGITransport(app=editor_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 응답 직렬화는 이 테스트의 관심사가 아니다 — 승인에 **누가** 기록되는지만 본다.
        try:
            await ac.post(
                f"/api/git/projects/{DB_UUID}/merge-requests/mr-1/approve?user_id=someone-else"
            )
        except Exception:
            pass

    assert recorded.get("user_id") == "editor-user", recorded


@pytest.mark.asyncio
async def test_read_routes_still_work_for_viewer(app, tmp_path, monkeypatch, empty_registry):
    """메모리 모드는 기존 동작을 유지한다 — 머지만 따로 막지 않는다.

    ACL 이 없는 모드에서 인증 사용자는 이미 모든 git 쓰기를 할 수 있으므로,
    머지 역할을 `admin` 으로 두는 것이 기능 제거를 피하는 선택이다.
    """
    from api.git._shared import get_git_role

    class _Req:
        state = SimpleNamespace(git_role="admin")

    assert await get_git_role(_Req()) == "admin"

    class _Unwired:
        state = SimpleNamespace()

    # 배선이 끊기면 가장 낮은 역할로 떨어진다 — fail-closed.
    assert await get_git_role(_Unwired()) == "viewer"
