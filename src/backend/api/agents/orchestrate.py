"""orchestrate 관련 Agents API 라우트.

Lead Orchestrator 기반 태스크 분석·실행과 tmux 세션 관리.
workspace 경로 검증 헬퍼(get_allowed_workspace_roots·_validate_project_path·
ALLOWED_WORKSPACE_ROOTS)도 여기 산다 — tmux 실행 경로 검증 전용이다.
"""

import json
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from agents.lead_orchestrator import (
    get_lead_orchestrator,
)
from api.deps import get_current_user, get_db_session
from db.models import UserModel
from models.task_analysis import (
    TaskAnalysisQueryParams,
    TaskAnalysisSaveRequest,
)
from services.llm_access_service import get_access_for_user
from services.task_analysis_service import (
    get_task_analysis_service,
)

from ._shared import ALLOWED_IMAGE_EXTENSIONS, MAX_IMAGE_SIZE, MAX_IMAGES, UPLOAD_DIR

router = APIRouter()


async def _task_analyzer_context_with_access(
    context: dict[str, Any] | None,
    user: UserModel,
    db: AsyncSession,
) -> dict[str, Any]:
    analysis_context = dict(context or {})
    analysis_context["_user_id"] = str(user.id)
    analysis_context["_organization_id"] = getattr(user, "organization_id", None)
    analysis_context["_llm_access"] = await get_access_for_user(db, str(user.id))
    return analysis_context


# Default workspace roots (configurable via AOS_WORKSPACE_ROOTS env)


class TaskAnalysisRequest(BaseModel):
    """태스크 분석 요청."""

    task: str = Field(..., description="분석할 태스크 설명")
    context: dict[str, Any] | None = Field(None, description="추가 컨텍스트")


class TaskAnalysisResponse(BaseModel):
    """태스크 분석 응답."""

    success: bool
    analysis: dict[str, Any] | None = None
    error: str | None = None
    execution_time_ms: int = 0
    analysis_id: str | None = None  # 저장된 분석 ID


class TaskAnalysisHistoryResponse(BaseModel):
    """태스크 분석 히스토리 응답."""

    id: str
    project_id: str | None = None
    task_input: str
    success: bool
    analysis: dict[str, Any] | None = None
    error: str | None = None
    execution_time_ms: int = 0
    complexity_score: int | None = None
    effort_level: str | None = None
    subtask_count: int | None = None
    strategy: str | None = None
    image_paths: list[str] | None = None
    created_at: str


class TaskAnalysisHistoryListResponse(BaseModel):
    """태스크 분석 히스토리 목록 응답."""

    items: list[TaskAnalysisHistoryResponse]
    total: int
    has_more: bool


class ExecuteAnalysisRequest(BaseModel):
    """분석 결과 실행 요청."""

    analysis_id: str = Field(..., description="실행할 분석 ID")
    project_id: str | None = Field(None, description="프로젝트 ID (선택)")


class ExecuteAnalysisResponse(BaseModel):
    """분석 결과 실행 응답."""

    success: bool
    session_id: str | None = None
    error: str | None = None


# ─────────────────────────────────────────────────────────────
# Lead Orchestrator API
# ─────────────────────────────────────────────────────────────


