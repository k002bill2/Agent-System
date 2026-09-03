"""`GET /api/bootstrap` 는 대시보드 기동에 필요한 사용자 범위 데이터를 한 번에 준다.

기존 4개 요청(`/api/auth/me`·`/api/projects`·`/api/llm/models`·
`/api/admin/menu-visibility`)을 대체하는 것이 목적이므로, 인가 로직을 새로 쓰지 않고
각 엔드포인트의 핸들러를 그대로 재사용한다. 그래서 이 파일의 계약은 두 겹이다:

1. 인증/인가가 기존과 동일한가 (401 계약, 사용자별 프로젝트 범위)
2. 재사용한 핸들러가 **실제로 데이터를 반환**하는가

2번이 형식적인 검사가 아닌 이유: FastAPI 핸들러는 평범한 함수가 아니다.
`api.llm.get_models` 의 기본값은 `None`/`False` 가 아니라 `Query(...)` 객체이고,
`Query` 객체는 truthy 라서 `get_models()` 를 그냥 호출하면 `if provider:` 분기에
들어가 `LLMProvider(<Query>)` 가 `ValueError` 를 내고 **조용히 빈 목록**을 돌려준다
(실측: 인자 없이 호출 → total 0, 명시 호출 → total 25). 키 존재만 단언하는
테스트는 이 버그를 그대로 통과시키므로 아래는 비어 있지 않음을 단언한다.
"""

from types import SimpleNamespace

import pytest
from sqlalchemy.exc import SQLAlchemyError

ADMIN_IDENTITY = SimpleNamespace(
    id="test-admin",
    email="admin@example.com",
    name="Test Admin",
    avatar_url=None,
    oauth_provider="email",
    role="admin",
    is_admin=True,
    is_active=True,
)
MEMBER_IDENTITY = SimpleNamespace(
    id="test-member",
    email="member@example.com",
    name="Test Member",
    avatar_url=None,
    oauth_provider="email",
    role="member",
    is_admin=False,
    is_active=True,
)


def _override_user(app, identity):
    from api.deps import get_current_user

    app.dependency_overrides[get_current_user] = lambda: identity
    return lambda: app.dependency_overrides.pop(get_current_user, None)


def test_bootstrap_router_is_importable():
    """`app.py` 는 `safe_import` 로 마운트하고, 그 헬퍼는 모든 예외를 삼킨다.

    import 에러가 나면 라우터가 조용히 사라져 나머지 테스트가 404 를 받고
    "아직 미구현" 처럼 읽힌다. 여기서 모듈을 **직접** import 해 실제 트레이스백을
    드러낸다 — `safe_import` 를 거치면 그 진단이 사라진다.
    """
    from api.bootstrap import router

    assert router is not None


@pytest.mark.asyncio
async def test_bootstrap_requires_authentication(client):
    """미인증 요청은 기존 인증 실패 계약(401)을 그대로 받는다."""
    response = await client.get("/api/bootstrap")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_bootstrap_returns_startup_payload(client, app):
    """인증 사용자는 user·projects·models 를 한 응답으로 받는다."""
    restore = _override_user(app, ADMIN_IDENTITY)
    try:
        response = await client.get("/api/bootstrap")
    finally:
        restore()

    assert response.status_code == 200, response.text
    body = response.json()

    assert body["user"]["id"] == ADMIN_IDENTITY.id
    assert isinstance(body["projects"], list)
    # 빈 목록이면 Query 기본값 함정에 걸린 것이다 (모듈 docstring 참조).
    assert body["models"], "models must not be empty — handler reused with Query defaults?"
    assert all("id" in model for model in body["models"])


@pytest.mark.asyncio
async def test_bootstrap_never_exposes_credentials(client, app):
    """부트스트랩 응답에 토큰·시크릿이 실려서는 안 된다."""
    restore = _override_user(app, ADMIN_IDENTITY)
    try:
        response = await client.get("/api/bootstrap")
    finally:
        restore()

    assert response.status_code == 200, response.text
    serialized = response.text.lower()
    for forbidden in ("access_token", "refresh_token", "api_key", "secret", "password"):
        assert forbidden not in serialized, f"bootstrap leaked {forbidden}"


