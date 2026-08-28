"""DB 모드에서 프로젝트 헬스 모니터링이 실제로 동작해야 한다.

`#328` 이후 DB 모드의 `/health-config`·`/health`·`/checks/*` 는
`reject_legacy_project_operation_in_database_mode()` 로 통째로 503 이었다.
그 게이트는 레거시 파일시스템 레지스트리(`models.project.get_project`)가
DB 모드의 인가 경계 밖에 있기 때문에 옳았지만, 대신 Monitor 화면 전체가
"Project health checks are unavailable in database mode" 로 죽었다.

여기서 고정하는 계약:

  1. **공개 신원은 `ProjectModel.id`** — 응답의 `project_id` 는 요청한 정규
     id 와 같아야 한다. 대시보드가 그 값으로 다음 요청을 만든다.
  2. **검사 대상 경로는 DB 행의 `path` 하나뿐** — 경로 파생 id 나 임의 경로가
     권위가 되지 않는다. 레거시 레지스트리(`get_project`)는 DB 모드에서 절대
     호출되지 않는다.
  3. **인가가 파일시스템 접근보다 먼저** — 401/403/404 는 그대로, 503 은 진짜
     사용 불가한 DB 의존성에만.

라우트 전체(프레임워크 배선 포함)를 지나가게 한다 — 핸들러 직접 호출은
`Depends(get_current_user)` 와 경로 파라미터 추출을 건너뛰어 이 계약을 검증하지
못한다.
"""

import json
from types import SimpleNamespace

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

DB_UUID = "3f9c1b74-6d20-4a8e-9c31-5b7e0d2a8f61"
UNREGISTERED_UUID = "00000000-0000-4000-8000-000000000000"


def _make_project_tree(root):
    """`.aos-project.json` 으로 커스텀 체크 1개를 선언한 최소 프로젝트.

    기본 프리셋(test/lint/typecheck/build)과 다른 체크 id 를 쓰는 것이 핵심이다
    — 응답에 `probe` 가 있으면 **이 경로를 실제로 읽었다**는 증거가 된다.
    """
    root.mkdir(parents=True)
    (root / ".aos-project.json").write_text(
        json.dumps({"health_checks": {"probe": {"label": "Probe", "command": ["echo", "ok"]}}}),
        encoding="utf-8",
    )
    return root


class _Result:
    def __init__(self, rows):
        self._rows = list(rows)

    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None

    def scalar(self):
        return self._rows[0] if self._rows else None

    def scalars(self):
        return SimpleNamespace(all=lambda: list(self._rows))

    def all(self):
        return [(r.id, r.path, r.organization_id) for r in self._rows]


class _IdAwareDatabase:
    """등록된 행의 id 가 쿼리에 바인딩됐을 때만 그 행을 돌려주는 세션 스텁.

    id 를 무시하고 항상 행을 돌려주는 스텁이면 "미등록 id → 404" 테스트가
    스텁의 고장으로도 통과한다(거짓 초록). 반대로 항상 빈 결과를 돌려주는
    스텁이면 성공 케이스가 깨진다 — 두 케이스를 같은 스텁으로 짝지어 두면
    스텁 자체가 검증된다.
    """

    def __init__(self, row):
        self.row = row

    async def execute(self, statement, *_args, **_kwargs):
        try:
            bound = {str(value) for value in statement.compile().params.values()}
        except Exception:  # pragma: no cover - 방어적
            bound = set()
        if str(self.row.id) in bound:
            return _Result([self.row])
        return _Result([])

    async def commit(self):
        return None

    async def rollback(self):
        return None


def _row(path):
    return SimpleNamespace(
        id=DB_UUID,
        name="Agent-System",
        slug="agent-system",
        description="",
        path=path,
        is_active=True,
        settings={},
        organization_id=None,
        created_by=None,
        created_at=None,
        updated_at=None,
    )


def _install_db(app, monkeypatch, row):
    from api.deps import get_db_session

    database = _IdAwareDatabase(row)

    async def _override():
        yield database

    monkeypatch.setenv("USE_DATABASE", "true")
    app.dependency_overrides[get_db_session] = _override
    return database


@pytest_asyncio.fixture
async def db_mode_app(authenticated_app, tmp_path, monkeypatch):
    """DB 에 경로를 가진 프로젝트 1건만 등록된 DB 모드 앱 (관리자 신원)."""
    project_path = _make_project_tree(tmp_path / "Agent-System")
    _install_db(authenticated_app, monkeypatch, _row(str(project_path)))

    # 레거시 레지스트리는 DB 모드에서 호출되면 안 된다 — 호출되면 즉시 터진다.
    def _forbidden(*_args, **_kwargs):
        raise AssertionError("legacy filesystem project registry must not be used in DB mode")

    monkeypatch.setattr("api.monitoring.get_project", _forbidden)

    from api.deps import get_db_session

    yield authenticated_app, str(project_path)
    authenticated_app.dependency_overrides.pop(get_db_session, None)


