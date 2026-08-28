"""Project environment diagnostics API routes.

Provides workspace, MCP, Git, and quota health checks per project.
"""

from fastapi import APIRouter, Depends, HTTPException

from api.deps import (
    get_current_user,
    get_db_session,
    get_project_or_404,
    require_project_role,
)
from models.diagnostics import DiagnosticCategory, FixRequest, FixResult, ProjectDiagnostics
from services.environment_diagnostic_service import execute_fix, run_diagnostics

router = APIRouter(tags=["orchestration"])


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
    project = await get_project_or_404(project_id, db)

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
    project = await get_project_or_404(project_id, db)

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
    """
    await require_project_role(project_id, current_user, db, min_role="editor")
    project = await get_project_or_404(project_id, db)

    result = execute_fix(project, request.fix_action, request.params)
    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)

    return result
