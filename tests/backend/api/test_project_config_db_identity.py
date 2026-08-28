"""DB 모드에서 project-config 표면의 공개 id 는 `ProjectModel.id` 여야 한다.

DB 모드의 프로젝트 권위는 `ProjectModel` 이다 — `/api/projects`·세션 리졸버·
`deps.require_project_role`·`api/git/_shared.resolve_project` 가 전부 UUID 를
키로 쓴다. 그런데 `/api/project-configs` 만 `ProjectConfigMonitor` 의 경로 파생
id(`-Users-me-Work-Proj`)를 그대로 내보냈다. 대시보드는 목록에서 받은
`project_id` 를 그대로 자식 라우트에 보내므로(`stores/projectConfigs/projects.ts`)
두 표면의 id 어휘가 갈리면 같은 프로젝트가 화면마다 다른 키를 갖는다.

여기서 고정하는 계약은 둘이다:

  1. **바깥으로 나가는 id 는 정규 DB id** — 목록·요약 모두. 경로 파생 id 를
     공개 신원으로 내보내지 않는다.
  2. **안에서는 해석한다** — 정규 id 로 들어온 자식 라우트가 등록된 경로의
     모니터 식별자로 해석돼야 한다. 해석이 없으면 대시보드가 방금 받은 id 로
     보낸 첫 요청이 404 가 된다.

파일시스템 모드의 경로 파생 id 는 그대로 유지된다(같은 파일 마지막 테스트).

라우트 전체(프레임워크 배선 포함)를 지나가게 한다 — 핸들러 직접 호출은
라우터 소유 의존성(`require_project_config_access`)을 건너뛰어 이 계약을
전혀 검증하지 못한다.
"""

from types import SimpleNamespace

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

DB_UUID = "7f2a1c30-9b4e-4d51-8a17-2c6f0e3b9d44"


def _make_project_tree(root):
    """`.claude/skills/demo/SKILL.md` 하나를 가진 최소 프로젝트."""
    skill_dir = root / ".claude" / "skills" / "demo"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(
        "---\nname: demo\ndescription: demo skill\n---\n\n# Demo\n",
        encoding="utf-8",
    )
    return root


@pytest.fixture
def isolated_monitor(monkeypatch, tmp_path):
    """자동 탐색이 꺼진 전용 모니터를 전역 싱글턴 자리에 꽂는다.

    `get_project_config_monitor` 는 여러 모듈이 `from ... import` 로 복사해 갔다.
    정의 모듈의 싱글턴(`_monitor`)을 갈아끼우면 복사본 전부가 이 인스턴스를
    돌려준다 — 임포트한 모듈마다 patch 할 필요가 없다.
    """
    from services.project_config_monitor import ProjectConfigMonitor

    monitor = ProjectConfigMonitor(
        project_paths=[],
        include_current=False,
        include_env_paths=False,
        allow_auto_discovery=False,
    )
    monkeypatch.setattr("services.project_config_monitor._monitor", monitor)
    return monitor


def _database_stub(row):
    """`ProjectModel` 행 하나만 돌려주는 세션 스텁."""

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

    return Database


@pytest_asyncio.fixture
async def db_mode_app(authenticated_app, tmp_path, monkeypatch, isolated_monitor):
    """DB 에 UUID id 프로젝트 1건만 등록된 상태의 앱.

    `tmp_path` 는 macOS 에서 `/var/folders/...`(→ `/private/var/...`) 심링크다.
    모니터는 해석된 경로를 키로 쓰므로, 미해석 경로로 만든 id 는 매칭되지 않는다
    — 이 픽스처가 그 실제 조건을 그대로 재현한다.
    """
    from api.deps import get_db_session

    project_path = _make_project_tree(tmp_path / "Agent-System")

    row = SimpleNamespace(
        id=DB_UUID,
        name="Agent-System",
        slug="agent-system",
        description="",
        path=str(project_path),
        is_active=True,
        settings={},
        organization_id=None,
        created_at=None,
        updated_at=None,
    )

    Database = _database_stub(row)

    async def _override():
        yield Database()

    monkeypatch.setenv("USE_DATABASE", "true")
    # 목록 필터(`_get_db_filtered_projects`)는 주입된 세션이 아니라 자체
    # `async_session_factory()` 를 연다. override 만으로는 실 DB 에 붙는다.
    monkeypatch.setattr("db.database.async_session_factory", lambda: Database())
    authenticated_app.dependency_overrides[get_db_session] = _override
    yield authenticated_app, str(project_path)
    authenticated_app.dependency_overrides.pop(get_db_session, None)


