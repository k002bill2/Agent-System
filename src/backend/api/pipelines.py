"""Pipeline API router."""

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.deps import get_current_user_optional
from services.pipeline.models import PipelineConfig, PipelineResult, PipelineSummary, StageConfig

router = APIRouter(prefix="/pipelines", tags=["pipelines"])


# ── Request Models ──────────────────────────────────────────


class CreatePipelineRequest(BaseModel):
    """Request to create a pipeline."""

    name: str = Field(..., min_length=1, max_length=100)
    stages: list[StageConfig] = Field(..., min_length=1)
    error_strategy: Literal["fail_fast", "continue", "retry"] = "fail_fast"
    max_retries: int = Field(default=2, ge=0, le=10)
    timeout_seconds: int = Field(default=300, ge=1, le=3600)


class CreatePipelineResponse(BaseModel):
    """Response after creating a pipeline."""

    pipeline_id: str
    message: str


class ExecutePipelineRequest(BaseModel):
    """Request to execute a pipeline."""

    initial_data: dict[str, Any] | None = None


# ── Endpoints ───────────────────────────────────────────────


@router.post("/", response_model=CreatePipelineResponse, status_code=201)
async def create_pipeline(
    request: CreatePipelineRequest,
    _current_user=Depends(get_current_user_optional),
):
    """Create a new pipeline definition."""
    from services.pipeline.pipeline_service import get_pipeline_service

    service = get_pipeline_service()

    config = PipelineConfig(
        name=request.name,
        stages=request.stages,
        error_strategy=request.error_strategy,
        max_retries=request.max_retries,
        timeout_seconds=request.timeout_seconds,
    )

    try:
        pipeline_id = await service.create_pipeline(config)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return CreatePipelineResponse(
        pipeline_id=pipeline_id,
        message=f"Pipeline '{request.name}' created",
    )


@router.get("/", response_model=list[PipelineSummary])
async def list_pipelines(_current_user=Depends(get_current_user_optional)):
    """List all pipeline definitions."""
    from services.pipeline.pipeline_service import get_pipeline_service

    service = get_pipeline_service()
    return await service.list_pipelines()


@router.post("/{pipeline_id}/execute", response_model=PipelineResult)
async def execute_pipeline(
    pipeline_id: str,
    request: ExecutePipelineRequest | None = None,
    _current_user=Depends(get_current_user_optional),
):
    """Execute a pipeline."""
    from services.pipeline.pipeline_service import get_pipeline_service

    service = get_pipeline_service()
    initial_data = request.initial_data if request else None

    try:
        result = await service.execute_pipeline(pipeline_id, initial_data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return result


@router.get("/{pipeline_id}/runs/{run_id}", response_model=PipelineResult)
async def get_pipeline_result(
    pipeline_id: str,
    run_id: str,
    _current_user=Depends(get_current_user_optional),
):
    """Get result of a pipeline run."""
    from services.pipeline.pipeline_service import get_pipeline_service

    service = get_pipeline_service()
    result = await service.get_pipeline_result(run_id)
    if not result or result.pipeline_id != pipeline_id:
        raise HTTPException(status_code=404, detail="Pipeline run not found")
    return result


@router.delete("/{pipeline_id}")
async def delete_pipeline(
    pipeline_id: str,
    _current_user=Depends(get_current_user_optional),
):
    """Delete a pipeline definition."""
    from services.pipeline.pipeline_service import get_pipeline_service

    service = get_pipeline_service()
    deleted = await service.delete_pipeline(pipeline_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return {"message": f"Pipeline {pipeline_id} deleted"}
