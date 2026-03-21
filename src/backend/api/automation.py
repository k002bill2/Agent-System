"""Automation loop API router."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.deps import get_current_user_optional
from services.automation_loop_service import (
    ActionDef,
    AutomationLoopConfig,
    ConditionDef,
    LoopStatus,
    get_automation_loop_service,
)

router = APIRouter(prefix="/automation", tags=["automation"])


# ── Request Models ──────────────────────────────────────────


class CreateLoopRequest(BaseModel):
    """Request to create a new automation loop."""

    name: str = Field(..., min_length=1, max_length=100)
    interval_seconds: int = Field(default=60, ge=1, le=86400)
    max_iterations: int | None = Field(default=None, ge=1)
    conditions: list[ConditionDef] = Field(..., min_length=1, max_length=20)
    actions: list[ActionDef] = Field(..., min_length=1, max_length=10)
    cooldown_seconds: int = Field(default=300, ge=0)


class CreateLoopResponse(BaseModel):
    """Response after creating a loop."""

    loop_id: str
    message: str


# ── Endpoints ───────────────────────────────────────────────


@router.post("/loops", response_model=CreateLoopResponse, status_code=201)
async def create_loop(request: CreateLoopRequest, _current_user=Depends(get_current_user_optional)):
    """Create a new automation loop."""
    service = get_automation_loop_service()

    config = AutomationLoopConfig(
        name=request.name,
        interval_seconds=request.interval_seconds,
        max_iterations=request.max_iterations,
        conditions=request.conditions,
        actions=request.actions,
        cooldown_seconds=request.cooldown_seconds,
    )

    loop_id = await service.create_loop(config)
    return CreateLoopResponse(
        loop_id=loop_id,
        message=f"Loop '{request.name}' created",
    )


@router.get("/loops", response_model=list[LoopStatus])
async def list_loops(_current_user=Depends(get_current_user_optional)):
    """List all automation loops."""
    service = get_automation_loop_service()
    return await service.list_loops()


@router.get("/loops/{loop_id}", response_model=LoopStatus)
async def get_loop(loop_id: str, _current_user=Depends(get_current_user_optional)):
    """Get status of a specific loop."""
    service = get_automation_loop_service()
    status = await service.get_loop_status(loop_id)
    if not status:
        raise HTTPException(status_code=404, detail="Loop not found")
    return status


@router.post("/loops/{loop_id}/start")
async def start_loop(loop_id: str, _current_user=Depends(get_current_user_optional)):
    """Start a loop."""
    service = get_automation_loop_service()
    try:
        await service.start_loop(loop_id)
        return {"message": f"Loop {loop_id} started"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/loops/{loop_id}/stop")
async def stop_loop(loop_id: str, _current_user=Depends(get_current_user_optional)):
    """Stop a running loop."""
    service = get_automation_loop_service()
    await service.stop_loop(loop_id)
    return {"message": f"Loop {loop_id} stopped"}


@router.delete("/loops/{loop_id}")
async def delete_loop(loop_id: str, _current_user=Depends(get_current_user_optional)):
    """Delete a loop (stops it first if running)."""
    service = get_automation_loop_service()
    deleted = await service.delete_loop(loop_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Loop not found")
    return {"message": f"Loop {loop_id} deleted"}