async def _get(app, url):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        return await ac.get(url)


# ─────────────────────────────────────────────────────────────
# 1. 인가된 DB 모드 성공 경로
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_capabilities_are_available_for_registered_db_project(db_mode_app):
    """등록된 DB 프로젝트는 DB 모드에서도 헬스 기능을 쓸 수 있다고 보고한다."""
    app, _ = db_mode_app

    response = await _get(app, f"/api/projects/{DB_UUID}/monitoring-capabilities")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["project_id"] == DB_UUID
    assert body["mode"] == "database"
    assert body["health_config"] == "available"
    assert body["health"] == "available"
    assert body["checks"] == "available"


@pytest.mark.asyncio
async def test_health_config_reads_the_registered_db_path(db_mode_app):
    """설정은 **DB 행의 경로**에서 읽는다 — `probe` 는 그 경로의 파일에만 있다."""
    app, _ = db_mode_app

    response = await _get(app, f"/api/projects/{DB_UUID}/health-config")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["project_id"] == DB_UUID
    assert body["check_types"] == ["probe"]
    assert body["checks"]["probe"]["label"] == "Probe"


@pytest.mark.asyncio
async def test_health_reports_canonical_identity_and_registered_path(db_mode_app):
    app, project_path = db_mode_app

    response = await _get(app, f"/api/projects/{DB_UUID}/health")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["project_id"] == DB_UUID
    assert body["project_name"] == "Agent-System"
    assert body["project_path"] == project_path
    assert set(body["checks"]) == {"probe"}
    assert body["checks"]["probe"]["project_id"] == DB_UUID


# ─────────────────────────────────────────────────────────────
# 2. 인증·인가
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_unauthenticated_request_is_rejected(app, tmp_path, monkeypatch):
    """토큰 없는 요청은 401 — DB 모드에서도 그대로다."""
    project_path = _make_project_tree(tmp_path / "Agent-System")
    _install_db(app, monkeypatch, _row(str(project_path)))
    from api.deps import get_db_session

    try:
        for url in (
            f"/api/projects/{DB_UUID}/monitoring-capabilities",
            f"/api/projects/{DB_UUID}/health-config",
            f"/api/projects/{DB_UUID}/health",
        ):
            response = await _get(app, url)
            assert response.status_code == 401, f"{url} -> {response.status_code}"
    finally:
        app.dependency_overrides.pop(get_db_session, None)


@pytest.mark.asyncio
async def test_denied_project_access_is_forbidden(app, tmp_path, monkeypatch):
    """프로젝트 권한이 없는 인증 사용자는 403 — 파일시스템에 닿기 전에 막힌다."""
    from api.deps import get_current_user, get_db_session
    from services.project_access_service import ProjectAccessService

    project_path = _make_project_tree(tmp_path / "Agent-System")
    _install_db(app, monkeypatch, _row(str(project_path)))
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id="outsider", role="user", is_admin=False, is_active=True
    )

    async def _has_acl(*_args, **_kwargs):
        return True

    async def _no_access(*_args, **_kwargs):
        return None

    monkeypatch.setattr(ProjectAccessService, "has_any_access_control", _has_acl)
    monkeypatch.setattr(ProjectAccessService, "check_access", _no_access)

    def _forbidden(*_args, **_kwargs):
        raise AssertionError("filesystem inspection must not run before authorization")

    monkeypatch.setattr("api.monitoring.get_check_config", _forbidden)

    try:
        response = await _get(app, f"/api/projects/{DB_UUID}/health-config")
        assert response.status_code == 403, response.text
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db_session, None)


@pytest.mark.asyncio
async def test_viewer_cannot_execute_checks(app, tmp_path, monkeypatch):
    """읽기는 viewer, 실행은 editor — DB 모드에서도 등급이 유지된다."""
    from api.deps import get_current_user, get_db_session
    from services.project_access_service import ProjectAccessService

    project_path = _make_project_tree(tmp_path / "Agent-System")
    _install_db(app, monkeypatch, _row(str(project_path)))
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id="reader", role="user", is_admin=False, is_active=True
    )

    async def _has_acl(*_args, **_kwargs):
        return True

    async def _viewer(*_args, **_kwargs):
        return "viewer"

    monkeypatch.setattr(ProjectAccessService, "has_any_access_control", _has_acl)
    monkeypatch.setattr(ProjectAccessService, "check_access", _viewer)

    try:
        readable = await _get(app, f"/api/projects/{DB_UUID}/health-config")
        assert readable.status_code == 200, readable.text

        response = await _get(app, f"/api/projects/{DB_UUID}/checks/probe")
        assert response.status_code == 403, response.text
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db_session, None)


