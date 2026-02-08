"""
RLHF Feedback API Router

피드백 수집, 조회, 처리, 데이터셋 내보내기 API를 제공합니다.
"""

from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse

from models.feedback import (
    BatchProcessResult,
    DatasetExportOptions,
    DatasetStats,
    FeedbackEntry,
    FeedbackQueryParams,
    FeedbackResponse,
    FeedbackStats,
    FeedbackStatus,
    FeedbackSubmit,
    FeedbackType,
    ProcessFeedbackRequest,
    TaskEvaluationResponse,
    TaskEvaluationStats,
    TaskEvaluationSubmit,
)
from services.feedback_service import get_feedback_service

router = APIRouter(prefix="/feedback", tags=["feedback"])


# ============================================================================
# Feedback Endpoints
# ============================================================================


@router.post("", response_model=FeedbackResponse)
async def submit_feedback(
    feedback: FeedbackSubmit,
    agent_id: str | None = None,
) -> FeedbackResponse:
    """피드백 제출

    Args:
        feedback: 피드백 데이터
        agent_id: 에이전트 ID (optional, query param)

    Returns:
        생성된 피드백 정보
    """
    service = get_feedback_service()
    return await service.submit_feedback(feedback, agent_id=agent_id)


@router.get("", response_model=list[FeedbackEntry])
async def list_feedbacks(
    session_id: str | None = None,
    feedback_type: FeedbackType | None = None,
    status: FeedbackStatus | None = None,
    agent_id: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[FeedbackEntry]:
    """피드백 목록 조회

    필터와 페이지네이션을 지원합니다.
    """
    service = get_feedback_service()
    params = FeedbackQueryParams(
        session_id=session_id,
        feedback_type=feedback_type,
        status=status,
        agent_id=agent_id,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        offset=offset,
    )
    return await service.get_feedbacks(params)


@router.get("/stats", response_model=FeedbackStats)
async def get_feedback_stats(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> FeedbackStats:
    """피드백 통계 조회

    기간별 피드백 통계를 반환합니다.
    """
    service = get_feedback_service()
    return await service.get_feedback_stats(start_date, end_date)


@router.get("/{feedback_id}", response_model=FeedbackEntry)
async def get_feedback(feedback_id: str) -> FeedbackEntry:
    """단일 피드백 조회"""
    service = get_feedback_service()
    feedback = await service.get_feedback(feedback_id)

    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")

    return feedback


# ============================================================================
# Processing Endpoints
# ============================================================================


@router.post("/{feedback_id}/process", response_model=BatchProcessResult)
async def process_single_feedback(feedback_id: str) -> BatchProcessResult:
    """단일 피드백 처리

    피드백을 데이터셋 엔트리로 변환합니다.
    """
    service = get_feedback_service()
    request = ProcessFeedbackRequest(feedback_ids=[feedback_id])
    return await service.process_feedback_batch(request)


@router.post("/process-batch", response_model=BatchProcessResult)
async def process_feedback_batch(
    request: ProcessFeedbackRequest,
) -> BatchProcessResult:
    """피드백 일괄 처리

    여러 피드백을 한 번에 데이터셋으로 변환합니다.
    """
    service = get_feedback_service()
    return await service.process_feedback_batch(request)


@router.post("/process-pending", response_model=BatchProcessResult)
async def process_pending_feedbacks(
    limit: int = Query(100, ge=1, le=1000),
) -> BatchProcessResult:
    """대기 중인 피드백 일괄 처리

    pending 상태의 피드백을 자동으로 처리합니다.
    """
    service = get_feedback_service()
    return await service.process_pending_feedbacks(limit=limit)


# ============================================================================
# Dataset Endpoints
# ============================================================================


@router.get("/dataset/stats", response_model=DatasetStats)
async def get_dataset_stats() -> DatasetStats:
    """데이터셋 통계 조회

    Fine-tuning용 데이터셋 통계를 반환합니다.
    """
    service = get_feedback_service()
    return await service.get_dataset_stats()


@router.get("/dataset/export")
async def export_dataset(
    format: str = Query("jsonl", regex="^(jsonl|csv)$"),
    include_negative: bool = True,
    include_implicit: bool = True,
    agent_filter: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> PlainTextResponse:
    """데이터셋 내보내기

    Fine-tuning용 데이터셋을 JSONL 또는 CSV 형식으로 내보냅니다.

    Args:
        format: 출력 형식 (jsonl, csv)
        include_negative: 부정 샘플 포함 여부
        include_implicit: 암묵적 피드백 포함 여부
        agent_filter: 특정 에이전트만 필터 (쉼표로 구분)
        start_date: 시작 날짜
        end_date: 종료 날짜

    Returns:
        JSONL 또는 CSV 형식의 데이터셋
    """
    service = get_feedback_service()

    # 에이전트 필터 파싱
    agent_list = None
    if agent_filter:
        agent_list = [a.strip() for a in agent_filter.split(",") if a.strip()]

    options = DatasetExportOptions(
        format=format,
        include_negative=include_negative,
        include_implicit=include_implicit,
        agent_filter=agent_list,
        start_date=start_date,
        end_date=end_date,
    )

    content = await service.export_dataset(options)

    # Content-Type 설정
    media_type = "application/jsonl" if format == "jsonl" else "text/csv"
    filename = f"dataset_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.{format}"

    return PlainTextResponse(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
        },
    )


# ============================================================================
# Task Evaluation Endpoints (태스크 종합 평가)
# ============================================================================


@router.post("/task-evaluation", response_model=TaskEvaluationResponse)
async def submit_task_evaluation(
    evaluation: TaskEvaluationSubmit,
) -> TaskEvaluationResponse:
    """태스크 종합 평가 제출

    태스크 완료 후 전체 만족도, 정확도, 속도 등을 평가합니다.
    """
    service = get_feedback_service()
    return await service.submit_task_evaluation(evaluation)


@router.get("/task-evaluation/stats", response_model=TaskEvaluationStats)
async def get_task_evaluation_stats() -> TaskEvaluationStats:
    """태스크 종합 평가 통계

    평균 별점, 정확도 비율, 속도 만족도 비율을 반환합니다.
    """
    service = get_feedback_service()
    return await service.get_task_evaluation_stats()


@router.get("/task-evaluation/list", response_model=list[TaskEvaluationResponse])
async def list_task_evaluations(
    agent_id: str | None = Query(None, description="에이전트 ID 필터"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[TaskEvaluationResponse]:
    """태스크 평가 목록 조회 (comment 포함)

    최신순으로 정렬된 평가 목록을 반환합니다.
    """
    service = get_feedback_service()
    return await service.list_task_evaluations(
        agent_id=agent_id,
        limit=limit,
        offset=offset,
    )


@router.get("/task-evaluation/{session_id}/{task_id}", response_model=TaskEvaluationResponse)
async def get_task_evaluation(
    session_id: str,
    task_id: str,
) -> TaskEvaluationResponse:
    """특정 태스크 평가 조회"""
    service = get_feedback_service()
    evaluation = await service.get_task_evaluation(session_id, task_id)

    if not evaluation:
        raise HTTPException(status_code=404, detail="Task evaluation not found")

    return evaluation
