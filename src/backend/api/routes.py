"""REST API routes — aggregate router.

This module was split into domain-specific modules:
- api.sessions        — Session & Task API
- api.monitoring      — Project health checks
- api.diagnostics     — Project environment diagnostics
- api.context         — Project context & context window meter
- api.hitl            — Human-in-the-Loop approvals
- api.warp            — Warp Terminal integration
- api.terminal        — Terminal integration (generic)
- api.permission_toggles — Permission toggles

The Projects API (CRUD for filesystem-based projects) remains here.

The ``router`` object re-exported from this module includes all sub-routers
so that ``app.py`` can keep a single ``include_router(router, prefix="/api")``.
"""

import os
import re
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

# Docker mode: skip host filesystem validations
IS_DOCKER = bool(os.getenv("CLAUDE_HOME"))

from api.deps import (
    get_current_admin_or_manager_user,
    get_current_user,
    get_db_session,
    reject_legacy_project_operation_in_database_mode,
    require_project_role,
)
from models.project import (
    Project,
    ProjectCreate,
    ProjectCreateFromTemplate,
    ProjectLinkRequest,
    ProjectResponse,
    ProjectUpdate,
    get_project,
    get_projects_dir,
    list_projects,
    normalize_path,
    register_project,
    reorder_projects,
    update_project,
)

# ─────────────────────────────────────────────────────────────
# Aggregate router — includes all domain sub-routers
# ─────────────────────────────────────────────────────────────

router = APIRouter(tags=["orchestration"])

# Include domain-specific sub-routers
from api.context import router as context_router
from api.diagnostics import router as diagnostics_router
from api.hitl import router as hitl_router
from api.monitoring import router as monitoring_router
from api.permission_toggles import router as permission_toggles_router
from api.sessions import router as sessions_router
from api.terminal import router as terminal_router
from api.warp import router as warp_router

router.include_router(sessions_router)
router.include_router(monitoring_router)
router.include_router(diagnostics_router)
router.include_router(context_router)
router.include_router(hitl_router)
router.include_router(warp_router)
router.include_router(terminal_router)
router.include_router(permission_toggles_router)


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────


from services.project_sync_service import sync_project_to_db as _sync_project_to_db

# ─────────────────────────────────────────────────────────────
# Project API — Request models
# ─────────────────────────────────────────────────────────────


class ProjectReorderRequest(BaseModel):
    """Request to reorder projects."""

    project_ids: list[str] = Field(..., description="List of project IDs in desired order")


# ─────────────────────────────────────────────────────────────
# Project API — Helpers
# ─────────────────────────────────────────────────────────────


async def get_inactive_project_paths(db: AsyncSession) -> set[str]:
    """DB project-registry에서 is_active=False인 프로젝트의 path set 반환.

    USE_DATABASE=false일 때만 빈 set을 반환한다. DB 오류는 접근제어
    정보를 신뢰할 수 없는 상태이므로 503으로 fail-closed 한다.
    """
    import os

    use_database = os.getenv("USE_DATABASE", "false").lower() == "true"
    if not use_database:
        return set()

    try:
        from sqlalchemy import select

        from db.models import ProjectModel

        result = await db.execute(
            select(ProjectModel.path).where(
                ProjectModel.is_active == False,  # noqa: E712
                ProjectModel.path.isnot(None),
            )
        )
        paths = {row[0] for row in result.all() if row[0]}
        return paths
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Project access control is temporarily unavailable",
        ) from exc


