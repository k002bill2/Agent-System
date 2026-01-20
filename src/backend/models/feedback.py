"""
RLHF Feedback Models

에이전트 실행 결과에 대한 사용자 피드백을 수집하고
Fine-tuning용 데이터셋으로 변환하는 모델들입니다.
"""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class FeedbackType(str, Enum):
    """피드백 유형"""
    IMPLICIT = "implicit"  # 사용자가 에이전트 결과를 수정
    EXPLICIT_POSITIVE = "explicit_positive"  # 결과에 만족 (👍)
    EXPLICIT_NEGATIVE = "explicit_negative"  # 결과에 불만족 (👎)


class FeedbackReason(str, Enum):
    """부정 피드백 사유"""
    INCORRECT = "incorrect"  # 결과가 틀림
    INCOMPLETE = "incomplete"  # 불완전한 결과
    OFF_TOPIC = "off_topic"  # 주제에서 벗어남
    STYLE = "style"  # 스타일/형식 문제
    PERFORMANCE = "performance"  # 성능 문제
    OTHER = "other"  # 기타


class FeedbackStatus(str, Enum):
    """피드백 처리 상태"""
    PENDING = "pending"  # 대기 중
    PROCESSED = "processed"  # 처리됨 (데이터셋으로 변환됨)
    SKIPPED = "skipped"  # 건너뜀 (품질 부적합)
    ERROR = "error"  # 처리 오류


# ============================================================================
# Request/Response Models
# ============================================================================


class FeedbackSubmit(BaseModel):
    """피드백 제출 요청"""
    session_id: str = Field(..., description="세션 ID")
    task_id: str = Field(..., description="태스크 ID")
    message_id: str | None = Field(None, description="메시지 ID (optional)")
    feedback_type: FeedbackType = Field(..., description="피드백 유형")
    reason: FeedbackReason | None = Field(None, description="부정 피드백 사유")
    reason_detail: str | None = Field(None, description="상세 사유 설명")
    original_output: str = Field(..., description="원본 출력")
    corrected_output: str | None = Field(None, description="수정된 출력 (implicit 피드백)")

    class Config:
        json_schema_extra = {
            "example": {
                "session_id": "sess-abc123",
                "task_id": "task-xyz789",
                "feedback_type": "explicit_negative",
                "reason": "incomplete",
                "reason_detail": "에러 핸들링 코드가 누락됨",
                "original_output": "function add(a, b) { return a + b; }",
            }
        }


class FeedbackResponse(BaseModel):
    """피드백 제출 응답"""
    id: str = Field(..., description="피드백 ID")
    session_id: str
    task_id: str
    feedback_type: FeedbackType
    reason: FeedbackReason | None = None
    status: FeedbackStatus = FeedbackStatus.PENDING
    created_at: datetime


class FeedbackEntry(BaseModel):
    """피드백 항목 (목록 조회용)"""
    id: str
    session_id: str
    task_id: str
    message_id: str | None = None
    feedback_type: FeedbackType
    reason: FeedbackReason | None = None
    reason_detail: str | None = None
    original_output: str
    corrected_output: str | None = None
    agent_id: str | None = None
    status: FeedbackStatus
    created_at: datetime
    processed_at: datetime | None = None


class FeedbackQueryParams(BaseModel):
    """피드백 조회 파라미터"""
    session_id: str | None = None
    feedback_type: FeedbackType | None = None
    status: FeedbackStatus | None = None
    agent_id: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    limit: int = Field(50, ge=1, le=200)
    offset: int = Field(0, ge=0)


class FeedbackStats(BaseModel):
    """피드백 통계"""
    total_count: int = 0
    by_type: dict[str, int] = Field(default_factory=dict)
    by_reason: dict[str, int] = Field(default_factory=dict)
    by_status: dict[str, int] = Field(default_factory=dict)
    by_agent: dict[str, int] = Field(default_factory=dict)
    positive_rate: float = 0.0  # 긍정 피드백 비율
    implicit_rate: float = 0.0  # 암묵적 피드백 비율


# ============================================================================
# Dataset Models
# ============================================================================


class DatasetEntry(BaseModel):
    """데이터셋 항목 (Fine-tuning용)"""
    id: str
    feedback_id: str
    system_prompt: str
    user_input: str
    assistant_output: str
    is_positive: bool  # 긍정/부정 샘플 여부
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class DatasetExportOptions(BaseModel):
    """데이터셋 내보내기 옵션"""
    format: str = Field("jsonl", description="출력 형식 (jsonl, csv, parquet)")
    include_negative: bool = Field(True, description="부정 샘플 포함 여부")
    include_implicit: bool = Field(True, description="암묵적 피드백 포함 여부")
    agent_filter: list[str] | None = Field(None, description="특정 에이전트만 필터")
    start_date: datetime | None = None
    end_date: datetime | None = None


class DatasetStats(BaseModel):
    """데이터셋 통계"""
    total_entries: int = 0
    positive_entries: int = 0
    negative_entries: int = 0
    by_agent: dict[str, int] = Field(default_factory=dict)
    by_feedback_type: dict[str, int] = Field(default_factory=dict)
    avg_input_length: float = 0.0
    avg_output_length: float = 0.0
    last_updated: datetime | None = None


# ============================================================================
# Processing Models
# ============================================================================


class ProcessFeedbackRequest(BaseModel):
    """피드백 처리 요청"""
    feedback_ids: list[str] = Field(..., description="처리할 피드백 ID 목록")


class ProcessFeedbackResult(BaseModel):
    """피드백 처리 결과"""
    feedback_id: str
    success: bool
    dataset_entry_id: str | None = None
    error: str | None = None


class BatchProcessResult(BaseModel):
    """일괄 처리 결과"""
    total: int
    processed: int
    skipped: int
    errors: int
    results: list[ProcessFeedbackResult]
