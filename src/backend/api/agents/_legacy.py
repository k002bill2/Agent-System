"""Agent API routes - Agent Registry, Lead Orchestrator, MCP Manager."""

import json
import os
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user, get_db_session
from db.models import UserModel
from models.cost import estimate_tokens, extract_token_usage
from models.llm_access import LLMAccessResponse
from models.llm_models import LLMModelConfig, LLMModelRegistry
from models.llm_usage import (
    LLMRuntimeMode,
    LLMUsageMeasurementMethod,
    LLMUsageRecordCreate,
    LLMUsageSource,
    LLMUsageStatus,
)
from services.llm_runtime_resolver import (
    LLMRuntimeRequest,
    LLMRuntimeResolution,
    LLMRuntimeResolutionError,
    resolve_llm_runtime,
)
from services.llm_service import LLMService
from services.llm_usage_ledger_service import (
    LLMUsageQuotaExceededError,
    enforce_usage_quota_preflight_best_effort,
    record_usage_best_effort,
)
from utils.time import utcnow

# Image upload directory
UPLOAD_DIR = Path(os.getenv("AOS_UPLOAD_DIR", "/tmp/aos-uploads"))
ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"}
MAX_IMAGE_SIZE = 20 * 1024 * 1024  # 20MB per image
MAX_IMAGES = 5

from agents.lead_orchestrator import (
    ExecutionStrategy,
    get_lead_orchestrator,
)
from models.task_analysis import (
    TaskAnalysisQueryParams,
    TaskAnalysisSaveRequest,
)
from services.agent_registry import (
    AgentCategory,
    AgentMetadata,
    AgentStatus,
    EffortLevel,
    get_agent_registry,
)
from services.llm_access_service import get_access_for_user
from services.task_analysis_service import (
    get_task_analysis_service,
)

router = APIRouter(prefix="/agents", tags=["agents"])


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
_DEFAULT_WORKSPACE_ROOTS = [
    Path.home() / "Work",
    Path.home() / "Projects",
    Path.home() / "Developer",
    Path("/tmp/aos-workspaces"),
]


def get_allowed_workspace_roots() -> list[Path]:
    """Get allowed workspace roots, configurable via AOS_WORKSPACE_ROOTS env.

    Env format: comma-separated paths, e.g. "/home/user/Work,/opt/projects"
    Falls back to defaults if env is not set.
    """
    env_roots = os.getenv("AOS_WORKSPACE_ROOTS")
    if env_roots:
        return [Path(p.strip()) for p in env_roots.split(",") if p.strip()]
    return _DEFAULT_WORKSPACE_ROOTS


# Module-level alias for backward compat
ALLOWED_WORKSPACE_ROOTS = _DEFAULT_WORKSPACE_ROOTS


def _validate_project_path(path_str: str) -> Path:
    """Validate project path is within allowed workspace directories.

    Raises HTTPException if path is outside allowed roots or contains traversal.
    """
    try:
        resolved = Path(path_str).resolve()
    except (ValueError, OSError):
        raise HTTPException(status_code=400, detail=f"Invalid project path: {path_str}")

    # Check for path traversal attempts
    if ".." in Path(path_str).parts:
        raise HTTPException(status_code=400, detail="Path traversal not allowed")

    # Verify path is within allowed roots (use dynamic getter for env support)
    allowed_roots = get_allowed_workspace_roots()
    for allowed_root in allowed_roots:
        try:
            if resolved.is_relative_to(allowed_root.resolve()):
                return resolved
        except (ValueError, OSError):
            continue

    raise HTTPException(
        status_code=400,
        detail="Project path must be within allowed workspace directories",
    )


# ─────────────────────────────────────────────────────────────
# Response Models
# ─────────────────────────────────────────────────────────────


class AgentResponse(BaseModel):
    """에이전트 정보 응답."""

    id: str
    name: str
    description: str
    category: str
    status: str
    capabilities: list[dict[str, Any]]
    specializations: list[str]
    estimated_cost_per_task: float
    avg_execution_time_ms: int
    total_tasks_completed: int
    success_rate: float
    is_available: bool


