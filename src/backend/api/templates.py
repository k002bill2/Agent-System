"""Workflow templates API router."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import (
    get_current_admin_or_manager_user,
    get_current_user,
    get_db_session,
    normalize_project_id,
)
from api.workflow_authz import authorize_workflow_project
from db.models import UserModel
from models.template import TemplateCategory, TemplateCreate, TemplateListResponse
from services.template_service import get_template_service

router = APIRouter(tags=["templates"], dependencies=[Depends(get_current_user)])


@router.get("/workflows/templates", response_model=TemplateListResponse)
async def list_templates(
    category: TemplateCategory | None = Query(None),
    search: str | None = Query(None),
):
    """List workflow templates."""
    service = get_template_service()
    templates = service.list_templates(category=category, search=search)
    return {"templates": templates, "total": len(templates)}


@router.post("/workflows/templates", status_code=201)
async def create_template(
    data: TemplateCreate,
    _current_user: UserModel = Depends(get_current_admin_or_manager_user),
):
    """Create a new workflow template.

    Templates are deployment-global (they carry no project scope), so writing
    one is an operator action rather than a project-member action.
    """
    try:
        service = get_template_service()
        return service.create_template(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/workflows/templates/{template_id}")
async def get_template(template_id: str):
    """Get a workflow template by ID."""
    service = get_template_service()
    template = service.get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.delete("/workflows/templates/{template_id}", status_code=204)
async def delete_template(
    template_id: str,
    _current_user: UserModel = Depends(get_current_admin_or_manager_user),
):
    """Delete a workflow template (deployment-global, operator only)."""
    service = get_template_service()
    if not service.delete_template(template_id):
        raise HTTPException(status_code=404, detail="Template not found")


@router.post("/workflows/from-template/{template_id}", status_code=201)
async def create_from_template(
    template_id: str,
    name: str | None = Query(None),
    project_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db_session),
    current_user: UserModel = Depends(get_current_user),
):
    """Create a new workflow from a template.

    This writes a workflow into ``project_id``, so it needs the same editor
    authorization as ``POST /workflows`` — a template is not a bypass.
    """
    if project_id is not None:
        project_id = normalize_project_id(project_id)
    await authorize_workflow_project(project_id, current_user, db, min_role="editor")
    service = get_template_service()
    result = service.create_workflow_from_template(template_id, name=name, project_id=project_id)
    if not result:
        raise HTTPException(status_code=404, detail="Template not found")
    return result
