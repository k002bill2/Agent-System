"""DB 모드에서 우측 Project Context 패널이 실제로 동작해야 한다.

`#328` 이후 DB 모드의 `/projects/{id}/context` 와 `/projects/{id}/claude-md` 는
`reject_legacy_project_operation_in_database_mode()` 로 통째로 503 이었다.
그 게이트는 레거시 파일시스템 레지스트리(`models.project.get_project`)가 DB
모드의 인가 경계 밖에 있기 때문에 옳았지만, 대신 Context 패널이 통째로
"Project context is unavailable in database mode" 로 죽었다.

여기서 고정하는 계약 (`test_monitoring_db_health.py` 와 같은 계약을 context
표면에 적용한다):

  1. **공개 신원은 `ProjectModel.id`** — 응답의 `project_id` 는 요청한 정규
     id 와 같아야 한다. 대시보드가 그 값으로 다음 요청을 만든다.
  2. **읽는 경로는 DB 행의 `path` 하나뿐** — 경로 파생 id 나 임의 경로가
     권위가 되지 않는다. 레거시 레지스트리(`get_project`)는 DB 모드에서 절대
     호출되지 않는다.
  3. **인가가 파일시스템 접근보다 먼저** — 401/403/404 는 그대로, 503 은 진짜
     사용 불가한 DB 의존성과 '등록된 디렉터리 없음' 에만.
  4. **DB `Project` 는 파일시스템 metadata를 identity로 사용하지 않음** — DB의
     name·description·organization_id가 권위이고, 별도 DB git_path가 없으므로
     context는 등록된 프로젝트 루트의 CLAUDE.md와 dev/active만 읽는다.

라우트 전체(프레임워크 배선 포함)를 지나가게 한다 — 핸들러 직접 호출은
`Depends(get_current_user)` 와 경로 파라미터 추출을 건너뛰어 이 계약을 검증하지
못한다.
"""

from types import SimpleNamespace

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

DB_UUID = "3f9c1b74-6d20-4a8e-9c31-5b7e0d2a8f61"
UNREGISTERED_UUID = "00000000-0000-4000-8000-000000000000"

CLAUDE_MD_BODY = "# Registered project\n\nRead from the DB-registered directory."
DEV_DOC_BODY = "# Active task\n\nnotes"


def _make_project_tree(root):
    """CLAUDE.md 와 `dev/active` 문서를 가진 최소 프로젝트.

    두 파일의 내용이 응답에 그대로 나타나야 **이 경로를 실제로 읽었다**는
    증거가 된다 — 경로만 에코하는 구현으로는 통과하지 못한다.
    """
    root.mkdir(parents=True)
    (root / "CLAUDE.md").write_text(CLAUDE_MD_BODY, encoding="utf-8")
    dev_active = root / "dev" / "active"
    dev_active.mkdir(parents=True)
    (dev_active / "task.md").write_text(DEV_DOC_BODY, encoding="utf-8")
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


def _row(path, name="Agent-System"):
    return SimpleNamespace(
        id=DB_UUID,
        name=name,
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

    monkeypatch.setattr("api.context.get_project", _forbidden)

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
async def test_context_reads_the_registered_db_path(db_mode_app):
    """context 는 **DB 행의 경로**에서 CLAUDE.md 와 dev/active 를 읽는다."""
    app, project_path = db_mode_app

    response = await _get(app, f"/api/projects/{DB_UUID}/context")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["project_id"] == DB_UUID
    assert body["project_name"] == "Agent-System"
    assert body["project_path"] == project_path
    assert body["claude_md"] == CLAUDE_MD_BODY
    assert [doc["name"] for doc in body["dev_docs"]] == ["task.md"]
    assert body["dev_docs"][0]["content"] == DEV_DOC_BODY


@pytest.mark.asyncio
async def test_context_rejects_dev_active_symlink_escape(authenticated_app, tmp_path, monkeypatch):
    """dev/active 심링크가 DB 등록 루트 밖으로 나가면 읽지 않는다."""
    from api.deps import get_db_session

    project_path = tmp_path / "Agent-System"
    project_path.mkdir()
    (project_path / "CLAUDE.md").write_text(CLAUDE_MD_BODY, encoding="utf-8")
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "secret.md").write_text("not for this project", encoding="utf-8")
    (project_path / "dev").mkdir()
    (project_path / "dev" / "active").symlink_to(outside, target_is_directory=True)
    _install_db(authenticated_app, monkeypatch, _row(str(project_path)))

    response = await _get(authenticated_app, f"/api/projects/{DB_UUID}/context")

    assert response.status_code == 200, response.text
    assert response.json()["dev_docs"] == []
    authenticated_app.dependency_overrides.pop(get_db_session, None)


@pytest.mark.asyncio
async def test_claude_md_reads_the_registered_db_path(db_mode_app):
    """`/claude-md` 도 같은 경로에서 읽는다."""
    app, _ = db_mode_app

    response = await _get(app, f"/api/projects/{DB_UUID}/claude-md")

    assert response.status_code == 200, response.text
    assert response.json()["content"] == CLAUDE_MD_BODY