@router.post("/orchestrate/analyze", response_model=TaskAnalysisResponse)
async def analyze_task(
    request: TaskAnalysisRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    태스크 분석 및 실행 계획 생성.

    Lead Orchestrator가 태스크를 분석하고:
    1. 복잡도 평가
    2. 서브태스크 분해
    3. 에이전트 할당
    4. 실행 전략 결정

    분석 결과는 히스토리에 자동 저장됩니다.
    """
    orchestrator = get_lead_orchestrator()
    analysis_service = get_task_analysis_service()
    analysis_context = await _task_analyzer_context_with_access(
        request.context,
        current_user,
        db,
    )

    try:
        result = await orchestrator.execute(
            task=request.task,
            context=analysis_context,
        )

        # Extract project_id from context
        project_id = None
        if request.context:
            project_id = request.context.get("project_id")

        # Save analysis to history
        save_request = TaskAnalysisSaveRequest(
            task_input=request.task,
            context=request.context,
            project_id=project_id,
            success=result.success,
            analysis=result.output if result.success else None,
            error=result.error if not result.success else None,
            execution_time_ms=result.execution_time_ms,
        )
        saved_entry = await analysis_service.save_analysis(save_request)

        if result.success:
            return TaskAnalysisResponse(
                success=True,
                analysis=result.output,
                execution_time_ms=result.execution_time_ms,
                analysis_id=saved_entry.id,
            )
        else:
            return TaskAnalysisResponse(
                success=False,
                error=result.error,
                execution_time_ms=result.execution_time_ms,
                analysis_id=saved_entry.id,
            )
    except Exception as e:
        # Save failed analysis too
        try:
            save_request = TaskAnalysisSaveRequest(
                task_input=request.task,
                context=request.context,
                project_id=request.context.get("project_id") if request.context else None,
                success=False,
                error=str(e),
                execution_time_ms=0,
            )
            saved_entry = await analysis_service.save_analysis(save_request)
            return TaskAnalysisResponse(
                success=False,
                error=str(e),
                analysis_id=saved_entry.id,
            )
        except Exception:
            return TaskAnalysisResponse(
                success=False,
                error="Unknown error during task analysis",
            )


@router.post("/orchestrate/analyze-with-images", response_model=TaskAnalysisResponse)
async def analyze_task_with_images(
    task: str = Form(..., description="분석할 태스크 설명"),
    context: str | None = Form(None, description="JSON 형태의 추가 컨텍스트"),
    images: list[UploadFile] = File(default=[], description="첨부 이미지 파일들 (최대 5개)"),
    _user: UserModel = Depends(get_current_user),
):
    """
    이미지를 포함한 태스크 분석 및 실행 계획 생성.

    multipart/form-data로 이미지 파일을 함께 업로드할 수 있습니다.
    업로드된 이미지는 서버에 임시 저장되며, Warp 실행 시 Claude CLI의 --image 플래그로 전달됩니다.

    지원 형식: PNG, JPG, JPEG, GIF, WEBP, BMP, SVG
    최대 이미지 크기: 20MB/개, 최대 5개
    """
    orchestrator = get_lead_orchestrator()
    analysis_service = get_task_analysis_service()

    # Parse context JSON
    parsed_context: dict[str, Any] | None = None
    if context:
        try:
            parsed_context = json.loads(context)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON in context field")

    # Validate and save uploaded images
    saved_image_paths: list[str] = []

    if len(images) > MAX_IMAGES:
        raise HTTPException(
            status_code=400,
            detail=f"최대 {MAX_IMAGES}개의 이미지만 업로드할 수 있습니다",
        )

    if images:
        # Create upload directory
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

        for img in images:
            # Validate file extension
            if img.filename:
                ext = Path(img.filename).suffix.lower()
                if ext not in ALLOWED_IMAGE_EXTENSIONS:
                    raise HTTPException(
                        status_code=400,
                        detail=f"지원하지 않는 이미지 형식: {ext}. 지원: {', '.join(ALLOWED_IMAGE_EXTENSIONS)}",
                    )
            else:
                ext = ".png"

            # Read and validate size
            content = await img.read()
            if len(content) > MAX_IMAGE_SIZE:
                raise HTTPException(
                    status_code=400,
                    detail=f"이미지 크기가 너무 큽니다: {img.filename} ({len(content) / 1024 / 1024:.1f}MB > {MAX_IMAGE_SIZE / 1024 / 1024:.0f}MB)",
                )

            # Save to disk
            file_id = str(uuid.uuid4())
            save_path = UPLOAD_DIR / f"{file_id}{ext}"
            save_path.write_bytes(content)
            saved_image_paths.append(str(save_path))

    try:
        result = await orchestrator.execute(
            task=task,
            context=parsed_context,
        )

        # Extract project_id from context
        project_id = None
        if parsed_context:
            project_id = parsed_context.get("project_id")

        # Save analysis to history (with image paths)
        save_request = TaskAnalysisSaveRequest(
            task_input=task,
            context=parsed_context,
            project_id=project_id,
            success=result.success,
            analysis=result.output if result.success else None,
            error=result.error if not result.success else None,
            execution_time_ms=result.execution_time_ms,
            image_paths=saved_image_paths if saved_image_paths else None,
        )
        saved_entry = await analysis_service.save_analysis(save_request)

        if result.success:
            return TaskAnalysisResponse(
                success=True,
                analysis=result.output,
                execution_time_ms=result.execution_time_ms,
                analysis_id=saved_entry.id,
            )
        else:
            return TaskAnalysisResponse(
                success=False,
                error=result.error,
                execution_time_ms=result.execution_time_ms,
                analysis_id=saved_entry.id,
            )
    except Exception as e:
        try:
            save_request = TaskAnalysisSaveRequest(
                task_input=task,
                context=parsed_context,
                project_id=parsed_context.get("project_id") if parsed_context else None,
                success=False,
                error=str(e),
                execution_time_ms=0,
                image_paths=saved_image_paths if saved_image_paths else None,
            )
            saved_entry = await analysis_service.save_analysis(save_request)
            return TaskAnalysisResponse(
                success=False,
                error=str(e),
                analysis_id=saved_entry.id,
            )
        except Exception:
            return TaskAnalysisResponse(
                success=False,
                error="Unknown error during task analysis",
            )


@router.get("/orchestrate/analyses", response_model=TaskAnalysisHistoryListResponse)
async def get_analysis_history(
    project_id: str | None = None,
    limit: int = 20,
    offset: int = 0,
    _user: UserModel = Depends(get_current_user),
):
    """
    태스크 분석 히스토리 조회.

    Args:
        project_id: 프로젝트 ID로 필터링 (선택)
        limit: 조회할 항목 수 (기본: 20, 최대: 100)
        offset: 오프셋 (페이지네이션)
    """
    analysis_service = get_task_analysis_service()

    params = TaskAnalysisQueryParams(
        project_id=project_id,
        limit=min(limit, 100),
        offset=offset,
    )

    result = await analysis_service.get_analyses(params)

    return TaskAnalysisHistoryListResponse(
        items=[
            TaskAnalysisHistoryResponse(
                id=item.id,
                project_id=item.project_id,
                task_input=item.task_input,
                success=item.success,
                analysis=item.analysis,
                error=item.error,
                execution_time_ms=item.execution_time_ms,
                complexity_score=item.complexity_score,
                effort_level=item.effort_level,
                subtask_count=item.subtask_count,
                strategy=item.strategy,
                image_paths=item.image_paths,
                created_at=item.created_at.isoformat(),
            )
            for item in result.items
        ],
        total=result.total,
        has_more=result.has_more,
    )


@router.get("/orchestrate/analyses/{analysis_id}")
async def get_analysis(analysis_id: str, _user: UserModel = Depends(get_current_user)):
    """단일 태스크 분석 조회."""
    analysis_service = get_task_analysis_service()
    entry = await analysis_service.get_analysis(analysis_id)

    if not entry:
        raise HTTPException(status_code=404, detail=f"Analysis not found: {analysis_id}")

    return TaskAnalysisHistoryResponse(
        id=entry.id,
        project_id=entry.project_id,
        task_input=entry.task_input,
        success=entry.success,
        analysis=entry.analysis,
        error=entry.error,
        execution_time_ms=entry.execution_time_ms,
        complexity_score=entry.complexity_score,
        effort_level=entry.effort_level,
        subtask_count=entry.subtask_count,
        strategy=entry.strategy,
        image_paths=entry.image_paths,
        created_at=entry.created_at.isoformat(),
    )


@router.delete("/orchestrate/analyses/{analysis_id}")
async def delete_analysis(analysis_id: str, _user: UserModel = Depends(get_current_user)):
    """태스크 분석 삭제."""
    analysis_service = get_task_analysis_service()
    success = await analysis_service.delete_analysis(analysis_id)

    if not success:
        raise HTTPException(status_code=404, detail=f"Analysis not found: {analysis_id}")

    return {"message": f"Analysis {analysis_id} deleted", "success": True}


@router.post("/orchestrate/execute-analysis", response_model=ExecuteAnalysisResponse)
async def execute_analysis(
    request: ExecuteAnalysisRequest, _user: UserModel = Depends(get_current_user)
):
    """
    분석 결과를 기반으로 오케스트레이션 실행.

    1. 저장된 분석 결과 조회
    2. OrchestrationEngine 세션 생성
    3. 분석의 execution_plan을 plan_metadata에 주입
    4. 원본 태스크로 engine.stream() 시작
    5. session_id 반환
    """
    from orchestrator.engine import OrchestrationEngine

    analysis_service = get_task_analysis_service()

    # 1. 분석 결과 조회
    entry = await analysis_service.get_analysis(request.analysis_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Analysis not found: {request.analysis_id}")

    if not entry.success or not entry.analysis:
        return ExecuteAnalysisResponse(
            success=False,
            error="Cannot execute a failed analysis",
        )

    # 2. 엔진 및 세션 생성
    engine = OrchestrationEngine()

    # 프로젝트 컨텍스트 설정
    project = None
    project_id = request.project_id or entry.project_id
    if project_id:
        # 프로젝트 DB 조회 시도, 없으면 최소한의 정보로 생성
        try:
            from services.project_service import get_project_service

            project_service = get_project_service()
            project = await project_service.get_project(project_id)
        except Exception:
            pass

    session_id = await engine.create_session(
        project=project,
    )

    # 3. 세션 state에 사전 분석 계획 주입
    state = await engine.get_session(session_id)
    if state:
        state["plan_metadata"] = {
            "pre_analyzed_execution_plan": entry.analysis.get("execution_plan", {}),
            "analysis_id": request.analysis_id,
        }
        # 세션 업데이트 (캐시와 영속 저장소 함께 — 캐시만 갱신하면 재시작 후
        # 계획이 사라져 PlannerNode 가 일반 LLM 계획으로 떨어진다)
        await engine.save_session(session_id, state)

    return ExecuteAnalysisResponse(
        success=True,
        session_id=session_id,
    )
