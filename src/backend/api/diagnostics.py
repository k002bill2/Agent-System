"""Project environment diagnostics API routes.

Provides workspace, MCP, Git, and quota health checks per project.
"""

import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from api.deps import (
    get_current_user,
    get_db_session,
    reject_legacy_project_operation_in_database_mode,
    require_project_role,
)
from models.diagnostics import DiagnosticCategory, FixRequest, FixResult, ProjectDiagnostics
from models.project import Project, get_project
from services.environment_diagnostic_service import execute_fix, run_diagnostics

router = APIRouter(tags=["orchestration"])

# Returned when an authorized database-mode project carries no inspectable
# directory. Kept distinct from the generic dependency-failure detail so the
# two 503 causes stay separable by callers and by tests. Mirrors
# ``api/monitoring.NO_MONITORED_PATH_DETAIL``.
NO_DIAGNOSTIC_PATH_DETAIL = "Project has no registered filesystem path for environment diagnostics"


def _use_database() -> bool:
    return os.getenv("USE_DATABASE", "false").lower() == "true"


async def _resolve_database_project(project_id: str, db) -> Project | None:
    """Resolve the canonical DB project row into a diagnosable target.

    Only ``ProjectModel.id`` is matched — the path-derived identifiers used by
    the legacy filesystem registry and by ProjectConfigMonitor are deliberately
    not accepted here, so they cannot reach the filesystem through diagnostics.

    Returns ``None`` when the registration has no usable directory. The caller
    keeps that fail-closed instead of guessing a path.
    """
    from sqlalchemy import select

    from db.models import ProjectModel

    try:
        result = await db.execute(
            select(ProjectModel).where(
                ProjectModel.id == project_id,
                ProjectModel.is_active == True,  # noqa: E712
            )
        )
        row = result.scalar_one_or_none()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Project diagnostics are temporarily unavailable",
        ) from exc

    if row is None:
        return None

    path = str(row.path or "").strip()
    if not path or not Path(path).is_dir():
        return None

    # `Project.from_path` 로 구성한다 (`api/git/_shared.resolve_project` 와 같은
    # 이유). 필드를 손으로 옮기면 `.aos-project.json` 의 `git_path` 와
    # `_check_git_repository` 파생 `git_enabled` 가 빠져 git 카테고리가 모든 DB
    # 프로젝트에서 "Not a Git repository" 로 굳는다 — 테스트는 초록인데 화면만 틀린다.
    project = Project.from_path(str(row.id), path)

    # 이름·설명의 권위는 DB 행이다. `organization_id` 는 일부러 덮지 않는다 —
    # 쿼터 진단이 조회하는 `OrganizationService` 는 인메모리 레지스트리라 DB 의
    # org id 를 넘기면 "Organization not found" 라는 새 오진이 생긴다. 그 배선은
    # 이 변경의 범위 밖이다.
    return project.model_copy(update={"name": row.name, "description": row.description or ""})


async def _diagnostic_target(project_id: str, db) -> Project:
    """Resolve the diagnosed project *after* the caller has authorized access.

    Database mode reads the DB registry, which is authoritative for both
    identity and path. Filesystem mode keeps the legacy registry lookup behind
    ``reject_legacy_project_operation_in_database_mode`` — that guard is
    unreachable from here in database mode by construction, and is kept as a
    standing assertion that the legacy branch never runs in that mode.
    """
    if _use_database():
        resolved = await _resolve_database_project(project_id, db)
        if resolved is None:
            raise HTTPException(status_code=503, detail=NO_DIAGNOSTIC_PATH_DETAIL)
        return resolved

    reject_legacy_project_operation_in_database_mode()
    legacy = get_project(project_id)
    if not legacy:
        raise HTTPException(status_code=404, detail="Project not found")
    return legacy


@router.get(
    "/projects/{project_id}/diagnostics",
    response_model=ProjectDiagnostics,
)
async def get_project_diagnostics(
    project_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db_session),
):
    """Run all environment diagnostics for a project.

    Checks workspace, MCP, Git, and quota status.
    """
    await require_project_role(project_id, current_user, db, min_role="viewer")
    project = await _diagnostic_target(project_id, db)

    return run_diagnostics(project)


@router.get(
    "/projects/{project_id}/diagnostics/{category}",
    response_model=ProjectDiagnostics,
)
async def get_project_diagnostics_by_category(
    project_id: str,
    category: DiagnosticCategory,
    current_user=Depends(get_current_user),
    db=Depends(get_db_session),
):
    """Run a single diagnostic category for a project.

    Valid categories: workspace, mcp, git, quota.
    """
    await require_project_role(project_id, current_user, db, min_role="viewer")
    project = await _diagnostic_target(project_id, db)

    return run_diagnostics(project, categories=[category])


@router.post(
    "/projects/{project_id}/diagnostics/fix",
    response_model=FixResult,
)
async def fix_diagnostic_issue(
    project_id: str,
    request: FixRequest,
    current_user=Depends(get_current_user),
    db=Depends(get_db_session),
):
    """Execute a self-healing fix action for a project.

    Available actions: create_aos_config, create_claude_md, enable_mcp_servers.
    Returns the fix result with updated diagnostics.

    The fix actions write files under the project directory, so they resolve
    through the same fail-closed target resolver as the read paths — there is
    no second, laxer lookup for the write surface — and the ``editor``
    authorization check stays the first statement, before any resolution.
    """
    await require_project_role(project_id, current_user, db, min_role="editor")
    project = await _diagnostic_target(project_id, db)

    result = execute_fix(project, request.fix_action, request.params)
    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)

    return result
