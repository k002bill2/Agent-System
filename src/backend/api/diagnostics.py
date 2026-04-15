"""Project environment diagnostics API routes.

Provides workspace, MCP, Git, and quota health checks per project.
"""

from fastapi import APIRouter, HTTPException

from models.diagnostics import DiagnosticCategory, FixRequest, FixResult, ProjectDiagnostics
from models.project import get_project
from services.environment_diagnostic_service import execute_fix, run_diagnostics

router = APIRouter(tags=["orchestration"])


@router.get(
    "/projects/{project_id}/diagnostics",
    response_model=ProjectDiagnostics,
)
async def get_project_diagnostics(project_id: str):
    """Run all environment diagnostics for a project.

    Checks workspace, MCP, Git, and quota status.
    """
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return run_diagnostics(project)


@router.get(
    "/projects/{project_id}/diagnostics/{category}",
    response_model=ProjectDiagnostics,
)
async def get_project_diagnostics_by_category(
    project_id: str,
    category: DiagnosticCategory,
):
    """Run a single diagnostic category for a project.

    Valid categories: workspace, mcp, git, quota.
    """
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return run_diagnostics(project, categories=[category])


@router.post(
    "/projects/{project_id}/diagnostics/fix",
    response_model=FixResult,
)
async def fix_diagnostic_issue(project_id: str, request: FixRequest):
    """Execute a self-healing fix action for a project.

    Available actions: create_aos_config, create_claude_md, enable_mcp_servers.
    Returns the fix result with updated diagnostics.
    """
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = execute_fix(project, request.fix_action, request.params)
    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)

    return result
