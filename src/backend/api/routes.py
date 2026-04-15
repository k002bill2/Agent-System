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

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

# Docker mode: skip host filesystem validations
IS_DOCKER = bool(os.getenv("CLAUDE_HOME"))

from api.deps import get_current_user_optional, get_db_session, require_project_role
from models.project import (
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


async def _sync_project_to_db(
    project_id: str, name: str, path: str, description: str | None = None
) -> None:
    """Sync a project to the DB projects table (upsert by name).

    Ensures projects created/linked via the Projects page also appear
    in Project Configs and Project Registry.
    """
    import logging
    import re

    use_database = os.getenv("USE_DATABASE", "false").lower() == "true"
    if not use_database:
        return

    try:
        from sqlalchemy import select

        from db.database import async_session_factory
        from db.models import ProjectModel

        # Generate slug from name
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

        async with async_session_factory() as session:
            # Check if already exists by name
            result = await session.execute(select(ProjectModel).where(ProjectModel.name == name))
            existing = result.scalar_one_or_none()

            if existing:
                # Update path if changed
                if path and existing.path != path:
                    existing.path = path
                if not existing.is_active:
                    existing.is_active = True
                await session.commit()
            else:
                new_project = ProjectModel(
                    id=project_id,
                    name=name,
                    slug=slug,
                    description=description or "",
                    path=path,
                    is_active=True,
                )
                session.add(new_project)
                await session.commit()
    except Exception as e:
        logging.getLogger(__name__).warning(f"Failed to sync project to DB: {e}")


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

    USE_DATABASE=false이거나 DB 오류 시 빈 set 반환 (필터링 스킵).
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
    except Exception:
        return set()


async def _get_accessible_paths_for_user(
    db: AsyncSession, user_id: str, admin_org_ids: list[str] | None = None
) -> set[str] | None:
    """파일시스템 프로젝트의 접근 가능한 path set을 반환.

    ProjectModel.path <-> project_access(project_id) 를 크로스레퍼런스하여
    파일시스템 프로젝트의 RBAC 필터링을 지원한다.

    접근 규칙:
        - 조직 admin/owner: 자신의 조직 프로젝트 + 명시적 ProjectAccess
        - 일반 member: 명시적 ProjectAccess만

    Returns:
        - None: DB 미사용 또는 DB에 등록된 프로젝트 없음 -> 필터링 스킵
        - set[str]: 접근 가능한 path 집합
    """
    import os

    use_database = os.getenv("USE_DATABASE", "false").lower() == "true"
    if not use_database:
        return None

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
            # DB에 등록된 프로젝트 없음 -> 필터링 스킵
            return None

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

    except Exception:
        return None


# ─────────────────────────────────────────────────────────────
# Project API — Endpoints
# ─────────────────────────────────────────────────────────────


@router.get("/projects", response_model=list[ProjectResponse])
async def get_projects(
    current_user=Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db_session),
):
    """List registered projects filtered by access control.

    접근 규칙:
        - 시스템 admin: 모든 프로젝트
        - 조직 admin/owner: 자신의 조직 프로젝트 + 명시적 ProjectAccess
        - 일반 member: 명시적 ProjectAccess만
        - DB에 등록되지 않은 레거시 프로젝트는 인증된 사용자 모두 표시
    """
    projects = list_projects()

    # Collect inactive paths from DB registry for is_active annotation
    inactive_paths = await get_inactive_project_paths(db)

    # Filter by accessible projects if user is authenticated
    if current_user:
        is_admin = current_user.role == "admin" or current_user.is_admin
        if not is_admin:
            # 조직 admin/owner 여부 확인
            from api.projects import _get_admin_org_ids

            admin_org_ids = await _get_admin_org_ids(current_user)
            accessible_paths = await _get_accessible_paths_for_user(
                db, current_user.id, admin_org_ids
            )
            if accessible_paths is not None:
                from sqlalchemy import select

                from db.models import ProjectModel

                path_result = await db.execute(select(ProjectModel.path))
                db_registered_paths: set[str] = {row[0] for row in path_result.all() if row[0]}

                filtered = []
                for p in projects:
                    if p.path not in db_registered_paths:
                        # DB에 등록되지 않은 레거시 프로젝트 -> 인증 사용자 모두 표시
                        filtered.append(p)
                    elif p.path in accessible_paths:
                        filtered.append(p)
                projects = filtered

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


@router.post("/projects/reorder", response_model=list[ProjectResponse])
async def reorder_projects_endpoint(request: ProjectReorderRequest):
    """
    Reorder projects by providing a list of project IDs in the desired order.

    This updates the sort_order field for each project and persists it
    to the .aos-project.json metadata file.
    """
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
async def list_templates():
    """List available project templates."""
    from services.project_template_service import get_templates

    return get_templates()


@router.post("/projects/link", response_model=ProjectResponse)
async def link_project(request: ProjectLinkRequest):
    """
    Link an external project by creating a symlink.

    Creates a symbolic link in the projects/ directory pointing to the source.
    """
    from pathlib import Path

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
async def create_project_from_template(request: ProjectCreateFromTemplate):
    """
    Create a new project from a template.

    Available templates:
    - default: Basic project with CLAUDE.md and README
    - react-native: React Native Expo project
    - python: Python package with pyproject.toml
    - fastapi: FastAPI service
    """
    from services.project_template_service import (
        create_project_from_template as create_from_template,
    )
    from services.project_template_service import get_template

    # Validate template exists
    template = get_template(request.template)
    if not template:
        raise HTTPException(status_code=400, detail=f"Unknown template: {request.template}")

    # Check if project ID already exists
    if get_project(request.id):
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
    current_user=Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db_session),
):
    """Get a specific project. Requires viewer+ role if access control is active."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Apply RBAC if user is authenticated
    if current_user:
        await require_project_role(project_id, current_user, db, min_role="viewer")

    return ProjectResponse(
        id=project.id,
        name=project.name,
        path=project.path,
        description=project.description,
        has_claude_md=project.claude_md is not None,
    )


@router.post("/projects", response_model=ProjectResponse)
async def create_project(request: ProjectCreate, background_tasks: BackgroundTasks):
    """Register a new project and trigger background indexing."""
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
    current_user=Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db_session),
):
    """Update project name, description, or path. Requires editor+ role."""
    # Apply RBAC if user is authenticated
    if current_user:
        await require_project_role(project_id, current_user, db, min_role="editor")

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
async def get_deletion_preview(project_id: str):
    """
    Get preview of what will be deleted when removing a project.

    Returns counts of:
    - Sessions, tasks, messages (DB records)
    - RAG index chunks
    - Symlink status

    IMPORTANT: Source files are NEVER deleted.
    """
    from services.project_cleanup_service import get_cleanup_service

    service = get_cleanup_service()
    preview = await service.get_deletion_preview(project_id)

    if not preview:
        raise HTTPException(status_code=404, detail="Project not found")

    return preview.model_dump()


@router.delete("/projects/{project_id}")
async def delete_project(
    project_id: str,
    current_user=Depends(get_current_user_optional),
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

    # Apply RBAC if user is authenticated
    if current_user:
        await require_project_role(project_id, current_user, db, min_role="owner")

    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    service = get_cleanup_service()
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