class AgentRegistryStatsResponse(BaseModel):
    """에이전트 레지스트리 통계 응답."""

    total_agents: int
    available_agents: int
    busy_agents: int
    by_category: dict[str, int]
    total_tasks_completed: int
    avg_success_rate: float


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


class ExecuteWithTmuxRequest(BaseModel):
    """tmux + Claude CLI 실행 요청."""

    analysis_id: str = Field(..., description="실행할 분석 ID")
    project_id: str | None = Field(None, description="프로젝트 ID (선택)")
    branch_name: str | None = Field(None, description="실행 전 생성할 feature branch (선택)")


class TmuxSessionResponse(BaseModel):
    """tmux 세션 응답."""

    session_name: str
    analysis_id: str
    active: bool
    output: str = ""
    started_at: str
    task_input: str = ""


class AgentSearchRequest(BaseModel):
    """에이전트 검색 요청."""

    query: str = Field(..., description="검색 쿼리 (태스크 설명)")
    category: str | None = Field(None, description="카테고리 필터")
    limit: int = Field(5, description="최대 결과 수")


class AgentSearchResult(BaseModel):
    """에이전트 검색 결과."""

    agent: AgentResponse
    score: int


class OCRResponse(BaseModel):
    """OCR 텍스트 추출 응답."""

    success: bool
    text: str = ""
    filename: str = ""
    error: str | None = None
    model_used: str = ""


# ─────────────────────────────────────────────────────────────
# OCR Constants
# ─────────────────────────────────────────────────────────────

OCR_PROMPT = """Extract ALL text visible in this image exactly as it appears.
Rules:
- Preserve the original language (Korean, English, etc.)
- Maintain line breaks and structure where possible
- Output ONLY the extracted text, nothing else
- If no text is found, respond with an empty string"""

_MIME_TYPE_MAP = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
}


def _runtime_mode_for_provider(provider: str) -> LLMRuntimeMode:
    if provider.endswith("_cli"):
        return LLMRuntimeMode.CLI
    if provider == "ollama":
        return LLMRuntimeMode.LOCAL
    return LLMRuntimeMode.API


def _vision_model_candidates(preferred_provider: str) -> list[LLMModelConfig]:
    candidates = [
        model
        for model in LLMModelRegistry.get_enabled()
        if model.supports_vision and LLMModelRegistry.is_available(model.id)
    ]
    return sorted(
        candidates,
        key=lambda model: 0 if model.provider.value == preferred_provider else 1,
    )


def _resolve_ocr_runtime(
    access: LLMAccessResponse,
    *,
    organization_id: str | None,
    candidates: list[LLMModelConfig] | None = None,
) -> tuple[LLMModelConfig, LLMRuntimeResolution]:
    """Resolve an entitled vision runtime for Task Analyzer OCR."""
    vision_candidates = candidates or _vision_model_candidates(
        os.getenv("LLM_PROVIDER", "codex_cli")
    )
    if not vision_candidates:
        raise LLMRuntimeResolutionError("No available vision-capable LLM model for OCR")

    errors: list[str] = []
    for model in vision_candidates:
        try:
            resolution = resolve_llm_runtime(
                access,
                LLMRuntimeRequest(
                    user_id=access.user_id,
                    organization_id=organization_id,
                    source=LLMUsageSource.TASK_ANALYZER_OCR,
                    requested_model_id=model.id,
                ),
            )
        except LLMRuntimeResolutionError as exc:
            errors.append(str(exc))
            continue

        resolved_model = LLMModelRegistry.get_by_id(resolution.model_id)
        if resolved_model and resolved_model.supports_vision:
            return resolved_model, resolution
        errors.append(f"Resolved model does not support vision: {resolution.model_id}")

    detail = "; ".join(errors[:2])
    raise LLMRuntimeResolutionError(
        f"OCR runtime is not allowed by current LLM access policy: {detail}"
    )