async def _get_accessible_paths_for_user(
    db: AsyncSession, user_id: str, admin_org_ids: list[str] | None = None
) -> set[str]:
    """파일시스템 프로젝트의 접근 가능한 path set을 반환.

    ProjectModel.path <-> project_access(project_id) 를 크로스레퍼런스하여
    파일시스템 프로젝트의 RBAC 필터링을 지원한다.

    접근 규칙:
        - 조직 admin/owner: 자신의 조직 프로젝트 + 명시적 ProjectAccess
        - 일반 member: 명시적 ProjectAccess만

    Returns:
        - set[str]: 접근 가능한 path 집합. DB registry/ACL 조회 실패 시 503으로
          fail-closed 처리한다.
    """
    try:
        from sqlalchemy import select

        from db.models import ProjectAccessModel, ProjectModel

        # 1. ProjectModel 전체 (path -> id, org_id) 매핑 구성
        proj_result = await db.execute(
            select(ProjectModel.id, ProjectModel.path, ProjectModel.organization_id)
        )
        path_map: list[tuple[str, str, str | None]] = [
            (row[0], row[1], row[2]) for row in proj_result.all() if row[1]
        ]

        if not path_map:
            # In database mode an empty registry is not permission to expose
            # filesystem projects; startup synchronization is incomplete.
            raise HTTPException(
                status_code=503,
                detail="Project access control is temporarily unavailable",
            )

        # 2. 이 user가 접근 가능한 project_id (UUID) 집합
        access_result = await db.execute(
            select(ProjectAccessModel.project_id).where(ProjectAccessModel.user_id == user_id)
        )
        user_accessible_uuids: set[str] = {row[0] for row in access_result.all()}

        admin_org_set = set(admin_org_ids) if admin_org_ids else set()

        # 3. path별 접근 가능 여부 판단
        accessible_paths: set[str] = set()
        for uuid, path, org_id in path_map:
            if uuid in user_accessible_uuids:
                # 사용자가 명시적으로 접근 가능 (ProjectAccess 레코드 존재)
                accessible_paths.add(path)
            elif org_id and org_id in admin_org_set:
                # 조직 admin/owner -> 자신의 조직 프로젝트
                accessible_paths.add(path)
            # else: 접근 불가

        return accessible_paths

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Project access control is temporarily unavailable",
        ) from exc


# ─────────────────────────────────────────────────────────────
# Project API — Endpoints
# ─────────────────────────────────────────────────────────────