# ─────────────────────────────────────────────────────────────
# 3. 신원 — 미등록·오형식·레거시 폴백 금지
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_unregistered_canonical_id_is_not_found(db_mode_app):
    """DB 에 없는 UUID 는 404 (같은 스텁이 위 테스트에서 200 을 낸다)."""
    app, _ = db_mode_app

    response = await _get(app, f"/api/projects/{UNREGISTERED_UUID}/health-config")

    assert response.status_code == 404, response.text


@pytest.mark.asyncio
async def test_path_derived_id_is_not_authority_in_database_mode(db_mode_app):
    """경로 파생 id 로는 닿지 못한다 — 레거시 파일시스템 폴백이 없다."""
    app, project_path = db_mode_app
    leaked_id = project_path.replace("/", "-")

    response = await _get(app, f"/api/projects/{leaked_id}/health")

    assert response.status_code == 404, response.text


@pytest.mark.asyncio
async def test_blank_identity_is_rejected(db_mode_app):
    """공백 식별자는 400 — 빈 문자열이 필터를 넓히지 못하게 한다."""
    app, _ = db_mode_app

    response = await _get(app, "/api/projects/%20/health-config")

    assert response.status_code == 400, response.text


# ─────────────────────────────────────────────────────────────
# 4. 503 은 진짜 사용 불가한 의존성에만 — 두 원인을 분리해 검증
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_db_project_without_path_stays_fail_closed(authenticated_app, monkeypatch):
    """경로 없는 DB 프로젝트는 disabled 로 보고되고 읽기는 503 이다."""
    from api.deps import get_db_session

    _install_db(authenticated_app, monkeypatch, _row(None))
    try:
        capabilities = await _get(
            authenticated_app, f"/api/projects/{DB_UUID}/monitoring-capabilities"
        )
        assert capabilities.status_code == 200, capabilities.text
        body = capabilities.json()
        assert body["mode"] == "database"
        assert body["health_config"] == "disabled"
        assert body["health"] == "disabled"
        assert body["checks"] == "disabled"
        assert body["reason"]

        config = await _get(authenticated_app, f"/api/projects/{DB_UUID}/health-config")
        assert config.status_code == 503, config.text
        assert "path" in config.json()["detail"].lower()
    finally:
        authenticated_app.dependency_overrides.pop(get_db_session, None)


@pytest.mark.asyncio
async def test_database_failure_is_reported_as_unavailable(authenticated_app, tmp_path, monkeypatch):
    """DB 조회 자체가 실패하면 503 — 위의 '경로 없음' 503 과 detail 이 다르다."""
    from api.deps import get_db_session

    project_path = _make_project_tree(tmp_path / "Agent-System")
    database = _install_db(authenticated_app, monkeypatch, _row(str(project_path)))

    calls = {"n": 0}
    original = database.execute

    async def _fail_after_authorization(statement, *args, **kwargs):
        calls["n"] += 1
        # 1번째는 `require_project_role` 의 등록 확인 — 통과시킨다.
        if calls["n"] == 1:
            return await original(statement, *args, **kwargs)
        raise RuntimeError("database connection lost")

    monkeypatch.setattr(database, "execute", _fail_after_authorization)

    try:
        response = await _get(authenticated_app, f"/api/projects/{DB_UUID}/health-config")
        assert response.status_code == 503, response.text
        assert "temporarily unavailable" in response.json()["detail"].lower()
    finally:
        authenticated_app.dependency_overrides.pop(get_db_session, None)


# ─────────────────────────────────────────────────────────────
# 5. 파일시스템 모드는 그대로
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_filesystem_mode_still_uses_the_legacy_registry(
    authenticated_app, tmp_path, monkeypatch
):
    """파일시스템 모드는 레거시 레지스트리와 경로 파생 id 를 그대로 쓴다."""
    from api.deps import get_db_session

    project_path = _make_project_tree(tmp_path / "fs-project")

    monkeypatch.setenv("USE_DATABASE", "false")
    monkeypatch.setattr(
        "api.monitoring.get_project",
        lambda pid: SimpleNamespace(name="fs-project", path=str(project_path))
        if pid == "fs-project"
        else None,
    )

    async def _override():
        yield SimpleNamespace()

    authenticated_app.dependency_overrides[get_db_session] = _override
    try:
        capabilities = await _get(
            authenticated_app, "/api/projects/fs-project/monitoring-capabilities"
        )
        assert capabilities.status_code == 200, capabilities.text
        assert capabilities.json()["mode"] == "filesystem"
        assert capabilities.json()["health"] == "available"

        config = await _get(authenticated_app, "/api/projects/fs-project/health-config")
        assert config.status_code == 200, config.text
        assert config.json()["check_types"] == ["probe"]

        missing = await _get(authenticated_app, "/api/projects/nope/health-config")
        assert missing.status_code == 404, missing.text
    finally:
        authenticated_app.dependency_overrides.pop(get_db_session, None)
