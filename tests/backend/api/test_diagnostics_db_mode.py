"""DB 모드에서 Environment Diagnostics 가 실제로 동작해야 한다.

`/api/projects/{id}/diagnostics` 는 `reject_legacy_project_operation_in_database_mode()`
로 통째로 503 이었다. 그 게이트는 레거시 파일시스템 레지스트리
(`models.project.get_project`)가 DB 모드의 인가 경계 밖에 있기 때문에 옳았지만,
대신 Monitor 화면의 Environment Diagnostics 패널이 오류 배너로 죽었다.

여기서 고정하는 계약 (`test_monitoring_db_health.py` 와 같은 계약):

  1. **공개 신원은 `ProjectModel.id`** — 응답의 `project_id` 는 요청한 정규 id 와
     같아야 한다. 대시보드가 그 값으로 다음 요청을 만든다.
  2. **진단 대상 경로는 DB 행의 `path` 하나뿐** — 경로 파생 id 나 임의 경로가
     권위가 되지 않는다. 레거시 레지스트리는 DB 모드에서 절대 호출되지 않는다.
  3. **인가가 파일시스템 접근보다 먼저** — 401/403/404 는 그대로, 503 은 진짜
     사용 불가한 의존성(또는 경로 없는 등록)에만.
  4. **`Project` 는 `Project.from_path` 로 구성** — 필드를 손으로 옮기면
     `.aos-project.json` 의 `git_path` 가 조용히 무시된다.

라우트 전체(프레임워크 배선 포함)를 지나가게 한다 — 핸들러 직접 호출은
`Depends(get_current_user)` 와 경로 파라미터 추출을 건너뛰어 이 계약을 검증하지
못한다.
"""

import json
from pathlib import Path
from types import SimpleNamespace

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

DB_UUID = "7b2d4e19-8c53-4f61-a0d7-3e5c9f18b240"
UNREGISTERED_UUID = "00000000-0000-4000-8000-000000000000"

# `.aos-project.json` 에만 있는 값들. 응답에 나타나면 **이 경로를 실제로 읽었다**는
# 증거가 된다.
METADATA_NAME = "name-from-metadata"
METADATA_GIT_PATH = "/nonexistent/declared-git-path"


