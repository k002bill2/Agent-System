"""Agent API routes - Agent Registry, Lead Orchestrator, MCP Manager."""

import os
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
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
from services.agent_registry import (
    AgentCategory,
    AgentMetadata,
    AgentStatus,
    get_agent_registry,
)
from services.llm_access_service import get_access_for_user
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

from ._shared import ALLOWED_IMAGE_EXTENSIONS, MAX_IMAGE_SIZE

router = APIRouter(prefix="/agents", tags=["agents"])


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