async def _get(app, url):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        return await ac.get(url)


@pytest.mark.asyncio
async def test_list_exposes_canonical_database_project_id(db_mode_app):
    """목록의 `project_id` 는 DB id 다 — 경로 파생 id 가 아니다."""
    app, project_path = db_mode_app

    response = await _get(app, "/api/project-configs")

    assert response.status_code == 200, response.text
    projects = response.json()["projects"]
    assert len(projects) == 1
    assert projects[0]["project_id"] == DB_UUID
    assert projects[0]["project_path"] == project_path


@pytest.mark.asyncio
async def test_summary_resolves_and_returns_canonical_project_id(db_mode_app):
    """목록에서 받은 id 로 요약을 조회할 수 있고, 요약도 같은 id 를 돌려준다."""
    app, _ = db_mode_app

    response = await _get(app, f"/api/project-configs/{DB_UUID}")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["project"]["project_id"] == DB_UUID
    # 요약 안의 자식 자산도 같은 어휘를 써야 한다 — 대시보드는
    # `skill.project_id` 로 다음 요청을 만든다(`stores/projectConfigs/skills.ts`).
    assert [skill["project_id"] for skill in body["skills"]] == [DB_UUID]


@pytest.mark.asyncio
async def test_child_config_route_resolves_canonical_project_id(db_mode_app):
    """자식 설정 라우트도 정규 id 로 닿아야 한다."""
    app, _ = db_mode_app

    response = await _get(app, f"/api/project-configs/{DB_UUID}/skills")

    assert response.status_code == 200, response.text
    assert [skill["skill_id"] for skill in response.json()] == ["demo"]


@pytest.mark.asyncio
async def test_unregistered_path_id_is_not_reachable_in_database_mode(
    db_mode_app, tmp_path, monkeypatch, isolated_monitor
):
    """DB 미등록 경로는 경로 파생 id 로도 닿지 못한다(파일시스템 폴백 금지)."""
    app, _ = db_mode_app

    outsider = _make_project_tree(tmp_path / "not-in-db")
    isolated_monitor.add_external_project(str(outsider))
    leaked_id = str(outsider.resolve()).replace("/", "-")

    response = await _get(app, f"/api/project-configs/{leaked_id}/skills")

    assert response.status_code == 404, response.text


@pytest.mark.asyncio
async def test_filesystem_mode_keeps_path_derived_ids(
    authenticated_app, tmp_path, monkeypatch, isolated_monitor
):
    """파일시스템 모드의 경로 파생 id 와 동작은 그대로다."""
    from api.deps import get_db_session

    project_path = _make_project_tree(tmp_path / "fs-project")
    isolated_monitor.add_external_project(str(project_path))
    expected_id = str(project_path.resolve()).replace("/", "-")

    async def _override():
        yield SimpleNamespace()

    monkeypatch.setenv("USE_DATABASE", "false")
    authenticated_app.dependency_overrides[get_db_session] = _override
    try:
        listed = await _get(authenticated_app, "/api/project-configs")
        assert listed.status_code == 200, listed.text
        assert [p["project_id"] for p in listed.json()["projects"]] == [expected_id]

        summary = await _get(authenticated_app, f"/api/project-configs/{expected_id}")
        assert summary.status_code == 200, summary.text
        assert summary.json()["project"]["project_id"] == expected_id

        skills = await _get(authenticated_app, f"/api/project-configs/{expected_id}/skills")
        assert skills.status_code == 200, skills.text
        assert [s["skill_id"] for s in skills.json()] == ["demo"]
    finally:
        authenticated_app.dependency_overrides.pop(get_db_session, None)