def _make_project_tree(root, *, with_metadata: bool = True):
    """`.aos-project.json` 을 가진 최소 프로젝트 디렉터리."""
    root.mkdir(parents=True)
    if with_metadata:
        (root / ".aos-project.json").write_text(
            json.dumps({"name": METADATA_NAME, "git_path": METADATA_GIT_PATH}),
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
        description="registered in the database",
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


def _forbid_legacy_registry(monkeypatch):
    def _forbidden(*_args, **_kwargs):
        raise AssertionError("legacy filesystem project registry must not be used in DB mode")

    monkeypatch.setattr("api.diagnostics.get_project", _forbidden)


@pytest_asyncio.fixture
async def db_mode_app(authenticated_app, tmp_path, monkeypatch):
    """DB 에 경로를 가진 프로젝트 1건만 등록된 DB 모드 앱 (관리자 신원)."""
    project_path = _make_project_tree(tmp_path / "Agent-System")
    _install_db(authenticated_app, monkeypatch, _row(str(project_path)))
    _forbid_legacy_registry(monkeypatch)

    from api.deps import get_db_session

    yield authenticated_app, str(Path(project_path).resolve())
    authenticated_app.dependency_overrides.pop(get_db_session, None)


async def _get(app, url):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        return await ac.get(url)


async def _post(app, url, payload):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        return await ac.post(url, json=payload)


# ─────────────────────────────────────────────────────────────
# 1. 인가된 DB 모드 성공 경로
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_full_diagnostics_reads_the_registered_db_path(db_mode_app):
    """전체 진단은 200 이고, DB 행의 경로를 실제로 읽는다."""
    app, project_path = db_mode_app

    response = await _get(app, f"/api/projects/{DB_UUID}/diagnostics")

    assert response.status_code == 200, response.text
    body = response.json()
    # 공개 신원은 정규 DB id — 대시보드가 이 값으로 다음 요청을 만든다.
    assert body["project_id"] == DB_UUID
    # 이름의 권위는 DB 행이다 (`.aos-project.json` 의 이름이 아니다).
    assert body["project_name"] == "Agent-System"
    assert body["project_name"] != METADATA_NAME

    workspace = body["categories"]["workspace"]
    checks = {c["name"]: c for c in workspace["checks"]}
    # `.aos-project.json` 은 이 tmp 경로에만 있다 — 읽었다는 증거.
    assert checks["aos_config"]["message"] == ".aos-project.json is valid"
    assert checks["path_accessible"]["status"] == "healthy"
    assert project_path in checks["path_accessible"]["message"]


@pytest.mark.asyncio
async def test_single_category_diagnostics_succeeds(db_mode_app):
    """카테고리 단건 진단도 200 이며 그 카테고리만 돌려준다."""
    app, _ = db_mode_app

    response = await _get(app, f"/api/projects/{DB_UUID}/diagnostics/workspace")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["project_id"] == DB_UUID
    assert list(body["categories"]) == ["workspace"]


@pytest.mark.asyncio
async def test_git_metadata_comes_from_the_registered_path(db_mode_app):
    """git 카테고리는 `.aos-project.json` 의 `git_path` 를 본다.

    이 단언이 없으면 DB 행 필드를 손으로 옮겨 `Project` 를 만드는 구현이 초록으로
    통과한다 — 그 구현에서는 `git_path` 가 None 이고 `git_enabled` 가 영구히
    False 라, 모든 DB 프로젝트가 자기 경로로 "Not a Git repository" 를 보고한다.
    """
    app, project_path = db_mode_app

    response = await _get(app, f"/api/projects/{DB_UUID}/diagnostics/git")

    assert response.status_code == 200, response.text
    checks = {c["name"]: c for c in response.json()["categories"]["git"]["checks"]}
    assert checks["git_repository"]["details"]["path"] == METADATA_GIT_PATH
    assert checks["git_repository"]["details"]["path"] != project_path


@pytest.mark.asyncio
async def test_fix_writes_into_the_registered_db_path(authenticated_app, tmp_path, monkeypatch):
    """self-healing 수정은 DB 행의 경로 안에만 쓴다."""
    from api.deps import get_db_session

    project_path = _make_project_tree(tmp_path / "Agent-System")
    _install_db(authenticated_app, monkeypatch, _row(str(project_path)))
    _forbid_legacy_registry(monkeypatch)

    try:
        response = await _post(
            authenticated_app,
            f"/api/projects/{DB_UUID}/diagnostics/fix",
            {"fix_action": "create_claude_md", "params": {}},
        )

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["success"] is True
        assert body["diagnostics"]["project_id"] == DB_UUID
        assert (project_path / "CLAUDE.md").exists()
    finally:
        authenticated_app.dependency_overrides.pop(get_db_session, None)


# ─────────────────────────────────────────────────────────────
# 2. 인증·인가 (파일시스템 접근보다 먼저)
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_unauthenticated_request_is_rejected(app, tmp_path, monkeypatch):
    """토큰 없는 요청은 401 — DB 모드에서도 그대로다."""
    from api.deps import get_db_session

    project_path = _make_project_tree(tmp_path / "Agent-System")
    _install_db(app, monkeypatch, _row(str(project_path)))

    try:
        for url in (
            f"/api/projects/{DB_UUID}/diagnostics",
            f"/api/projects/{DB_UUID}/diagnostics/workspace",
        ):
            response = await _get(app, url)
            assert response.status_code == 401, f"{url} -> {response.status_code}"

        posted = await _post(
            app,
            f"/api/projects/{DB_UUID}/diagnostics/fix",
            {"fix_action": "create_claude_md", "params": {}},
        )
        assert posted.status_code == 401, posted.text
    finally:
        app.dependency_overrides.pop(get_db_session, None)


@pytest.mark.asyncio
async def test_denied_project_access_is_forbidden(app, tmp_path, monkeypatch):
    """권한 없는 인증 사용자는 403 — 진단이 파일시스템에 닿기 전에 막힌다."""
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
        raise AssertionError("diagnostics must not run before authorization")

    monkeypatch.setattr("api.diagnostics.run_diagnostics", _forbidden)

    try:
        response = await _get(app, f"/api/projects/{DB_UUID}/diagnostics")
        assert response.status_code == 403, response.text
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db_session, None)


@pytest.mark.asyncio
async def test_viewer_can_read_but_cannot_execute_fix(app, tmp_path, monkeypatch):
    """읽기는 viewer, 수정은 editor — DB 모드에서도 등급이 유지된다."""
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

    def _forbidden(*_args, **_kwargs):
        raise AssertionError("fix must not touch the filesystem before authorization")

    monkeypatch.setattr("api.diagnostics.execute_fix", _forbidden)

    try:
        readable = await _get(app, f"/api/projects/{DB_UUID}/diagnostics")
        assert readable.status_code == 200, readable.text

        response = await _post(
            app,
            f"/api/projects/{DB_UUID}/diagnostics/fix",
            {"fix_action": "create_claude_md", "params": {}},
        )
        assert response.status_code == 403, response.text
        assert not (project_path / "CLAUDE.md").exists()
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

    response = await _get(app, f"/api/projects/{UNREGISTERED_UUID}/diagnostics")

    assert response.status_code == 404, response.text