@pytest.mark.asyncio
async def test_missing_claude_md_is_not_found_not_unavailable(authenticated_app, tmp_path, monkeypatch):
    """등록 경로는 있는데 CLAUDE.md 만 없으면 404 — 503 이 아니다.

    503 은 '검사 가능한 디렉터리가 없음' 하나에만 남겨 둔다. 두 원인을 같은
    코드로 뭉개면 대시보드가 '설정 문제'와 '파일 없음'을 구분하지 못한다.
    """
    from api.deps import get_db_session

    project_path = tmp_path / "no-claude-md"
    project_path.mkdir()
    _install_db(authenticated_app, monkeypatch, _row(str(project_path)))
    try:
        response = await _get(authenticated_app, f"/api/projects/{DB_UUID}/claude-md")
        assert response.status_code == 404, response.text

        context = await _get(authenticated_app, f"/api/projects/{DB_UUID}/context")
        assert context.status_code == 200, context.text
        assert context.json()["claude_md"] is None
    finally:
        authenticated_app.dependency_overrides.pop(get_db_session, None)


# ─────────────────────────────────────────────────────────────
# 2. 인증·인가
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_unauthenticated_request_is_rejected(app, tmp_path, monkeypatch):
    """토큰 없는 요청은 401 — DB 모드에서도 그대로다."""
    from api.deps import get_db_session

    project_path = _make_project_tree(tmp_path / "Agent-System")
    _install_db(app, monkeypatch, _row(str(project_path)))

    try:
        for url in (
            f"/api/projects/{DB_UUID}/context",
            f"/api/projects/{DB_UUID}/claude-md",
        ):
            response = await _get(app, url)
            assert response.status_code == 401, f"{url} -> {response.status_code}"
    finally:
        app.dependency_overrides.pop(get_db_session, None)


@pytest.mark.asyncio
async def test_denied_project_access_is_forbidden_before_filesystem_access(
    app, tmp_path, monkeypatch
):
    """권한 없는 인증 사용자는 403 — 파일시스템에 닿기 전에 막힌다."""
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

    async def _forbidden(*_args, **_kwargs):
        raise AssertionError("project resolution must not run before authorization")

    # 인가 실패는 대상 해석(=파일시스템 접근의 유일한 문)보다 먼저 나야 한다.
    monkeypatch.setattr("api.context._context_target", _forbidden)

    try:
        for url in (
            f"/api/projects/{DB_UUID}/context",
            f"/api/projects/{DB_UUID}/claude-md",
        ):
            response = await _get(app, url)
            assert response.status_code == 403, f"{url} -> {response.text}"
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

    for url in (
        f"/api/projects/{UNREGISTERED_UUID}/context",
        f"/api/projects/{UNREGISTERED_UUID}/claude-md",
    ):
        response = await _get(app, url)
        assert response.status_code == 404, f"{url} -> {response.text}"


@pytest.mark.asyncio
async def test_path_derived_id_is_not_authority_in_database_mode(db_mode_app):
    """경로 파생 id 로는 닿지 못한다 — 레거시 파일시스템 폴백이 없다."""
    app, project_path = db_mode_app
    leaked_id = project_path.replace("/", "-")

    response = await _get(app, f"/api/projects/{leaked_id}/context")

    assert response.status_code == 404, response.text


@pytest.mark.asyncio
async def test_blank_identity_is_rejected(db_mode_app):
    """공백 식별자는 400 — 빈 문자열이 필터를 넓히지 못하게 한다."""
    app, _ = db_mode_app

    response = await _get(app, "/api/projects/%20/context")

    assert response.status_code == 400, response.text


# ─────────────────────────────────────────────────────────────
# 4. 503 은 두 원인뿐 — detail 로 구분된다
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_db_project_without_path_stays_fail_closed(authenticated_app, monkeypatch):
    """경로 없는 DB 프로젝트는 503 이고 detail 이 경로 문제를 명시한다."""
    from api.deps import get_db_session

    _install_db(authenticated_app, monkeypatch, _row(None))
    try:
        for url in (
            f"/api/projects/{DB_UUID}/context",
            f"/api/projects/{DB_UUID}/claude-md",
        ):
            response = await _get(authenticated_app, url)
            assert response.status_code == 503, f"{url} -> {response.text}"
            assert "path" in response.json()["detail"].lower()
    finally:
        authenticated_app.dependency_overrides.pop(get_db_session, None)


@pytest.mark.asyncio
async def test_registered_path_that_is_not_a_directory_stays_fail_closed(
    authenticated_app, tmp_path, monkeypatch
):
    """등록 경로가 디렉터리가 아니면 503 — 파일을 프로젝트 루트로 쓰지 않는다."""
    from api.deps import get_db_session

    not_a_dir = tmp_path / "regular-file"
    not_a_dir.write_text("not a project", encoding="utf-8")
    _install_db(authenticated_app, monkeypatch, _row(str(not_a_dir)))
    try:
        response = await _get(authenticated_app, f"/api/projects/{DB_UUID}/context")
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
        response = await _get(authenticated_app, f"/api/projects/{DB_UUID}/context")
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
        "api.context.get_project",
        lambda pid: legacy if pid == "fs-project" else None,
    )

    async def _override():
        yield SimpleNamespace()

    authenticated_app.dependency_overrides[get_db_session] = _override
    try:
        response = await _get(authenticated_app, "/api/projects/fs-project/context")
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["project_id"] == "fs-project"
        assert body["claude_md"] == CLAUDE_MD_BODY
        assert [doc["name"] for doc in body["dev_docs"]] == ["task.md"]

        claude_md = await _get(authenticated_app, "/api/projects/fs-project/claude-md")
        assert claude_md.status_code == 200, claude_md.text
        assert claude_md.json()["content"] == CLAUDE_MD_BODY

        missing = await _get(authenticated_app, "/api/projects/nope/context")
        assert missing.status_code == 404, missing.text
    finally:
        authenticated_app.dependency_overrides.pop(get_db_session, None)
