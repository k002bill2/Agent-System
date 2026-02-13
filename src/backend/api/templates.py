"""Workflow templates API router."""

from fastapi import APIRouter, HTTPException, Query

from models.template import TemplateCategory, TemplateCreate, TemplateListResponse, TemplateUpdate
from services.template_service import get_template_service

router = APIRouter(tags=["templates"])


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
async def create_template(data: TemplateCreate):
    """Create a new workflow template."""
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
async def delete_template(template_id: str):
    """Delete a workflow template."""
    service = get_template_service()
    if not service.delete_template(template_id):
        raise HTTPException(status_code=404, detail="Template not found")


@router.post("/workflows/from-template/{template_id}", status_code=201)
async def create_from_template(
    template_id: str,
    name: str | None = Query(None),
    project_id: str | None = Query(None),
):
    """Create a new workflow from a template."""
    service = get_template_service()
    result = service.create_workflow_from_template(template_id, name=name, project_id=project_id)
    if not result:
        raise HTTPException(status_code=404, detail="Template not found")
    return result
