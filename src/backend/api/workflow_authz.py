"""Shared authorization helpers for workflow-scoped routers.

Workflows, runs, artifacts, templates and webhooks are all reachable from
several routers. Centralising the "resolve the owning project, then apply
project RBAC" walk keeps those routers from drifting apart, and keeps the
global (``project_id is None``) case privileged in exactly one place.
"""

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import is_privileged_user, require_project_role
from db.models import UserModel
from services.workflow_service import USE_DATABASE, WorkflowService, get_workflow_service


async def authorize_workflow_project(
    project_id: str | None,
    current_user: UserModel,
    db: AsyncSession,
    min_role: str = "viewer",
) -> None:
    """Authorize a workflow's project, keeping global workflows operator-only."""
    if project_id is None:
        if not is_privileged_user(current_user):
            raise HTTPException(status_code=403, detail="Global workflow access denied")
        return
    await require_project_role(project_id, current_user, db, min_role=min_role)


def workflow_project_id(workflow: dict) -> str | None:
    """Read the owning project of a workflow record."""
    project_id = workflow.get("project_id")
    return project_id if isinstance(project_id, str) else None


async def load_workflow(workflow_id: str, db: AsyncSession) -> dict:
    """Load a workflow by ID or raise 404."""
    service = get_workflow_service()
    if USE_DATABASE:
        workflow = await WorkflowService.get_workflow_async(db, workflow_id)
    else:
        workflow = service.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return workflow


async def authorize_workflow(
    workflow_id: str,
    current_user: UserModel,
    db: AsyncSession,
    min_role: str = "viewer",
) -> dict:
    """Load a workflow and authorize the caller against its project."""
    workflow = await load_workflow(workflow_id, db)
    await authorize_workflow_project(
        workflow_project_id(workflow), current_user, db, min_role=min_role
    )
    return workflow


async def load_run(run_id: str, db: AsyncSession) -> dict:
    """Load a run by ID or raise 404 (in-memory first, then database)."""
    service = get_workflow_service()
    run = service.get_run(run_id)
    if not run and USE_DATABASE:
        run = await WorkflowService.get_run_async(db, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


async def authorize_run(
    run_id: str,
    current_user: UserModel,
    db: AsyncSession,
    min_role: str = "viewer",
) -> dict:
    """Load a run and authorize the caller against its workflow's project."""
    run = await load_run(run_id, db)
    workflow_id = run.get("workflow_id")
    if not isinstance(workflow_id, str):
        raise HTTPException(status_code=404, detail="Workflow not found")
    await authorize_workflow(workflow_id, current_user, db, min_role=min_role)
    return run