def _estimate_ocr_tokens(
    *,
    image_size_bytes: int,
    extracted_text: str = "",
    max_tokens: int = 4096,
    model_id: str = "",
) -> tuple[int, int]:
    image_estimate = max(1, image_size_bytes // 1024)
    input_tokens = estimate_tokens(OCR_PROMPT, model_id) + image_estimate
    output_tokens = estimate_tokens(extracted_text, model_id) if extracted_text else 0
    return input_tokens + max(max_tokens, 0), output_tokens


def _extract_ocr_usage(
    response: Any,
    *,
    model_id: str,
    image_size_bytes: int,
    extracted_text: str,
) -> tuple[int, int, LLMUsageMeasurementMethod]:
    usage = extract_token_usage(response, model_id)
    if usage:
        return (
            usage.input_tokens,
            usage.output_tokens,
            LLMUsageMeasurementMethod.PROVIDER_METADATA,
        )
    input_tokens, output_tokens = _estimate_ocr_tokens(
        image_size_bytes=image_size_bytes,
        extracted_text=extracted_text,
        max_tokens=0,
        model_id=model_id,
    )
    return input_tokens, output_tokens, LLMUsageMeasurementMethod.ESTIMATED


async def _record_ocr_usage(
    *,
    user_id: str,
    organization_id: str | None,
    resolution: LLMRuntimeResolution,
    filename: str,
    mime_type: str,
    image_size_bytes: int,
    latency_ms: int,
    status: LLMUsageStatus,
    response: Any | None = None,
    extracted_text: str = "",
    error_message: str | None = None,
) -> None:
    if response is not None:
        input_tokens, output_tokens, measurement_method = _extract_ocr_usage(
            response,
            model_id=resolution.model_id,
            image_size_bytes=image_size_bytes,
            extracted_text=extracted_text,
        )
    else:
        input_tokens, _output_tokens = _estimate_ocr_tokens(
            image_size_bytes=image_size_bytes,
            extracted_text="",
            max_tokens=0,
            model_id=resolution.model_id,
        )
        output_tokens = None
        measurement_method = LLMUsageMeasurementMethod.ESTIMATED

    total_tokens = input_tokens + output_tokens if output_tokens is not None else input_tokens
    metadata = resolution.usage_metadata()
    metadata.update(
        {
            "filename": filename,
            "mime_type": mime_type,
            "image_size_bytes": image_size_bytes,
        }
    )

    await record_usage_best_effort(
        LLMUsageRecordCreate(
            user_id=user_id,
            organization_id=organization_id,
            provider=resolution.provider,
            mode=_runtime_mode_for_provider(resolution.provider),
            source=LLMUsageSource.TASK_ANALYZER_OCR,
            model=resolution.model_id,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            measurement_method=measurement_method,
            status=status,
            latency_ms=latency_ms,
            error_message=error_message,
            metadata=metadata,
            started_at=utcnow(),
            completed_at=utcnow(),
        )
    )


# ─────────────────────────────────────────────────────────────
# Agent Registry API
# ─────────────────────────────────────────────────────────────


def _agent_to_response(agent: AgentMetadata) -> AgentResponse:
    """AgentMetadata를 AgentResponse로 변환."""
    return AgentResponse(
        id=agent.id,
        name=agent.name,
        description=agent.description,
        category=agent.category.value,
        status=agent.status.value,
        capabilities=[
            {
                "name": cap.name,
                "description": cap.description,
                "keywords": cap.keywords,
                "priority": cap.priority,
            }
            for cap in agent.capabilities
        ],
        specializations=agent.specializations,
        estimated_cost_per_task=agent.estimated_cost_per_task,
        avg_execution_time_ms=agent.avg_execution_time_ms,
        total_tasks_completed=agent.total_tasks_completed,
        success_rate=agent.success_rate,
        is_available=agent.is_available(),
    )


@router.get("", response_model=list[AgentResponse])
async def list_agents(
    category: str | None = None,
    available_only: bool = False,
    _user: UserModel = Depends(get_current_user),
):
    """
    모든 에이전트 목록 조회.

    Args:
        category: 카테고리 필터 (development, orchestration, quality, research)
        available_only: 사용 가능한 에이전트만 반환
    """
    registry = get_agent_registry()

    if category:
        try:
            cat = AgentCategory(category)
            agents = registry.get_by_category(cat)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid category: {category}. Valid: {[c.value for c in AgentCategory]}",
            )
    elif available_only:
        agents = registry.get_available()
    else:
        agents = registry.get_all()

    return [_agent_to_response(a) for a in agents]