@router.get("/projects", response_model=list[ProjectResponse])
async def get_projects(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List registered projects filtered by access control.

    접근 규칙:
        - 시스템 admin: 모든 프로젝트
        - 조직 admin/owner: 자신의 조직 프로젝트 + 명시적 ProjectAccess
        - 일반 member: 명시적 ProjectAccess만
        - DB 모드에서는 DB registry에 등록된 path만 표시
        - 메모리 모드에서는 기존 filesystem discovery를 사용
    """
    use_database = os.getenv("USE_DATABASE", "false").lower() == "true"
    if use_database:
        try:
            from sqlalchemy import or_, select

            from api.projects import _get_admin_org_ids
            from db.models import ProjectAccessModel, ProjectModel

            registry_result = await db.execute(select(ProjectModel).order_by(ProjectModel.name))
            registry_projects = registry_result.scalars().all()
            if not registry_projects or not any(p.is_active for p in registry_projects):
                raise HTTPException(
                    status_code=503,
                    detail="Project access control is temporarily unavailable",
                )

            is_admin = current_user.role == "admin" or current_user.is_admin
            if is_admin:
                visible_projects = [p for p in registry_projects if p.is_active]
            else:
                admin_org_ids = await _get_admin_org_ids(current_user)
                member_subq = select(ProjectAccessModel.project_id).where(
                    ProjectAccessModel.user_id == current_user.id
                )
                visible_result = await db.execute(
                    select(ProjectModel)
                    .where(
                        ProjectModel.is_active == True,  # noqa: E712
                        or_(
                            ProjectModel.organization_id.in_(admin_org_ids),
                            ProjectModel.id.in_(member_subq),
                        ),
                    )
                    .order_by(ProjectModel.name)
                )
                visible_projects = visible_result.scalars().all()

            inactive_paths = {p.path for p in registry_projects if not p.is_active and p.path}
            projects = [
                Project(
                    id=p.id,
                    name=p.name,
                    path=p.path or "",
                    description=p.description or "",
                    # `has_claude_md` 의 근거. 비워 두면 DB 모드 카드가 항상 '없음'이라
                    # Claude 설정 액션이 숨는다 — `Project.from_path` 와 같은 소스.
                    claude_md=_read_claude_md(p.path),
                    sort_order=(p.settings or {}).get("sort_order", 0),
                    organization_id=p.organization_id,
                )
                for p in visible_projects
            ]
            # 위 쿼리는 name 순이다. `POST /projects/reorder` 가 기록한
            # settings.sort_order 를 여기서 적용하지 않으면 새로고침 한 번에
            # 드래그 정렬이 풀린다 — 파일시스템 모드의 `list_projects()` 와 같은 키.
            projects.sort(key=lambda p: (p.sort_order, p.name.lower()))
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=503,
                detail="Project access control is temporarily unavailable",
            ) from exc
    else:
        projects = list_projects()
        inactive_paths = set()

    # Collect inactive paths from DB registry for is_active annotation
    if not use_database:
        inactive_paths = await get_inactive_project_paths(db)

    # Filter by accessible projects if user is authenticated.
    # In filesystem mode, non-admin users are still restricted by the DB
    # registry/ACL mapping; unregistered legacy paths fail closed.
    if current_user and not use_database:
        is_admin = current_user.role == "admin" or current_user.is_admin
        if not is_admin:
            from api.projects import _get_admin_org_ids

            try:
                admin_org_ids = await _get_admin_org_ids(current_user)
                accessible_paths = await _get_accessible_paths_for_user(
                    db, current_user.id, admin_org_ids
                )
            except HTTPException:
                raise
            except Exception as exc:
                raise HTTPException(
                    status_code=503,
                    detail="Project access control is temporarily unavailable",
                ) from exc
            projects = [p for p in projects if p.path in accessible_paths]

    # Try to get RAG stats if available
    try:
        from services.rag_service import get_vector_store

        store = get_vector_store()
        rag_available = True
    except (ImportError, ValueError, Exception):
        rag_available = False

    result = []
    for p in projects:
        # Qdrant에서 실제 인덱스 상태 조회 (if available)
        if rag_available:
            stats = store.get_collection_stats(p.id)
            vector_initialized = stats.get("indexed", False)
        else:
            vector_initialized = False

        result.append(
            ProjectResponse(
                id=p.id,
                name=p.name,
                path=p.path,
                description=p.description,
                has_claude_md=p.claude_md is not None,
                vector_store_initialized=vector_initialized,
                indexed_at=p.indexed_at,
                sort_order=p.sort_order,
                is_active=p.path not in inactive_paths,
            )
        )
    return result


# ─────────────────────────────────────────────────────────────
# DB-mode project writes (USE_DATABASE=true)
# ─────────────────────────────────────────────────────────────
#
# PR #318 은 link/create/reorder 를 DB 모드에서 503 으로 잠갔다. 그러나 대시보드
# (`stores/projects.ts`)는 이 세 경로를 계속 호출하고 `.env` 기본값은 DB 모드라,
# 기본 설치에서 Link Existing / Create New / 드래그 정렬이 전부 실패했다.
# `/api/project-registry` 로 옮기는 것은 답이 아니다 — 그 API 는 사용자가 고른 id 를
# 버리고 UUID 를 찍으며(기존 행은 slug id), 템플릿 스캐폴딩과 정렬이 없다. 그래서
# `PUT /projects/{project_id}` 와 같은 방식으로 핸들러 안에 DB 분기를 둔다.
#
# `services.project_sync_service.sync_project_to_db` 를 쓰지 않는다: 이름 기준
# upsert 인 데다 모든 예외를 warning 으로 삼켜 INSERT 가 실패해도 200 이 돌아간다.


def _use_database() -> bool:
    return os.getenv("USE_DATABASE", "false").lower() == "true"


def _read_claude_md(path: str | None) -> str | None:
    """`Project.from_path` 가 하는 것과 같은 CLAUDE.md 읽기. 없거나 못 읽으면 None."""
    if not path:
        return None
    claude_md = Path(path) / "CLAUDE.md"
    try:
        return claude_md.read_text(encoding="utf-8") if claude_md.is_file() else None
    except OSError:
        return None


def _db_slug(name: str, fallback: str) -> str:
    """`project_sync_service._slugify` 와 같은 규칙. 비면 id 로 대체한다."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or fallback


async def _resolve_free_slug(db: AsyncSession, *, project_id: str, name: str) -> str:
    """id·name·slug 셋 다 unique 컬럼이다. 미리 검사해 id·name 충돌은 409 로 답한다.

    안 하면 IntegrityError 가 일반 503 으로 새어 사용자는 원인을 모른다. create 는
    이 검사를 스캐폴딩보다 **먼저** 불러야 409 가 고아 디렉터리를 남기지 않는다.

    slug 만 겹치면 409 가 아니라 `api/projects/registry.py::create_project` 와 같은
    `-{id[:8]}` 접미사로 피한다 — 모달은 slug 를 보여주지 않아 slug 409 는 사용자가
    해석할 수 없다. 반환값이 실제로 쓸 slug 다.
    """
    from sqlalchemy import or_, select

    from db.models import ProjectModel

    slug = _db_slug(name, project_id)
    result = await db.execute(
        select(ProjectModel).where(
            or_(
                ProjectModel.id == project_id,
                ProjectModel.name == name,
                ProjectModel.slug == slug,
            )
        )
    )
    slug_taken = False
    for existing in result.scalars().all():
        if existing.id == project_id:
            raise HTTPException(status_code=409, detail=f"Project ID '{project_id}' already exists")
        if existing.name == name:
            raise HTTPException(status_code=409, detail=f"Project '{name}' already exists")
        slug_taken = True
    return f"{slug}-{project_id[:8]}" if slug_taken else slug


async def _insert_db_project(
    db: AsyncSession,
    *,
    project_id: str,
    name: str,
    slug: str,
    description: str | None,
    path: str,
    current_user,
) -> ProjectResponse:
    """`ProjectModel` 행 + 등록자 owner 접근권 한 쌍을 커밋한다 (registry 와 동일)."""
    from db.models import ProjectAccessModel, ProjectModel

    project = ProjectModel(
        id=project_id,
        name=name,
        slug=slug,
        description=description or "",
        path=path,
        is_active=True,
        settings={},
        organization_id=None,
        created_by=current_user.id,
    )
    db.add(project)
    db.add(
        ProjectAccessModel(
            id=str(uuid.uuid4()),
            project_id=project_id,
            user_id=current_user.id,
            role="owner",
            granted_by=current_user.id,
        )
    )
    await db.commit()
    await db.refresh(project)

    return ProjectResponse(
        id=project.id,
        name=project.name,
        path=project.path or "",
        description=project.description or "",
        has_claude_md=(Path(path) / "CLAUDE.md").is_file(),
        is_active=True,
    )


def _registry_unavailable() -> HTTPException:
    return HTTPException(status_code=503, detail="Project registry is temporarily unavailable")


@router.post("/projects/reorder", response_model=list[ProjectResponse])
async def reorder_projects_endpoint(
    request: ProjectReorderRequest,
    _admin=Depends(get_current_admin_or_manager_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Reorder projects by providing a list of project IDs in the desired order.

    This updates the sort_order field for each project and persists it
    to the .aos-project.json metadata file (filesystem mode) or to
    ``ProjectModel.settings["sort_order"]`` (DB mode).
    """
    if _use_database():
        from sqlalchemy import select

        from db.models import ProjectModel

        try:
            result = await db.execute(
                select(ProjectModel).where(ProjectModel.id.in_(request.project_ids))
            )
            rows = {p.id: p for p in result.scalars().all()}
        except Exception as exc:
            raise _registry_unavailable() from exc

        missing = [pid for pid in request.project_ids if pid not in rows]
        if missing:
            raise HTTPException(status_code=404, detail=f"Project '{missing[0]}' not found")

        for index, pid in enumerate(request.project_ids):
            row = rows[pid]
            # JSONB 제자리 변경은 SQLAlchemy 가 dirty 로 잡지 않는다 — 새 dict 재할당.
            row.settings = {**(row.settings or {}), "sort_order": index}

        try:
            await db.commit()
        except Exception as exc:
            raise _registry_unavailable() from exc

        # store 는 응답을 `projects` 전체로 덮어쓴다 — 요청에 없던(필터로 가려진)
        # 프로젝트가 화면에서 사라지지 않도록 GET 과 같은 전체 목록을 돌려준다.
        return await get_projects(current_user=_admin, db=db)

    # Validate all project IDs exist
    for project_id in request.project_ids:
        if not get_project(project_id):
            raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    # Reorder projects
    updated = reorder_projects(request.project_ids)

    # Try to get RAG stats if available
    try:
        from services.rag_service import get_vector_store

        store = get_vector_store()
        rag_available = True
    except ImportError:
        rag_available = False

    result = []
    for p in updated:
        if rag_available:
            stats = store.get_collection_stats(p.id)
            vector_initialized = stats.get("indexed", False)
        else:
            vector_initialized = False

        result.append(
            ProjectResponse(
                id=p.id,
                name=p.name,
                path=p.path,
                description=p.description,
                has_claude_md=p.claude_md is not None,
                vector_store_initialized=vector_initialized,
                indexed_at=p.indexed_at,
                sort_order=p.sort_order,
            )
        )

    return result


@router.get("/projects/templates")
async def list_templates(_current_user=Depends(get_current_user)):
    """List available project templates."""
    from services.project_template_service import get_templates

    return get_templates()


@router.post("/projects/link", response_model=ProjectResponse)
async def link_project(
    request: ProjectLinkRequest,
    current_user=Depends(get_current_admin_or_manager_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Link an external project.

    Filesystem mode: creates a symbolic link in the projects/ directory pointing
    to the source. DB mode: registers a ``ProjectModel`` row with the requested
    id and path — no symlink (that filesystem side effect is what the DB-mode
    gate protects against).
    """
    # Normalize path to remove shell escape characters (e.g., "Mobile\ Documents" -> "Mobile Documents")
    normalized_path = normalize_path(request.source_path)
    source_path = Path(normalized_path)

    # Validate source path exists (skip in Docker - host paths not accessible)
    if not IS_DOCKER:
        if not source_path.exists():
            raise HTTPException(
                status_code=400, detail=f"Source path does not exist: {normalized_path}"
            )
        if not source_path.is_dir():
            raise HTTPException(
                status_code=400, detail=f"Source path is not a directory: {request.source_path}"
            )

    if _use_database():
        name = request.name or source_path.name
        try:
            slug = await _resolve_free_slug(db, project_id=request.id, name=name)
            return await _insert_db_project(
                db,
                project_id=request.id,
                name=name,
                slug=slug,
                description=request.description,
                path=normalized_path,
                current_user=current_user,
            )
        except HTTPException:
            raise
        except Exception as exc:
            raise _registry_unavailable() from exc

    # Check if project ID already exists
    if get_project(request.id):
        raise HTTPException(status_code=400, detail=f"Project ID '{request.id}' already exists")

    # Create symlink in projects/ directory (skip in Docker)
    if not IS_DOCKER:
        projects_dir = get_projects_dir()
        projects_dir.mkdir(parents=True, exist_ok=True)

        symlink_path = projects_dir / request.id

        if symlink_path.exists():
            raise HTTPException(status_code=400, detail=f"Path already exists: {symlink_path}")

        # Create symbolic link
        symlink_path.symlink_to(source_path.resolve())

    # Register the project
    project = register_project(request.id, str(normalized_path))

    # Sync to DB so it appears in Project Configs / Project Registry
    await _sync_project_to_db(project.id, project.name, str(normalized_path), project.description)

    return ProjectResponse(
        id=project.id,
        name=project.name,
        path=project.path,
        description=project.description,
        has_claude_md=project.claude_md is not None,
    )


@router.post("/projects/create", response_model=ProjectResponse)
async def create_project_from_template(
    request: ProjectCreateFromTemplate,
    current_user=Depends(get_current_admin_or_manager_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Create a new project from a template.

    Available templates:
    - default: Basic project with CLAUDE.md and README
    - react-native: React Native Expo project
    - python: Python package with pyproject.toml
    - fastapi: FastAPI service

    In DB mode the scaffolded directory is registered as a ``ProjectModel``
    row (id = request id) instead of the in-memory filesystem registry.
    """
    from services.project_template_service import (
        create_project_from_template as create_from_template,
    )
    from services.project_template_service import get_template

    # Validate template exists
    template = get_template(request.template)
    if not template:
        raise HTTPException(status_code=400, detail=f"Unknown template: {request.template}")

    use_database = _use_database()
    slug = ""

    # Check if project ID already exists — DB 모드는 스캐폴딩보다 먼저 검사해야
    # 409 가 projects/ 아래에 고아 디렉터리를 남기지 않는다.
    if use_database:
        try:
            slug = await _resolve_free_slug(db, project_id=request.id, name=request.name)
        except HTTPException:
            raise
        except Exception as exc:
            raise _registry_unavailable() from exc
    elif get_project(request.id):
        raise HTTPException(status_code=400, detail=f"Project ID '{request.id}' already exists")

    # Create project in projects/ directory
    projects_dir = get_projects_dir()
    projects_dir.mkdir(parents=True, exist_ok=True)

    project_path = projects_dir / request.id

    if project_path.exists():
        raise HTTPException(status_code=400, detail=f"Path already exists: {project_path}")

    # Create project from template
    success = create_from_template(
        project_path=project_path,
        template_id=request.template,
        project_id=request.id,
        project_name=request.name,
        description=request.description,
    )

    if not success:
        raise HTTPException(status_code=500, detail="Failed to create project from template")

    if use_database:
        try:
            return await _insert_db_project(
                db,
                project_id=request.id,
                name=request.name,
                slug=slug,
                description=request.description,
                path=str(project_path),
                current_user=current_user,
            )
        except Exception as exc:
            # 사전 검사 뒤 경쟁 INSERT·commit 실패. 스캐폴드를 남기면 재시도가
            # `Path already exists` 로 영영 막히고 등록 안 된 고아 디렉터리가 남는다.
            shutil.rmtree(project_path, ignore_errors=True)
            if isinstance(exc, HTTPException):
                raise
            raise _registry_unavailable() from exc

    # Register the project
    project = register_project(request.id, str(project_path))

    # Sync to DB so it appears in Project Configs / Project Registry
    await _sync_project_to_db(project.id, project.name, str(project_path), project.description)

    return ProjectResponse(
        id=project.id,
        name=project.name,
        path=project.path,
        description=project.description,
        has_claude_md=project.claude_md is not None,
    )


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project_by_id(
    project_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get a specific project. Requires viewer+ role if access control is active."""
    # Apply RBAC before any legacy filesystem lookup. In database mode this
    # also establishes that the project is an active DB-registered resource.
    await require_project_role(project_id, current_user, db, min_role="viewer")

    if os.getenv("USE_DATABASE", "false").lower() == "true":
        from sqlalchemy import select

        from db.models import ProjectModel

        try:
            result = await db.execute(select(ProjectModel).where(ProjectModel.id == project_id))
            project = result.scalar_one_or_none()
        except Exception as exc:
            raise HTTPException(
                status_code=503,
                detail="Project access control is temporarily unavailable",
            ) from exc
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return ProjectResponse(
            id=project.id,
            name=project.name,
            path=project.path or "",
            description=project.description or "",
            has_claude_md=False,
            is_active=bool(project.is_active),
        )

    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return ProjectResponse(
        id=project.id,
        name=project.name,
        path=project.path,
        description=project.description,
        has_claude_md=project.claude_md is not None,
    )


@router.post("/projects", response_model=ProjectResponse)
async def create_project(
    request: ProjectCreate,
    background_tasks: BackgroundTasks,
    _admin=Depends(get_current_admin_or_manager_user),
):
    """Register a new project and trigger background indexing."""
    if os.getenv("USE_DATABASE", "false").lower() == "true":
        raise HTTPException(status_code=503, detail="Use the database project registry")

    from pathlib import Path

    from api.rag import trigger_background_indexing

    # Normalize path to remove shell escape characters
    normalized_path = normalize_path(request.path)

    # Validate path exists (skip in Docker - host paths not accessible)
    if not IS_DOCKER and not Path(normalized_path).exists():
        raise HTTPException(status_code=400, detail=f"Path does not exist: {normalized_path}")

    project = register_project(request.id, normalized_path)

    # Auto-trigger background indexing for RAG
    trigger_background_indexing(
        project_id=project.id,
        project_path=project.path,
        background_tasks=background_tasks,
    )

    return ProjectResponse(
        id=project.id,
        name=project.name,
        path=project.path,
        description=project.description,
        has_claude_md=project.claude_md is not None,
    )


@router.put("/projects/{project_id}", response_model=ProjectResponse)
async def update_project_endpoint(
    project_id: str,
    request: ProjectUpdate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Update project name, description, or path. Requires editor+ role."""
    if current_user:
        await require_project_role(project_id, current_user, db, min_role="editor")

    if os.getenv("USE_DATABASE", "false").lower() == "true":
        from sqlalchemy import select

        from db.models import ProjectModel
        from utils.time import utcnow

        try:
            result = await db.execute(select(ProjectModel).where(ProjectModel.id == project_id))
            project = result.scalar_one_or_none()
            if not project:
                raise HTTPException(status_code=404, detail="Project not found")
            if request.name is not None:
                duplicate = await db.execute(
                    select(ProjectModel).where(
                        ProjectModel.name == request.name,
                        ProjectModel.id != project_id,
                    )
                )
                if duplicate.scalar_one_or_none():
                    raise HTTPException(status_code=409, detail="Project name already exists")
                project.name = request.name
                project.slug = request.name.lower().strip().replace(" ", "-")
            if request.description is not None:
                project.description = request.description
            if request.path is not None:
                project.path = request.path
            project.updated_at = utcnow()
            await db.commit()
            await db.refresh(project)
            return ProjectResponse(
                id=project.id,
                name=project.name,
                path=project.path or "",
                description=project.description or "",
                has_claude_md=False,
                is_active=bool(project.is_active),
            )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=503,
                detail="Project access control is temporarily unavailable",
            ) from exc

    try:
        project = update_project(project_id, request.name, request.description, request.path)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return ProjectResponse(
        id=project.id,
        name=project.name,
        path=project.path,
        description=project.description,
        has_claude_md=project.claude_md is not None,
        vector_store_initialized=project.vector_store_initialized,
        indexed_at=project.indexed_at,
    )


@router.get("/projects/{project_id}/deletion-preview")
async def get_deletion_preview(
    project_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Get preview of what will be deleted when removing a project.

    Returns counts of:
    - Sessions, tasks, messages (DB records)
    - RAG index chunks
    - Symlink status

    IMPORTANT: Source files are NEVER deleted.
    """
    from services.project_cleanup_service import get_cleanup_service

    await require_project_role(project_id, current_user, db, min_role="viewer")
    reject_legacy_project_operation_in_database_mode()
    service = get_cleanup_service()
    preview = await service.get_deletion_preview(project_id)

    if not preview:
        raise HTTPException(status_code=404, detail="Project not found")

    return preview.model_dump()


@router.delete("/projects/{project_id}")
async def delete_project(
    project_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Delete a project with cascade cleanup. Requires owner role.

    This removes:
    - All DB records (sessions, tasks, messages, approvals, feedbacks)
    - The RAG vector index
    - Health cache
    - Config monitor cache
    - The symlink in projects/ directory
    - The project from registry

    IMPORTANT: Source files are NEVER deleted, only the symlink.
    """
    from services.project_cleanup_service import get_cleanup_service

    if current_user:
        await require_project_role(project_id, current_user, db, min_role="owner")
    reject_legacy_project_operation_in_database_mode()

    service = get_cleanup_service()
    if os.getenv("USE_DATABASE", "false").lower() != "true":
        project = get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

    summary = await service.cascade_delete(project_id)

    if not summary.success:
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Project deletion failed",
                "errors": summary.errors,
            },
        )

    return {
        "message": f"Project '{project_id}' removed successfully",
        "cleanup_summary": summary.model_dump(),
    }
