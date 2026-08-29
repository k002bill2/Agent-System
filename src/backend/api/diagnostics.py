"""Project environment diagnostics API routes.

Provides workspace, MCP, Git, and quota health checks per project.
"""

import os

from fastapi import APIRouter, Depends, HTTPException

from api.db_project import load_registered_project
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


def _unverifiable_categories(project: Project) -> set[DiagnosticCategory]:
    """Categories whose backing data is out of reach for this project.

    Quota resolves organizations through ``OrganizationService``, which is
    backed by the legacy in-memory registry and is never populated from the
    database. So a database-mode project that carries a DB organization id
    would be reported as ``Organization not found`` — a healthy project shown
    as failed.

    The gate is the organization, not the mode: a project with no organization
    is diagnosed without any registry lookup, so its quota result stays
    verifiable and must not be overridden.
    """
    if _use_database() and project.organization_id:
        return {DiagnosticCategory.QUOTA}
    return set()


async def _resolve_database_project(project_id: str, db) -> Project | None:
    """Resolve the canonical DB project row into a safe diagnosable target."""
    try:
        return await load_registered_project(db, project_id)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Project diagnostics are temporarily unavailable",
        ) from exc


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

    return run_diagnostics(project, unverifiable_categories=_unverifiable_categories(project))


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

    return run_diagnostics(
        project,
        categories=[category],
        unverifiable_categories=_unverifiable_categories(project),
    )


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

    result = execute_fix(
        project,
        request.fix_action,
        request.params,
        unverifiable_categories=_unverifiable_categories(project),
    )
    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)

    return result