@pytest.mark.asyncio
async def test_path_derived_id_is_not_authority_in_database_mode(db_mode_app):
    """경로 파생 id 로는 닿지 못한다 — 레거시 파일시스템 폴백이 없다."""
    app, project_path = db_mode_app
    leaked_id = project_path.replace("/", "-")

    response = await _get(app, f"/api/projects/{leaked_id}/diagnostics")

    assert response.status_code == 404, response.text


@pytest.mark.asyncio
async def test_blank_identity_is_rejected(db_mode_app):
    """공백 식별자는 400 — 빈 문자열이 필터를 넓히지 못하게 한다."""
    app, _ = db_mode_app

    response = await _get(app, "/api/projects/%20/diagnostics")

    assert response.status_code == 400, response.text


# ─────────────────────────────────────────────────────────────
# 4. fail-closed 503 — 두 원인을 detail 로 분리해 검증
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_db_project_without_path_stays_fail_closed(authenticated_app, monkeypatch):
    """경로 없는 DB 프로젝트는 세 표면 모두 503 — 레거시로 폴백하지 않는다."""
    from api.deps import get_db_session

    _install_db(authenticated_app, monkeypatch, _row(None))
    _forbid_legacy_registry(monkeypatch)

    try:
        for url in (
            f"/api/projects/{DB_UUID}/diagnostics",
            f"/api/projects/{DB_UUID}/diagnostics/workspace",
        ):
            response = await _get(authenticated_app, url)
            assert response.status_code == 503, f"{url} -> {response.text}"
            assert "path" in response.json()["detail"].lower()

        posted = await _post(
            authenticated_app,
            f"/api/projects/{DB_UUID}/diagnostics/fix",
            {"fix_action": "create_claude_md", "params": {}},
        )
        assert posted.status_code == 503, posted.text
        assert "path" in posted.json()["detail"].lower()
    finally:
        authenticated_app.dependency_overrides.pop(get_db_session, None)


@pytest.mark.asyncio
async def test_db_project_with_non_directory_path_stays_fail_closed(
    authenticated_app, tmp_path, monkeypatch
):
    """등록된 경로가 디렉터리가 아니면 503 — 존재만으로는 통과시키지 않는다."""
    from api.deps import get_db_session

    not_a_directory = tmp_path / "registered-as-a-file"
    not_a_directory.write_text("not a project", encoding="utf-8")
    _install_db(authenticated_app, monkeypatch, _row(str(not_a_directory)))
    _forbid_legacy_registry(monkeypatch)

    try:
        response = await _get(authenticated_app, f"/api/projects/{DB_UUID}/diagnostics")
        assert response.status_code == 503, response.text
        assert "path" in response.json()["detail"].lower()
    finally:
        authenticated_app.dependency_overrides.pop(get_db_session, None)


@pytest.mark.asyncio
async def test_database_failure_is_reported_as_unavailable(
    authenticated_app, tmp_path, monkeypatch
):
    """DB 조회 자체가 실패하면 503 — 위의 '경로 없음' 503 과 detail 이 다르다."""
    from api.deps import get_db_session

    project_path = _make_project_tree(tmp_path / "Agent-System")
    database = _install_db(authenticated_app, monkeypatch, _row(str(project_path)))
    _forbid_legacy_registry(monkeypatch)

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
        response = await _get(authenticated_app, f"/api/projects/{DB_UUID}/diagnostics")
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
    from models.project import Project

    project_path = _make_project_tree(tmp_path / "fs-project")
    legacy = Project.from_path("fs-project", str(project_path))

    monkeypatch.setenv("USE_DATABASE", "false")
    monkeypatch.setattr(
        "api.diagnostics.get_project",
        lambda pid: legacy if pid == "fs-project" else None,
    )

    async def _override():
        yield SimpleNamespace()

    authenticated_app.dependency_overrides[get_db_session] = _override
    try:
        response = await _get(authenticated_app, "/api/projects/fs-project/diagnostics")
        assert response.status_code == 200, response.text
        assert response.json()["project_id"] == "fs-project"

        category = await _get(authenticated_app, "/api/projects/fs-project/diagnostics/workspace")
        assert category.status_code == 200, category.text
        assert list(category.json()["categories"]) == ["workspace"]

        fixed = await _post(
            authenticated_app,
            "/api/projects/fs-project/diagnostics/fix",
            {"fix_action": "create_claude_md", "params": {}},
        )
        assert fixed.status_code == 200, fixed.text
        assert (project_path / "CLAUDE.md").exists()

        missing = await _get(authenticated_app, "/api/projects/nope/diagnostics")
        assert missing.status_code == 404, missing.text
    finally:
        authenticated_app.dependency_overrides.pop(get_db_session, None)