@router.get("/stats", response_model=AgentRegistryStatsResponse)
async def get_registry_stats(_user: UserModel = Depends(get_current_user)):
    """에이전트 레지스트리 통계 조회."""
    registry = get_agent_registry()
    stats = registry.get_stats()
    return AgentRegistryStatsResponse(**stats)


@router.post("/ocr", response_model=OCRResponse)
async def extract_text_from_image(
    image: UploadFile = File(..., description="OCR 대상 이미지"),
    _user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    이미지에서 텍스트를 추출합니다 (Vision LLM 기반 OCR).

    지원 형식: PNG, JPG, JPEG, GIF, WEBP, BMP (SVG 제외)
    최대 크기: 20MB
    """
    import asyncio
    import base64

    from langchain_core.messages import HumanMessage

    filename = image.filename or "image.png"
    ext = Path(filename).suffix.lower()

    # SVG는 벡터 이미지이므로 OCR 스킵
    if ext == ".svg":
        return OCRResponse(success=True, text="", filename=filename, model_used="")

    # 파일 확장자 검증
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"지원하지 않는 이미지 형식: {ext}. 지원: {', '.join(ALLOWED_IMAGE_EXTENSIONS - {'.svg'})}",
        )

    # 이미지 읽기 + 크기 검증
    content = await image.read()
    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"이미지 크기 초과: {len(content) / 1024 / 1024:.1f}MB (최대 {MAX_IMAGE_SIZE / 1024 / 1024:.0f}MB)",
        )

    organization_id = getattr(_user, "organization_id", None)
    access = await get_access_for_user(
        db,
        str(_user.id),
        organization_id=organization_id,
    )
    try:
        _vision_model, runtime_resolution = _resolve_ocr_runtime(
            access,
            organization_id=organization_id,
        )
    except LLMRuntimeResolutionError as exc:
        return OCRResponse(
            success=False,
            filename=filename,
            error=f"OCR 서비스 사용 불가 - {exc}",
        )

    # Base64 인코딩
    image_b64 = base64.b64encode(content).decode("utf-8")
    mime_type = _MIME_TYPE_MAP.get(ext, "image/png")
    user_id = str(_user.id)
    estimated_tokens, _ = _estimate_ocr_tokens(
        image_size_bytes=len(content),
        max_tokens=4096,
        model_id=runtime_resolution.model_id,
    )
    try:
        await enforce_usage_quota_preflight_best_effort(
            user_id=user_id,
            organization_id=organization_id,
            estimated_tokens=estimated_tokens,
        )
    except LLMUsageQuotaExceededError as exc:
        raise HTTPException(status_code=429, detail=str(exc))

    # LLM Vision 호출 (30초 타임아웃)
    started_at = time.perf_counter()
    try:
        llm = LLMService._get_llm(
            runtime_resolution.model_id,
            temperature=0.0,
            max_tokens=4096,
        )

        message = HumanMessage(
            content=[
                {"type": "text", "text": OCR_PROMPT},
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime_type};base64,{image_b64}"},
                },
            ]
        )

        response = await asyncio.wait_for(llm.ainvoke([message]), timeout=30.0)
        # Gemini는 content를 list로 반환할 수 있음
        raw = response.content
        if isinstance(raw, list):
            extracted_text = "".join(
                part.get("text", "") if isinstance(part, dict) else str(part) for part in raw
            ).strip()
        else:
            extracted_text = str(raw).strip()

        latency_ms = int((time.perf_counter() - started_at) * 1000)
        await _record_ocr_usage(
            user_id=user_id,
            organization_id=organization_id,
            resolution=runtime_resolution,
            filename=filename,
            mime_type=mime_type,
            image_size_bytes=len(content),
            latency_ms=latency_ms,
            status=LLMUsageStatus.SUCCESS,
            response=response,
            extracted_text=extracted_text,
        )
        return OCRResponse(
            success=True,
            text=extracted_text,
            filename=filename,
            model_used=runtime_resolution.model_id,
        )
    except TimeoutError:
        latency_ms = int((time.perf_counter() - started_at) * 1000)
        await _record_ocr_usage(
            user_id=user_id,
            organization_id=organization_id,
            resolution=runtime_resolution,
            filename=filename,
            mime_type=mime_type,
            image_size_bytes=len(content),
            latency_ms=latency_ms,
            status=LLMUsageStatus.TIMEOUT,
            error_message="OCR timed out after 30 seconds",
        )
        return OCRResponse(
            success=False,
            filename=filename,
            error="OCR 타임아웃 (30초 초과)",
            model_used=runtime_resolution.model_id,
        )
    except Exception as e:
        latency_ms = int((time.perf_counter() - started_at) * 1000)
        await _record_ocr_usage(
            user_id=user_id,
            organization_id=organization_id,
            resolution=runtime_resolution,
            filename=filename,
            mime_type=mime_type,
            image_size_bytes=len(content),
            latency_ms=latency_ms,
            status=LLMUsageStatus.ERROR,
            error_message=str(e),
        )
        return OCRResponse(
            success=False,
            filename=filename,
            error=f"텍스트 추출 실패: {str(e)}",
            model_used=runtime_resolution.model_id,
        )


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: str, _user: UserModel = Depends(get_current_user)):
    """특정 에이전트 조회."""
    registry = get_agent_registry()
    agent = registry.get(agent_id)

    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    return _agent_to_response(agent)


@router.post("/search", response_model=list[AgentSearchResult])
async def search_agents(request: AgentSearchRequest, _user: UserModel = Depends(get_current_user)):
    """
    능력 기반 에이전트 검색.

    태스크 설명을 기반으로 가장 적합한 에이전트를 찾습니다.
    """
    registry = get_agent_registry()

    category = None
    if request.category:
        try:
            category = AgentCategory(request.category)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid category: {request.category}")

    results = registry.find_by_capability(
        query=request.query,
        category=category,
        limit=request.limit,
    )

    return [
        AgentSearchResult(
            agent=_agent_to_response(agent),
            score=score,
        )
        for agent, score in results
    ]


@router.post("/{agent_id}/status")
async def update_agent_status(
    agent_id: str, status: str, _user: UserModel = Depends(get_current_user)
):
    """에이전트 상태 업데이트."""
    registry = get_agent_registry()

    try:
        new_status = AgentStatus(status)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status: {status}. Valid: {[s.value for s in AgentStatus]}",
        )

    if not registry.update_status(agent_id, new_status):
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    return {"message": f"Agent {agent_id} status updated to {status}"}


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
        # 세션 업데이트
        engine._sessions[session_id] = state

    return ExecuteAnalysisResponse(
        success=True,
        session_id=session_id,
    )


# ─────────────────────────────────────────────────────────────
# Tmux + Claude Code CLI Execution API
# ─────────────────────────────────────────────────────────────


@router.get("/orchestrate/claude-auth-status")
async def check_claude_auth_status(_user: UserModel = Depends(get_current_user)):
    """Claude CLI 인증 상태 및 크레딧 사전 체크.

    tmux 실행 전에 호출하여 인증/크레딧 문제를 미리 확인.
    """
    from services.tmux_service import get_tmux_service

    tmux = get_tmux_service()

    if not tmux.is_available():
        return {
            "authenticated": False,
            "has_credits": False,
            "error": "tmux_not_installed",
            "message": "tmux가 설치되어 있지 않습니다.",
        }

    auth_status = await tmux.check_claude_auth()
    return auth_status.model_dump()


@router.post("/orchestrate/execute-with-tmux", response_model=TmuxSessionResponse)
async def execute_with_tmux(
    request: ExecuteWithTmuxRequest, current_user: UserModel = Depends(get_current_user)
):
    """
    분석 결과를 tmux + Claude Code CLI로 실행.

    1. 저장된 분석 결과 조회
    2. 프로젝트 경로 결정
    3. Claude Code 프롬프트 생성
    4. tmux 세션에서 claude -p 실행
    5. session_name 반환
    """
    from services.tmux_service import get_tmux_service

    tmux = get_tmux_service()

    if not tmux.is_available():
        raise HTTPException(status_code=503, detail="tmux is not installed on the server")

    if not tmux.is_claude_available():
        raise HTTPException(status_code=503, detail="Claude CLI is not installed on the server")

    # NOTE: 인증/크레딧 사전 체크를 제거함.
    # 백엔드 프로세스 환경에서 claude를 실행하면 macOS 키체인 접근이 달라
    # 실제로는 정상인데도 인증 실패로 오판할 수 있음.
    # tmux 세션은 사용자의 login shell 환경을 상속하므로 정상 동작하며,
    # 인증/크레딧 문제가 있으면 tmux 출력에서 자연스럽게 확인 가능.

    # 분석 결과 조회
    analysis_service = get_task_analysis_service()
    entry = await analysis_service.get_analysis(request.analysis_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Analysis not found: {request.analysis_id}")

    if not entry.success or not entry.analysis:
        raise HTTPException(status_code=400, detail="Cannot execute a failed analysis")

    # 프로젝트 경로 결정
    project_path = "."
    project_id = request.project_id or entry.project_id
    if project_id:
        try:
            from services.project_service import get_project_service

            project_service = get_project_service()
            project = await project_service.get_project(project_id)
            if project and project.path:
                project_path = project.path
        except Exception:
            pass

    # 컨텍스트에서 project_path 추출 시도
    if project_path == "." and entry.context:
        ctx_path = entry.context.get("project_path")
        if ctx_path:
            project_path = ctx_path

    # 경로 유효성 검증 (path traversal 방어)
    # "." 포함 모든 경로를 검증 — CWD가 허용 범위 밖일 수 있음
    validated_path = _validate_project_path(project_path)
    project_path = str(validated_path)

    # tmux + Claude CLI 실행
    from models.llm_usage import LLMUsageSource
    from services.llm_usage_ledger_service import LLMUsageQuotaExceededError

    try:
        info = await tmux.execute_analysis(
            analysis_id=request.analysis_id,
            project_path=project_path,
            analysis=entry.analysis,
            task_input=entry.task_input,
            branch_name=request.branch_name,
            usage_context={
                "source": LLMUsageSource.TASK_ANALYZER_EXECUTION,
                "user_id": str(current_user.id),
                "organization_id": getattr(current_user, "organization_id", None),
                "project_id": project_id,
                "metadata": {"api_endpoint": "execute-with-tmux"},
            },
        )
    except LLMUsageQuotaExceededError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc

    if not info:
        raise HTTPException(status_code=500, detail="Failed to create tmux session")

    return TmuxSessionResponse(
        session_name=info.session_name,
        analysis_id=info.analysis_id,
        active=info.active,
        output="",
        started_at=info.started_at.isoformat(),
        task_input=info.task_input,
    )


@router.get("/orchestrate/tmux-sessions/{session_name}/status", response_model=TmuxSessionResponse)
async def get_tmux_session_status(session_name: str, _user: UserModel = Depends(get_current_user)):
    """tmux 세션 상태 + 최근 출력 조회."""
    from services.tmux_service import get_tmux_service

    tmux = get_tmux_service()
    info = tmux.get_session(session_name)

    if not info:
        raise HTTPException(status_code=404, detail=f"Tmux session not found: {session_name}")

    # 출력 캡처
    output = ""
    if info.active:
        captured = tmux.capture_output(session_name)
        if captured is not None:
            output = captured
    else:
        # 세션이 종료된 경우에도 마지막 캡처 시도
        captured = tmux.capture_output(session_name)
        if captured is not None:
            output = captured

    return TmuxSessionResponse(
        session_name=info.session_name,
        analysis_id=info.analysis_id,
        active=info.active,
        output=output,
        started_at=info.started_at.isoformat(),
        task_input=info.task_input,
    )


@router.get("/orchestrate/tmux-sessions/{session_name}/stream")
async def stream_tmux_session(session_name: str, _user: UserModel = Depends(get_current_user)):
    """SSE 스트리밍으로 tmux 세션 출력 전달 (2초 폴링)."""
    import asyncio

    from starlette.responses import StreamingResponse

    from services.tmux_service import get_tmux_service

    tmux = get_tmux_service()
    info = tmux.get_session(session_name)

    if not info:
        raise HTTPException(status_code=404, detail=f"Tmux session not found: {session_name}")

    async def event_generator():
        last_output = ""
        inactive_count = 0

        while True:
            current_info = tmux.get_session(session_name)
            if not current_info:
                yield "data: {'event': 'session_ended', 'active': false}\n\n"
                break

            captured = tmux.capture_output(session_name)
            output = captured if captured is not None else ""

            # 새로운 출력이 있으면 전송
            if output != last_output:
                import json

                data = json.dumps(
                    {
                        "event": "output",
                        "output": output,
                        "active": current_info.active,
                    }
                )
                yield f"data: {data}\n\n"
                last_output = output
                inactive_count = 0
            else:
                inactive_count += 1

            # 세션이 종료되면 마지막 상태 전송 후 종료
            if not current_info.active:
                import json

                data = json.dumps(
                    {
                        "event": "session_ended",
                        "output": output,
                        "active": False,
                    }
                )
                yield f"data: {data}\n\n"
                break

            # 5분 동안 변화 없으면 종료 (150 * 2초)
            if inactive_count > 150:
                yield "data: {'event': 'timeout'}\n\n"
                break

            await asyncio.sleep(2)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/orchestrate/tmux-sessions/{session_name}/stop")
async def stop_tmux_session(session_name: str, _user: UserModel = Depends(get_current_user)):
    """tmux 세션 강제 종료."""
    from services.tmux_service import get_tmux_service

    tmux = get_tmux_service()
    info = tmux.get_session(session_name)

    if not info:
        raise HTTPException(status_code=404, detail=f"Tmux session not found: {session_name}")

    success = tmux.kill_session(session_name)

    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to kill tmux session: {session_name}")

    return {"message": f"Tmux session {session_name} stopped", "success": True}


@router.get("/orchestrate/tmux-sessions")
async def list_tmux_sessions(_user: UserModel = Depends(get_current_user)):
    """모든 AOS tmux 세션 목록."""
    from services.tmux_service import get_tmux_service

    tmux = get_tmux_service()
    sessions = tmux.list_aos_sessions()

    return {
        "sessions": [
            TmuxSessionResponse(
                session_name=s.session_name,
                analysis_id=s.analysis_id,
                active=s.active,
                output="",
                started_at=s.started_at.isoformat(),
                task_input=s.task_input,
            ).model_dump()
            for s in sessions
        ],
        "total": len(sessions),
    }


@router.get("/orchestrate/strategies")
async def get_execution_strategies(_user: UserModel = Depends(get_current_user)):
    """사용 가능한 실행 전략 목록."""
    return {
        "strategies": [
            {
                "value": s.value,
                "description": {
                    "sequential": "순차 실행 - 태스크를 하나씩 순서대로 실행",
                    "parallel": "병렬 실행 - 독립적인 태스크를 동시에 실행",
                    "mixed": "혼합 실행 - 일부 병렬, 일부 순차",
                }[s.value],
            }
            for s in ExecutionStrategy
        ],
        "effort_levels": [
            {
                "value": e.value,
                "description": {
                    "quick": "빠른 작업 (< 5분)",
                    "medium": "중간 복잡도 (5-30분)",
                    "thorough": "복잡한 작업 (30분+)",
                }[e.value],
            }
            for e in EffortLevel
        ],
    }
