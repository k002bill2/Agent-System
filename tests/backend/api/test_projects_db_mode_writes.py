"""DB 모드(`USE_DATABASE=true`)에서 대시보드의 프로젝트 쓰기 3종이 동작해야 한다.

PR #318 이 `POST /api/projects/link`·`/create`·`/reorder` 를 DB 모드에서
503 "Use the database project registry" 로 잠갔지만, 대시보드 store
(`stores/projects.ts`)는 여전히 이 세 경로를 호출한다. 그리고 `.env`/`.env.example`
기본값이 `USE_DATABASE=true` 라서 기본 설치에서 Link Existing / Create New /
드래그 정렬이 전부 실패한다.

`/api/project-registry` 로 프론트를 옮기는 것은 답이 아니다 — 그 API 는 사용자가
고른 id 를 버리고 UUID 를 찍으며(기존 행은 slug id: apfs·kiips·vcs), 템플릿
스캐폴딩과 정렬 엔드포인트가 없다. 대신 같은 파일의 `PUT /api/projects/{id}` 가
이미 하듯 DB 인지형 분기를 둔다.

여기서 고정하는 계약:
  1. 세 경로는 DB 모드에서 503 이 아니다.
  2. link/create 는 요청 `id` 를 그대로 `ProjectModel.id` 로 쓰고 심볼릭 링크를
     만들지 않는다(그 파일시스템 부작용이 게이트가 막던 것이다).
  3. 중복 id/name 은 409 — `IntegrityError` 가 일반 503 으로 새지 않는다.
  4. reorder 는 `settings["sort_order"]` 를 **새 dict 재할당**으로 기록하고
     (JSONB 제자리 변경은 SQLAlchemy 가 추적하지 않는다), GET 과 같은 모양의
     전체 목록을 `sort_order` 순으로 돌려준다.
  5. GET `/api/projects` 의 DB 분기도 `sort_order` 로 정렬한다 — 아니면 새로고침
     한 번에 정렬이 풀린다.

라우터 전체를 지나가게 한다(핸들러 직접 호출 금지) — 인가 의존성과 응답 모델
직렬화까지 계약이다.
"""

from types import SimpleNamespace

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient


def _row(project_id: str, name: str, *, sort_order: int = 0, path: str = "/tmp/x"):
    return SimpleNamespace(
        id=project_id,
        name=name,
        slug=project_id,
        description="",
        path=path,
        is_active=True,
        settings={"sort_order": sort_order},
        organization_id=None,
        created_at=None,
        updated_at=None,
        created_by=None,
    )


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None

    def scalars(self):
        return SimpleNamespace(all=lambda: list(self._rows))

    def all(self):
        return [(r.id, r.path, r.organization_id) for r in self._rows]


class FakeSession:
    """`ProjectModel` 행 몇 개를 든 세션 스텁.

    쿼리 문자열을 파싱하지 않는다. 컴파일된 바인드 값에 id/name/slug 가 걸리는
    행만 돌려주고, 바인드가 없으면(목록 조회) 전부 돌려준다. `add()` 는 기록만
    한다 — 핸들러가 무엇을 INSERT 하려 했는지 테스트가 들여다본다.
    """

    def __init__(self, rows):
        self.rows = list(rows)
        self.added = []
        self.commits = 0

    async def execute(self, stmt, *_args, **_kwargs):
        params = stmt.compile().params
        bound = set()
        for value in params.values():
            if isinstance(value, (list, tuple, set)):
                bound.update(value)
            else:
                bound.add(value)
        if not bound:
            return _Result(self.rows)
        hits = [r for r in self.rows if {r.id, r.name, r.slug} & bound]
        return _Result(hits)

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        return None

    async def commit(self):
        self.commits += 1

    async def refresh(self, _obj):
        return None

    async def rollback(self):
        return None


@pytest_asyncio.fixture
async def db_mode(authenticated_app, monkeypatch, tmp_path):
    """DB 모드 + 가짜 세션 + RAG 비활성 + 스캐폴딩 대상 디렉터리를 tmp 로 격리."""
    from api.deps import get_db_session

    monkeypatch.setenv("USE_DATABASE", "true")

    session = FakeSession(
        [_row("apfs", "APFS", sort_order=0), _row("kiips", "KiiPS", sort_order=1)]
    )

    async def _override():
        yield session

    authenticated_app.dependency_overrides[get_db_session] = _override

    # GET /api/projects 는 Qdrant 통계를 붙이려 한다 — 테스트에서 네트워크 금지.
    import services.rag_service as rag_service

    def _no_store():
        raise ValueError("rag disabled in test")

    monkeypatch.setattr(rag_service, "get_vector_store", _no_store)

    # create 는 리포지토리 루트의 projects/ 아래에 스캐폴딩한다 — 잔여물 금지.
    projects_dir = tmp_path / "projects"
    monkeypatch.setattr("api.routes.get_projects_dir", lambda: projects_dir)

    try:
        yield authenticated_app, session, tmp_path, projects_dir
    finally:
        authenticated_app.dependency_overrides.pop(get_db_session, None)