@pytest.mark.asyncio
async def test_bootstrap_response_is_not_shared_cacheable(client, app):
    """사용자 범위 응답이므로 공유 캐시에 저장돼서는 안 된다."""
    restore = _override_user(app, ADMIN_IDENTITY)
    try:
        response = await client.get("/api/bootstrap")
    finally:
        restore()

    cache_control = response.headers.get("cache-control", "")
    assert "private" in cache_control
    assert "no-store" in cache_control


@pytest.mark.asyncio
@pytest.mark.parametrize("identity", [ADMIN_IDENTITY, MEMBER_IDENTITY], ids=["admin", "member"])
async def test_bootstrap_projects_match_the_projects_endpoint(client, app, identity):
    """같은 신원이면 부트스트랩과 `/api/projects` 의 결과가 동일해야 한다.

    인가 규칙을 복제하지 않고 재사용했다는 것을 값으로 증명한다 — 부트스트랩이
    필터를 건너뛰면 admin 과 member 의 결과가 갈리면서 여기서 깨진다.
    """
    restore = _override_user(app, identity)
    try:
        bootstrap = await client.get("/api/bootstrap")
        projects = await client.get("/api/projects")
    finally:
        restore()

    assert bootstrap.status_code == projects.status_code
    if identity is MEMBER_IDENTITY:
        # Filesystem discovery must not expose unregistered legacy paths to a
        # non-admin when the ACL registry cannot authorize them.
        assert bootstrap.status_code == 503
        return

    assert bootstrap.status_code == 200, bootstrap.text
    assert bootstrap.json()["projects"] == projects.json()


@pytest.mark.asyncio
async def test_bootstrap_includes_menu_when_lookup_succeeds(client, app, monkeypatch):
    """메뉴 조회가 성공하면 payload 에 실려 프런트의 추가 요청이 사라진다."""
    from api.admin import MenuVisibilityResponse

    async def _menu(_user=None):
        return MenuVisibilityResponse(visibility={"git": {"admin": True}}, menu_order=["git"])

    monkeypatch.setattr("api.bootstrap.get_menu_visibility", _menu)

    restore = _override_user(app, ADMIN_IDENTITY)
    try:
        response = await client.get("/api/bootstrap")
    finally:
        restore()

    assert response.status_code == 200, response.text
    assert response.json()["menu"] == {
        "visibility": {"git": {"admin": True}},
        "menu_order": ["git"],
    }


@pytest.mark.asyncio
async def test_bootstrap_degrades_menu_to_null_without_failing(client, app, monkeypatch):
    """메뉴 조회 실패는 부트스트랩 전체를 죽이지 않는다.

    `api.admin.get_menu_visibility` 는 DB 접속 실패를 잡지 않아서
    `USE_DATABASE=false` 환경에서는 그대로 터진다(로컬 실측: `InvalidPasswordError`).
    그 실패가 user·projects·models 까지 날려버리면 기동 자체가 오늘보다 나빠진다.
    `menu` 를 `null` 로 내려 "비어 있음" 이 아니라 "알 수 없음" 을 표현하고,
    프런트는 기존대로 `/api/admin/menu-visibility` 를 직접 부른다.
    """

    async def _explode(_user=None):
        raise SQLAlchemyError("database unavailable")

    monkeypatch.setattr("api.bootstrap.get_menu_visibility", _explode)

    restore = _override_user(app, ADMIN_IDENTITY)
    try:
        response = await client.get("/api/bootstrap")
    finally:
        restore()

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["menu"] is None
    # 나머지 기동 데이터는 그대로 살아 있어야 한다.
    assert body["user"]["id"] == ADMIN_IDENTITY.id
    assert body["models"]