async def _post(app, url, body):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        return await ac.post(url, json=body)


async def _get(app, url):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        return await ac.get(url)


# ── link ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_link_registers_db_row_with_requested_id_and_no_symlink(db_mode):
    app, session, tmp_path, projects_dir = db_mode
    source = tmp_path / "KVCA"
    source.mkdir()

    resp = await _post(
        app,
        "/api/projects/link",
        {"id": "kvca", "source_path": str(source), "name": "KVCA", "description": "벤처"},
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == "kvca"
    assert body["name"] == "KVCA"
    assert body["path"] == str(source)

    from db.models import ProjectAccessModel, ProjectModel

    inserted = [o for o in session.added if isinstance(o, ProjectModel)]
    assert len(inserted) == 1
    assert inserted[0].id == "kvca"
    assert inserted[0].name == "KVCA"
    assert inserted[0].description == "벤처"
    assert inserted[0].path == str(source)
    owner = [o for o in session.added if isinstance(o, ProjectAccessModel)]
    assert len(owner) == 1 and owner[0].role == "owner" and owner[0].project_id == "kvca"
    assert session.commits == 1
    assert not (projects_dir / "kvca").exists(), "DB 모드에서는 심볼릭 링크를 만들지 않는다"


@pytest.mark.asyncio
async def test_link_name_falls_back_to_directory_name(db_mode):
    app, session, tmp_path, _ = db_mode
    source = tmp_path / "My-Repo"
    source.mkdir()

    resp = await _post(app, "/api/projects/link", {"id": "my-repo", "source_path": str(source)})

    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "My-Repo"


@pytest.mark.asyncio
async def test_link_duplicate_id_is_409(db_mode):
    app, session, tmp_path, _ = db_mode
    source = tmp_path / "dup"
    source.mkdir()

    resp = await _post(
        app, "/api/projects/link", {"id": "apfs", "source_path": str(source), "name": "New"}
    )

    assert resp.status_code == 409, resp.text
    assert session.added == []


@pytest.mark.asyncio
async def test_link_duplicate_name_is_409(db_mode):
    app, session, tmp_path, _ = db_mode
    source = tmp_path / "dup"
    source.mkdir()

    resp = await _post(
        app, "/api/projects/link", {"id": "fresh", "source_path": str(source), "name": "APFS"}
    )

    assert resp.status_code == 409, resp.text
    assert session.added == []


@pytest.mark.asyncio
async def test_link_slug_only_collision_gets_suffixed_like_registry(db_mode):
    """slug 만 겹치면(id·name 은 새것) 409 가 아니라 registry 와 같은 `-{id[:8]}` 접미사.

    모달은 slug 를 보여주지 않으므로 slug 409 는 사용자가 해석할 수 없다.
    `api/projects/registry.py::create_project` 와 규칙을 맞춘다.
    """
    app, session, tmp_path, _ = db_mode
    source = tmp_path / "apfs-two"
    source.mkdir()

    # name "apfs" → slug "apfs" 는 기존 행(id=apfs, name=APFS)과 slug 만 겹친다
    resp = await _post(
        app, "/api/projects/link", {"id": "apfs2", "source_path": str(source), "name": "apfs"}
    )

    assert resp.status_code == 200, resp.text
    from db.models import ProjectModel

    inserted = [o for o in session.added if isinstance(o, ProjectModel)]
    assert len(inserted) == 1
    assert inserted[0].slug == "apfs-apfs2"


@pytest.mark.asyncio
async def test_link_missing_source_path_is_400(db_mode):
    app, _, tmp_path, _ = db_mode

    resp = await _post(
        app, "/api/projects/link", {"id": "ghost", "source_path": str(tmp_path / "nope")}
    )

    assert resp.status_code == 400, resp.text


# ── create ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_scaffolds_template_and_registers_db_row(db_mode):
    app, session, _, projects_dir = db_mode

    resp = await _post(
        app,
        "/api/projects/create",
        {"id": "newproj", "name": "New Proj", "description": "d", "template": "default"},
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == "newproj"
    assert body["path"] == str(projects_dir / "newproj")
    assert (projects_dir / "newproj").is_dir()

    from db.models import ProjectModel

    inserted = [o for o in session.added if isinstance(o, ProjectModel)]
    assert len(inserted) == 1
    assert inserted[0].id == "newproj"
    assert inserted[0].path == str(projects_dir / "newproj")
    assert session.commits == 1


@pytest.mark.asyncio
async def test_create_duplicate_id_is_409_and_leaves_no_directory(db_mode):
    app, session, _, projects_dir = db_mode

    resp = await _post(
        app,
        "/api/projects/create",
        {"id": "apfs", "name": "Other", "description": "", "template": "default"},
    )

    assert resp.status_code == 409, resp.text
    assert session.added == []
    assert not (projects_dir / "apfs").exists(), "중복 검사는 스캐폴딩보다 먼저"


@pytest.mark.asyncio
async def test_create_removes_scaffold_when_db_registration_fails(db_mode):
    """사전 검사 뒤 경쟁 INSERT·commit 실패가 나면 503 이지만, 스캐폴드는 남기지 않는다.

    남기면 다음 재시도가 `Path already exists` 로 영영 막히고, 등록 안 된 디렉터리가
    projects/ 에 고아로 남는다.
    """
    app, session, _, projects_dir = db_mode

    async def _boom():
        raise RuntimeError("unique violation after pre-check")

    session.commit = _boom  # type: ignore[method-assign]

    resp = await _post(
        app,
        "/api/projects/create",
        {"id": "flaky", "name": "Flaky", "description": "", "template": "default"},
    )

    assert resp.status_code == 503, resp.text
    assert not (projects_dir / "flaky").exists()


# ── reorder ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_reorder_persists_sort_order_and_returns_full_list_in_order(db_mode):
    app, session, _, _ = db_mode
    kiips = next(r for r in session.rows if r.id == "kiips")
    original_settings = kiips.settings

    resp = await _post(app, "/api/projects/reorder", {"project_ids": ["kiips", "apfs"]})

    assert resp.status_code == 200, resp.text
    assert [p["id"] for p in resp.json()] == ["kiips", "apfs"]
    assert [p["sort_order"] for p in resp.json()] == [0, 1]
    assert kiips.settings["sort_order"] == 0
    assert kiips.settings is not original_settings, "JSONB 는 새 dict 로 재할당해야 dirty 로 잡힌다"
    assert session.commits == 1


@pytest.mark.asyncio
async def test_reorder_unknown_id_is_404(db_mode):
    app, session, _, _ = db_mode

    resp = await _post(app, "/api/projects/reorder", {"project_ids": ["kiips", "ghost"]})

    assert resp.status_code == 404, resp.text
    assert session.commits == 0


# ── GET ordering ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_projects_db_mode_orders_by_sort_order_then_name(db_mode):
    app, session, _, _ = db_mode
    session.rows = [
        _row("apfs", "APFS", sort_order=2),
        _row("kiips", "KiiPS", sort_order=0),
        _row("vcs", "VCS", sort_order=0),
    ]

    resp = await _get(app, "/api/projects")

    assert resp.status_code == 200, resp.text
    assert [p["id"] for p in resp.json()] == ["kiips", "vcs", "apfs"]


@pytest.mark.asyncio
async def test_get_projects_db_mode_reports_claude_md_presence(db_mode):
    """DB 분기는 `Project` 를 손으로 조립해 `claude_md` 가 항상 None 이었다.

    기본 템플릿은 CLAUDE.md 를 만들지만 카드에는 '없음'으로 보여 Claude 설정 액션이
    숨는다(`ProjectsPage.tsx`). store 는 link/create 응답을 버리고 GET 을 다시 부르므로
    목록 응답에서 존재 여부를 계산해야 한다.
    """
    app, session, tmp_path, _ = db_mode
    with_md = tmp_path / "with-md"
    with_md.mkdir()
    (with_md / "CLAUDE.md").write_text("# hi\n", encoding="utf-8")
    without_md = tmp_path / "without-md"
    without_md.mkdir()
    session.rows = [
        _row("a", "A", path=str(with_md)),
        _row("b", "B", path=str(without_md)),
    ]

    resp = await _get(app, "/api/projects")

    assert resp.status_code == 200, resp.text
    assert {p["id"]: p["has_claude_md"] for p in resp.json()} == {"a": True, "b": False}
