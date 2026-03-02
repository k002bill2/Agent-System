"""
RLHF Feedback Service

피드백 수집, 처리, 데이터셋 구성을 담당하는 서비스입니다.
In-memory와 Database 모드 모두 지원합니다.
"""

import json
import os
import uuid
from datetime import datetime
from typing import Any

from models.feedback import (
    BatchProcessResult,
    DatasetEntry,
    DatasetExportOptions,
    DatasetStats,
    FeedbackEntry,
    FeedbackQueryParams,
    FeedbackReason,
    FeedbackResponse,
    FeedbackStats,
    FeedbackStatus,
    FeedbackSubmit,
    FeedbackType,
    ProcessFeedbackRequest,
    ProcessFeedbackResult,
    TaskEvaluationResponse,
    TaskEvaluationStats,
    TaskEvaluationSubmit,
)
from utils.time import utcnow

# Environment variable to control storage mode
USE_DATABASE = os.getenv("USE_DATABASE", "false").lower() == "true"

# Default system prompt for dataset
DEFAULT_SYSTEM_PROMPT = """You are an expert AI assistant specialized in software development.
You help users with coding tasks, debugging, and architecture decisions.
Provide clear, accurate, and helpful responses."""


class FeedbackService:
    """피드백 수집 및 데이터셋 관리 서비스

    In-memory와 Database 모드 모두 지원합니다.
    """

    def __init__(self, use_database: bool = USE_DATABASE):
        self.use_database = use_database
        # In-memory storage
        self._feedbacks: dict[str, dict[str, Any]] = {}
        self._dataset_entries: dict[str, dict[str, Any]] = {}
        self._task_evaluations: dict[str, dict[str, Any]] = {}  # key: "session_id:task_id"

    # =========================================================================
    # Feedback CRUD
    # =========================================================================

    async def submit_feedback(
        self,
        feedback: FeedbackSubmit,
        agent_id: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> FeedbackResponse:
        """피드백 제출"""
        feedback_id = str(uuid.uuid4())
        now = utcnow()

        feedback_data = {
            "id": feedback_id,
            "session_id": feedback.session_id,
            "task_id": feedback.task_id,
            "message_id": feedback.message_id,
            "feedback_type": feedback.feedback_type.value,
            "reason": feedback.reason.value if feedback.reason else None,
            "reason_detail": feedback.reason_detail,
            "original_output": feedback.original_output,
            "corrected_output": feedback.corrected_output,
            "agent_id": agent_id,
            "project_name": feedback.project_name,
            "effort_level": feedback.effort_level,
            "context_json": context or {},
            "status": FeedbackStatus.PENDING.value,
            "created_at": now,
            "processed_at": None,
        }

        if self.use_database:
            await self._save_feedback_to_db(feedback_data)
        else:
            self._feedbacks[feedback_id] = feedback_data

        return FeedbackResponse(
            id=feedback_id,
            session_id=feedback.session_id,
            task_id=feedback.task_id,
            feedback_type=feedback.feedback_type,
            reason=feedback.reason,
            status=FeedbackStatus.PENDING,
            created_at=now,
        )

    async def get_feedback(self, feedback_id: str) -> FeedbackEntry | None:
        """단일 피드백 조회"""
        if self.use_database:
            return await self._get_feedback_from_db(feedback_id)
        else:
            data = self._feedbacks.get(feedback_id)
            return self._to_feedback_entry(data) if data else None

    async def get_feedbacks(
        self,
        params: FeedbackQueryParams,
    ) -> list[FeedbackEntry]:
        """피드백 목록 조회 (DB + in-memory fallback 병합)"""
        if self.use_database:
            db_results = await self._query_feedbacks_from_db(params)
            # In-memory fallback 데이터도 포함 (FK 제약으로 DB 저장 실패한 항목)
            memory_results = self._query_feedbacks_memory(params)
            if memory_results:
                db_results.extend(memory_results)
                # 시간 역순 정렬
                db_results.sort(key=lambda f: f.created_at, reverse=True)
            return db_results
        else:
            return self._query_feedbacks_memory(params)

    async def update_feedback_status(
        self,
        feedback_id: str,
        status: FeedbackStatus,
    ) -> bool:
        """피드백 상태 업데이트"""
        if self.use_database:
            return await self._update_feedback_status_db(feedback_id, status)
        else:
            if feedback_id in self._feedbacks:
                self._feedbacks[feedback_id]["status"] = status.value
                if status == FeedbackStatus.PROCESSED:
                    self._feedbacks[feedback_id]["processed_at"] = utcnow()
                return True
            return False

    # =========================================================================
    # Feedback Statistics
    # =========================================================================

    async def get_feedback_stats(
        self,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
    ) -> FeedbackStats:
        """피드백 통계 조회 (DB + in-memory fallback 병합)"""
        if self.use_database:
            db_stats = await self._get_stats_from_db(start_date, end_date)
            # In-memory fallback 데이터 통계도 병합
            if self._feedbacks:
                mem_stats = self._get_stats_memory(start_date, end_date)
                db_stats.total_count += mem_stats.total_count
                for k, v in mem_stats.by_type.items():
                    db_stats.by_type[k] = db_stats.by_type.get(k, 0) + v
                for k, v in mem_stats.by_status.items():
                    db_stats.by_status[k] = db_stats.by_status.get(k, 0) + v
                for k, v in mem_stats.by_reason.items():
                    db_stats.by_reason[k] = db_stats.by_reason.get(k, 0) + v
                for k, v in mem_stats.by_agent.items():
                    db_stats.by_agent[k] = db_stats.by_agent.get(k, 0) + v
                # Recalculate rates
                if db_stats.total_count > 0:
                    positive = db_stats.by_type.get("explicit_positive", 0)
                    implicit = db_stats.by_type.get("implicit", 0)
                    db_stats.positive_rate = positive / db_stats.total_count * 100
                    db_stats.implicit_rate = implicit / db_stats.total_count * 100
            return db_stats
        else:
            return self._get_stats_memory(start_date, end_date)

    # =========================================================================
    # Feedback Processing (변환 to Dataset)
    # =========================================================================

    async def process_feedback(self, feedback_id: str) -> ProcessFeedbackResult:
        """단일 피드백을 데이터셋 엔트리로 변환"""
        feedback = await self.get_feedback(feedback_id)

        if not feedback:
            return ProcessFeedbackResult(
                feedback_id=feedback_id,
                success=False,
                error="Feedback not found",
            )

        if feedback.status == FeedbackStatus.PROCESSED:
            return ProcessFeedbackResult(
                feedback_id=feedback_id,
                success=False,
                error="Feedback already processed",
            )

        try:
            # 데이터셋 엔트리 생성
            entry = await self._create_dataset_entry(feedback)

            # 피드백 상태 업데이트
            await self.update_feedback_status(feedback_id, FeedbackStatus.PROCESSED)

            return ProcessFeedbackResult(
                feedback_id=feedback_id,
                success=True,
                dataset_entry_id=entry.id,
            )
        except Exception as e:
            await self.update_feedback_status(feedback_id, FeedbackStatus.ERROR)
            return ProcessFeedbackResult(
                feedback_id=feedback_id,
                success=False,
                error=str(e),
            )

    async def process_feedback_batch(
        self,
        request: ProcessFeedbackRequest,
    ) -> BatchProcessResult:
        """여러 피드백 일괄 처리"""
        results = []
        processed = 0
        skipped = 0
        errors = 0

        for feedback_id in request.feedback_ids:
            result = await self.process_feedback(feedback_id)
            results.append(result)

            if result.success:
                processed += 1
            elif "already processed" in (result.error or ""):
                skipped += 1
            else:
                errors += 1

        return BatchProcessResult(
            total=len(request.feedback_ids),
            processed=processed,
            skipped=skipped,
            errors=errors,
            results=results,
        )

    async def process_pending_feedbacks(self, limit: int = 100) -> BatchProcessResult:
        """대기 중인 피드백 일괄 처리"""
        params = FeedbackQueryParams(status=FeedbackStatus.PENDING, limit=limit)
        feedbacks = await self.get_feedbacks(params)

        request = ProcessFeedbackRequest(feedback_ids=[f.id for f in feedbacks])
        return await self.process_feedback_batch(request)

    # =========================================================================
    # Dataset Management
    # =========================================================================

    async def export_dataset(
        self,
        options: DatasetExportOptions,
    ) -> str:
        """데이터셋을 지정 형식으로 내보내기"""
        entries = await self._get_dataset_entries(options)

        if options.format == "jsonl":
            return self._export_to_jsonl(entries)
        elif options.format == "csv":
            return self._export_to_csv(entries)
        else:
            raise ValueError(f"Unsupported format: {options.format}")

    async def get_dataset_stats(self) -> DatasetStats:
        """데이터셋 통계 조회"""
        if self.use_database:
            return await self._get_dataset_stats_from_db()
        else:
            return self._get_dataset_stats_memory()

    # =========================================================================
    # Task Evaluation (태스크 종합 평가)
    # =========================================================================

    async def submit_task_evaluation(
        self,
        evaluation: TaskEvaluationSubmit,
    ) -> TaskEvaluationResponse:
        """태스크 종합 평가 제출

        Task evaluation을 저장하고, feedback 시스템에도 연동하여
        Feedback History에서 조회 가능하게 합니다.
        """
        eval_id = str(uuid.uuid4())
        now = datetime.now()
        key = f"{evaluation.session_id}:{evaluation.task_id}"

        eval_data = {
            "id": eval_id,
            "session_id": evaluation.session_id,
            "task_id": evaluation.task_id,
            "rating": evaluation.rating,
            "result_accuracy": evaluation.result_accuracy,
            "speed_satisfaction": evaluation.speed_satisfaction,
            "comment": evaluation.comment,
            "agent_id": evaluation.agent_id,
            "context_summary": evaluation.context_summary,
            "project_name": evaluation.project_name,
            "effort_level": evaluation.effort_level,
            "created_at": now,
        }

        self._task_evaluations[key] = eval_data

        # DB 저장 시도
        if self.use_database:
            try:
                await self._save_task_evaluation_to_db(eval_data)
            except Exception:
                pass  # in-memory fallback already saved above

        # Feedback History에도 연동 저장
        # DB 모드에서 FK 제약(session_id) 실패 시 in-memory에 저장
        feedback_type = (
            FeedbackType.EXPLICIT_POSITIVE
            if evaluation.rating >= 3
            else FeedbackType.EXPLICIT_NEGATIVE
        )
        reason = None
        if evaluation.rating < 3:
            if not evaluation.result_accuracy:
                reason = FeedbackReason.INCORRECT
            elif not evaluation.speed_satisfaction:
                reason = FeedbackReason.PERFORMANCE
            else:
                reason = FeedbackReason.OTHER

        # original_output에 context_summary가 있으면 사용, 없으면 기본 텍스트
        output_text = (
            evaluation.context_summary
            if evaluation.context_summary
            else f"Task evaluation: rating={evaluation.rating}"
        )

        try:
            feedback_submit = FeedbackSubmit(
                session_id=evaluation.session_id,
                task_id=evaluation.task_id,
                feedback_type=feedback_type,
                reason=reason,
                reason_detail=evaluation.comment,
                original_output=output_text,
                project_name=evaluation.project_name,
                effort_level=evaluation.effort_level,
            )
            await self.submit_feedback(
                feedback_submit,
                agent_id=evaluation.agent_id,
            )
        except Exception:
            # FK constraint failure (session not in DB) - save to in-memory
            feedback_id = str(uuid.uuid4())
            self._feedbacks[feedback_id] = {
                "id": feedback_id,
                "session_id": evaluation.session_id,
                "task_id": evaluation.task_id,
                "message_id": None,
                "feedback_type": feedback_type.value,
                "reason": reason.value if reason else None,
                "reason_detail": evaluation.comment,
                "original_output": output_text,
                "corrected_output": None,
                "agent_id": evaluation.agent_id,
                "project_name": evaluation.project_name,
                "effort_level": evaluation.effort_level,
                "context_json": {},
                "status": FeedbackStatus.PENDING.value,
                "created_at": now,
                "processed_at": None,
            }

        return TaskEvaluationResponse(
            id=eval_id,
            session_id=evaluation.session_id,
            task_id=evaluation.task_id,
            rating=evaluation.rating,
            result_accuracy=evaluation.result_accuracy,
            speed_satisfaction=evaluation.speed_satisfaction,
            comment=evaluation.comment,
            agent_id=evaluation.agent_id,
            created_at=now,
        )

    async def get_task_evaluation(
        self,
        session_id: str,
        task_id: str,
    ) -> TaskEvaluationResponse | None:
        """세션+태스크 ID로 평가 조회"""
        key = f"{session_id}:{task_id}"
        data = self._task_evaluations.get(key)
        if not data and self.use_database:
            data = await self._get_task_evaluation_from_db(session_id, task_id)
            if data:
                self._task_evaluations[key] = data  # cache

        if not data:
            return None

        return TaskEvaluationResponse(
            id=data["id"],
            session_id=data["session_id"],
            task_id=data["task_id"],
            rating=data["rating"],
            result_accuracy=data["result_accuracy"],
            speed_satisfaction=data["speed_satisfaction"],
            comment=data.get("comment"),
            agent_id=data.get("agent_id"),
            created_at=data["created_at"],
        )

    async def list_task_evaluations(
        self,
        agent_id: str | None = None,
        project_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[TaskEvaluationResponse]:
        """태스크 평가 목록 조회 (DB + in-memory 병합)"""
        if self.use_database:
            db_results = await self._list_task_evaluations_from_db(
                agent_id, limit, offset, project_id=project_id
            )
            # In-memory fallback 데이터도 포함
            memory_evals = list(self._task_evaluations.values())
            if agent_id:
                memory_evals = [e for e in memory_evals if e.get("agent_id") == agent_id]
            # DB에 없는 in-memory 항목만 추가
            db_ids = {r.id for r in db_results}
            for e in memory_evals:
                if e["id"] not in db_ids:
                    db_results.append(
                        TaskEvaluationResponse(
                            id=e["id"],
                            session_id=e["session_id"],
                            task_id=e["task_id"],
                            rating=e["rating"],
                            result_accuracy=e["result_accuracy"],
                            speed_satisfaction=e["speed_satisfaction"],
                            comment=e.get("comment"),
                            agent_id=e.get("agent_id"),
                            created_at=e["created_at"],
                        )
                    )
            db_results.sort(key=lambda r: r.created_at, reverse=True)
            return db_results[:limit]
        else:
            evaluations = list(self._task_evaluations.values())
            if agent_id:
                evaluations = [e for e in evaluations if e.get("agent_id") == agent_id]
            evaluations.sort(key=lambda e: e["created_at"], reverse=True)
            evaluations = evaluations[offset : offset + limit]
            return [
                TaskEvaluationResponse(
                    id=e["id"],
                    session_id=e["session_id"],
                    task_id=e["task_id"],
                    rating=e["rating"],
                    result_accuracy=e["result_accuracy"],
                    speed_satisfaction=e["speed_satisfaction"],
                    comment=e.get("comment"),
                    agent_id=e.get("agent_id"),
                    created_at=e["created_at"],
                )
                for e in evaluations
            ]

    async def get_task_evaluation_stats(self, project_id: str | None = None) -> TaskEvaluationStats:
        """태스크 종합 평가 통계 (DB + in-memory 병합)"""
        from models.feedback import AgentEvalStats

        if self.use_database:
            db_stats = await self._get_task_evaluation_stats_from_db(project_id=project_id)
            # In-memory fallback 병합
            if self._task_evaluations:
                mem_evals = list(self._task_evaluations.values())
                mem_total = len(mem_evals)
                if mem_total > 0:
                    combined_total = db_stats.total_count + mem_total
                    combined_avg = (
                        (
                            (
                                db_stats.avg_rating * db_stats.total_count
                                + sum(e["rating"] for e in mem_evals)
                            )
                            / combined_total
                        )
                        if combined_total > 0
                        else 0
                    )
                    combined_accuracy = (
                        (
                            (
                                db_stats.accuracy_rate * db_stats.total_count
                                + sum(1 for e in mem_evals if e["result_accuracy"])
                            )
                            / combined_total
                        )
                        if combined_total > 0
                        else 0
                    )
                    combined_speed = (
                        (
                            (
                                db_stats.speed_satisfaction_rate * db_stats.total_count
                                + sum(1 for e in mem_evals if e["speed_satisfaction"])
                            )
                            / combined_total
                        )
                        if combined_total > 0
                        else 0
                    )
                    db_stats.total_count = combined_total
                    db_stats.avg_rating = round(combined_avg, 2)
                    db_stats.accuracy_rate = round(combined_accuracy, 4)
                    db_stats.speed_satisfaction_rate = round(combined_speed, 4)
            return db_stats

        # Pure in-memory
        evaluations = list(self._task_evaluations.values())
        total = len(evaluations)

        if total == 0:
            return TaskEvaluationStats()

        avg_rating = sum(e["rating"] for e in evaluations) / total
        accuracy_rate = sum(1 for e in evaluations if e["result_accuracy"]) / total
        speed_rate = sum(1 for e in evaluations if e["speed_satisfaction"]) / total

        agent_map: dict[str, list[dict]] = {}
        for e in evaluations:
            aid = e.get("agent_id")
            if aid:
                agent_map.setdefault(aid, []).append(e)

        by_agent = []
        for aid, evals in agent_map.items():
            cnt = len(evals)
            by_agent.append(
                AgentEvalStats(
                    agent_id=aid,
                    avg_rating=round(sum(x["rating"] for x in evals) / cnt, 2),
                    accuracy_rate=round(sum(1 for x in evals if x["result_accuracy"]) / cnt, 4),
                    speed_satisfaction_rate=round(
                        sum(1 for x in evals if x["speed_satisfaction"]) / cnt, 4
                    ),
                    total_count=cnt,
                )
            )

        return TaskEvaluationStats(
            avg_rating=round(avg_rating, 2),
            accuracy_rate=round(accuracy_rate, 4),
            speed_satisfaction_rate=round(speed_rate, 4),
            total_count=total,
            by_agent=by_agent,
        )

    # =========================================================================
    # Private Methods - In-Memory Operations
    # =========================================================================

    def _query_feedbacks_memory(
        self,
        params: FeedbackQueryParams,
    ) -> list[FeedbackEntry]:
        """메모리에서 피드백 검색"""
        results = []

        for data in self._feedbacks.values():
            # 필터 적용
            if params.session_id and data["session_id"] != params.session_id:
                continue
            if params.feedback_type and data["feedback_type"] != params.feedback_type.value:
                continue
            if params.status and data["status"] != params.status.value:
                continue
            if params.agent_id and data["agent_id"] != params.agent_id:
                continue
            if params.start_date and data["created_at"] < params.start_date:
                continue
            if params.end_date and data["created_at"] > params.end_date:
                continue

            results.append(self._to_feedback_entry(data))

        # 정렬 (최신순)
        results.sort(key=lambda x: x.created_at, reverse=True)

        # 페이지네이션
        return results[params.offset : params.offset + params.limit]

    def _get_stats_memory(
        self,
        start_date: datetime | None,
        end_date: datetime | None,
    ) -> FeedbackStats:
        """메모리에서 통계 계산"""
        by_type: dict[str, int] = {}
        by_reason: dict[str, int] = {}
        by_status: dict[str, int] = {}
        by_agent: dict[str, int] = {}
        total = 0
        positive_count = 0
        implicit_count = 0

        for data in self._feedbacks.values():
            # 날짜 필터
            if start_date and data["created_at"] < start_date:
                continue
            if end_date and data["created_at"] > end_date:
                continue

            total += 1

            # 유형별 집계
            ft = data["feedback_type"]
            by_type[ft] = by_type.get(ft, 0) + 1

            if ft == FeedbackType.EXPLICIT_POSITIVE.value:
                positive_count += 1
            elif ft == FeedbackType.IMPLICIT.value:
                implicit_count += 1

            # 사유별 집계
            if data["reason"]:
                by_reason[data["reason"]] = by_reason.get(data["reason"], 0) + 1

            # 상태별 집계
            by_status[data["status"]] = by_status.get(data["status"], 0) + 1

            # 에이전트별 집계
            if data["agent_id"]:
                by_agent[data["agent_id"]] = by_agent.get(data["agent_id"], 0) + 1

        return FeedbackStats(
            total_count=total,
            by_type=by_type,
            by_reason=by_reason,
            by_status=by_status,
            by_agent=by_agent,
            positive_rate=positive_count / total if total > 0 else 0.0,
            implicit_rate=implicit_count / total if total > 0 else 0.0,
        )

    def _get_dataset_stats_memory(self) -> DatasetStats:
        """메모리에서 데이터셋 통계 계산"""
        total = len(self._dataset_entries)
        positive = sum(1 for e in self._dataset_entries.values() if e["is_positive"])
        by_agent: dict[str, int] = {}
        by_feedback_type: dict[str, int] = {}
        total_input_len = 0
        total_output_len = 0

        for entry in self._dataset_entries.values():
            metadata = entry.get("metadata_json", {})

            agent = metadata.get("agent_id")
            if agent:
                by_agent[agent] = by_agent.get(agent, 0) + 1

            ft = metadata.get("feedback_type")
            if ft:
                by_feedback_type[ft] = by_feedback_type.get(ft, 0) + 1

            total_input_len += len(entry.get("user_input", ""))
            total_output_len += len(entry.get("assistant_output", ""))

        last_updated = None
        if self._dataset_entries:
            last_updated = max(e["created_at"] for e in self._dataset_entries.values())

        return DatasetStats(
            total_entries=total,
            positive_entries=positive,
            negative_entries=total - positive,
            by_agent=by_agent,
            by_feedback_type=by_feedback_type,
            avg_input_length=total_input_len / total if total > 0 else 0.0,
            avg_output_length=total_output_len / total if total > 0 else 0.0,
            last_updated=last_updated,
        )

    def _to_feedback_entry(self, data: dict[str, Any]) -> FeedbackEntry:
        """딕셔너리를 FeedbackEntry로 변환"""
        return FeedbackEntry(
            id=data["id"],
            session_id=data["session_id"],
            task_id=data["task_id"],
            message_id=data.get("message_id"),
            feedback_type=FeedbackType(data["feedback_type"]),
            reason=FeedbackReason(data["reason"]) if data.get("reason") else None,
            reason_detail=data.get("reason_detail"),
            original_output=data["original_output"],
            corrected_output=data.get("corrected_output"),
            agent_id=data.get("agent_id"),
            project_name=data.get("project_name"),
            effort_level=data.get("effort_level"),
            status=FeedbackStatus(data["status"]),
            created_at=data["created_at"],
            processed_at=data.get("processed_at"),
        )

    async def _create_dataset_entry(self, feedback: FeedbackEntry) -> DatasetEntry:
        """피드백을 데이터셋 엔트리로 변환"""
        entry_id = str(uuid.uuid4())
        now = utcnow()

        # 긍정/부정 샘플 결정
        is_positive = feedback.feedback_type == FeedbackType.EXPLICIT_POSITIVE

        # 출력 결정 (수정본이 있으면 수정본 사용)
        output = (
            feedback.corrected_output if feedback.corrected_output else feedback.original_output
        )

        # 메타데이터 구성
        metadata = {
            "feedback_type": feedback.feedback_type.value,
            "agent_id": feedback.agent_id,
            "session_id": feedback.session_id,
            "task_id": feedback.task_id,
        }
        if feedback.reason:
            metadata["reason"] = feedback.reason.value

        entry_data = {
            "id": entry_id,
            "feedback_id": feedback.id,
            "system_prompt": DEFAULT_SYSTEM_PROMPT,
            "user_input": f"Task: {feedback.task_id}",  # 실제로는 태스크 내용을 가져와야 함
            "assistant_output": output,
            "is_positive": is_positive,
            "metadata_json": metadata,
            "created_at": now,
        }

        if self.use_database:
            await self._save_dataset_entry_to_db(entry_data)
        else:
            self._dataset_entries[entry_id] = entry_data

        return DatasetEntry(
            id=entry_id,
            feedback_id=feedback.id,
            system_prompt=DEFAULT_SYSTEM_PROMPT,
            user_input=entry_data["user_input"],
            assistant_output=output,
            is_positive=is_positive,
            metadata=metadata,
            created_at=now,
        )

    async def _get_dataset_entries(
        self,
        options: DatasetExportOptions,
    ) -> list[DatasetEntry]:
        """데이터셋 엔트리 목록 조회"""
        if self.use_database:
            return await self._get_dataset_entries_from_db(options)
        else:
            entries = []
            for data in self._dataset_entries.values():
                # 필터 적용
                if not options.include_negative and not data["is_positive"]:
                    continue

                metadata = data.get("metadata_json", {})
                ft = metadata.get("feedback_type")
                if not options.include_implicit and ft == FeedbackType.IMPLICIT.value:
                    continue

                if options.agent_filter and metadata.get("agent_id") not in options.agent_filter:
                    continue

                if options.start_date and data["created_at"] < options.start_date:
                    continue
                if options.end_date and data["created_at"] > options.end_date:
                    continue

                entries.append(
                    DatasetEntry(
                        id=data["id"],
                        feedback_id=data["feedback_id"],
                        system_prompt=data["system_prompt"],
                        user_input=data["user_input"],
                        assistant_output=data["assistant_output"],
                        is_positive=data["is_positive"],
                        metadata=metadata,
                        created_at=data["created_at"],
                    )
                )

            return entries

    def _export_to_jsonl(self, entries: list[DatasetEntry]) -> str:
        """JSONL 형식으로 내보내기"""
        lines = []
        for entry in entries:
            # OpenAI Fine-tuning 형식
            data = {
                "messages": [
                    {"role": "system", "content": entry.system_prompt},
                    {"role": "user", "content": entry.user_input},
                    {"role": "assistant", "content": entry.assistant_output},
                ],
                "metadata": entry.metadata,
            }
            lines.append(json.dumps(data, ensure_ascii=False))
        return "\n".join(lines)

    def _export_to_csv(self, entries: list[DatasetEntry]) -> str:
        """CSV 형식으로 내보내기"""
        import csv
        from io import StringIO

        output = StringIO()
        writer = csv.writer(output)

        # 헤더
        writer.writerow(
            [
                "id",
                "feedback_id",
                "system_prompt",
                "user_input",
                "assistant_output",
                "is_positive",
                "agent_id",
                "feedback_type",
            ]
        )

        # 데이터
        for entry in entries:
            writer.writerow(
                [
                    entry.id,
                    entry.feedback_id,
                    entry.system_prompt,
                    entry.user_input,
                    entry.assistant_output,
                    entry.is_positive,
                    entry.metadata.get("agent_id", ""),
                    entry.metadata.get("feedback_type", ""),
                ]
            )

        return output.getvalue()

    # =========================================================================
    # Private Methods - Database Operations
    # =========================================================================

    async def _save_feedback_to_db(self, data: dict[str, Any]) -> None:
        """피드백을 DB에 저장"""
        from db.database import async_session_factory
        from db.models import FeedbackModel

        async with async_session_factory() as db:
            model = FeedbackModel(
                id=data["id"],
                session_id=data["session_id"],
                task_id=data["task_id"],
                message_id=data.get("message_id"),
                feedback_type=data["feedback_type"],
                reason=data.get("reason"),
                reason_detail=data.get("reason_detail"),
                original_output=data["original_output"],
                corrected_output=data.get("corrected_output"),
                context_json=data.get("context_json", {}),
                agent_id=data.get("agent_id"),
                project_name=data.get("project_name"),
                effort_level=data.get("effort_level"),
                status=data["status"],
                created_at=data["created_at"],
            )
            db.add(model)
            await db.commit()

    async def _get_feedback_from_db(self, feedback_id: str) -> FeedbackEntry | None:
        """DB에서 피드백 조회"""
        from sqlalchemy import select

        from db.database import async_session_factory
        from db.models import FeedbackModel

        async with async_session_factory() as db:
            result = await db.execute(select(FeedbackModel).where(FeedbackModel.id == feedback_id))
            model = result.scalar_one_or_none()

            if not model:
                return None

            return FeedbackEntry(
                id=model.id,
                session_id=model.session_id,
                task_id=model.task_id,
                message_id=model.message_id,
                feedback_type=FeedbackType(model.feedback_type),
                reason=FeedbackReason(model.reason) if model.reason else None,
                reason_detail=model.reason_detail,
                original_output=model.original_output,
                corrected_output=model.corrected_output,
                agent_id=model.agent_id,
                project_name=model.project_name,
                effort_level=model.effort_level,
                status=FeedbackStatus(model.status),
                created_at=model.created_at,
                processed_at=model.processed_at,
            )

    async def _query_feedbacks_from_db(
        self,
        params: FeedbackQueryParams,
    ) -> list[FeedbackEntry]:
        """DB에서 피드백 목록 조회"""
        from sqlalchemy import desc, select

        from db.database import async_session_factory
        from db.models import FeedbackModel

        async with async_session_factory() as db:
            query = select(FeedbackModel)

            if params.session_id:
                query = query.where(FeedbackModel.session_id == params.session_id)
            if params.feedback_type:
                query = query.where(FeedbackModel.feedback_type == params.feedback_type.value)
            if params.status:
                query = query.where(FeedbackModel.status == params.status.value)
            if params.agent_id:
                query = query.where(FeedbackModel.agent_id == params.agent_id)
            if params.start_date:
                query = query.where(FeedbackModel.created_at >= params.start_date)
            if params.end_date:
                query = query.where(FeedbackModel.created_at <= params.end_date)

            query = query.order_by(desc(FeedbackModel.created_at))
            query = query.offset(params.offset).limit(params.limit)

            result = await db.execute(query)
            models = result.scalars().all()

            return [
                FeedbackEntry(
                    id=m.id,
                    session_id=m.session_id,
                    task_id=m.task_id,
                    message_id=m.message_id,
                    feedback_type=FeedbackType(m.feedback_type),
                    reason=FeedbackReason(m.reason) if m.reason else None,
                    reason_detail=m.reason_detail,
                    original_output=m.original_output,
                    corrected_output=m.corrected_output,
                    agent_id=m.agent_id,
                    project_name=m.project_name,
                    effort_level=m.effort_level,
                    status=FeedbackStatus(m.status),
                    created_at=m.created_at,
                    processed_at=m.processed_at,
                )
                for m in models
            ]

    async def _update_feedback_status_db(
        self,
        feedback_id: str,
        status: FeedbackStatus,
    ) -> bool:
        """DB에서 피드백 상태 업데이트"""
        from sqlalchemy import update

        from db.database import async_session_factory
        from db.models import FeedbackModel

        async with async_session_factory() as db:
            values = {"status": status.value}
            if status == FeedbackStatus.PROCESSED:
                values["processed_at"] = utcnow()

            result = await db.execute(
                update(FeedbackModel).where(FeedbackModel.id == feedback_id).values(**values)
            )
            await db.commit()
            return result.rowcount > 0

    async def _get_stats_from_db(
        self,
        start_date: datetime | None,
        end_date: datetime | None,
    ) -> FeedbackStats:
        """DB에서 통계 조회"""
        from sqlalchemy import select

        from db.database import async_session_factory
        from db.models import FeedbackModel

        async with async_session_factory() as db:
            # 기본 쿼리
            base_query = select(FeedbackModel)
            if start_date:
                base_query = base_query.where(FeedbackModel.created_at >= start_date)
            if end_date:
                base_query = base_query.where(FeedbackModel.created_at <= end_date)

            result = await db.execute(base_query)
            feedbacks = result.scalars().all()

            # 집계
            by_type: dict[str, int] = {}
            by_reason: dict[str, int] = {}
            by_status: dict[str, int] = {}
            by_agent: dict[str, int] = {}
            positive_count = 0
            implicit_count = 0

            for f in feedbacks:
                by_type[f.feedback_type] = by_type.get(f.feedback_type, 0) + 1

                if f.feedback_type == FeedbackType.EXPLICIT_POSITIVE.value:
                    positive_count += 1
                elif f.feedback_type == FeedbackType.IMPLICIT.value:
                    implicit_count += 1

                if f.reason:
                    by_reason[f.reason] = by_reason.get(f.reason, 0) + 1

                by_status[f.status] = by_status.get(f.status, 0) + 1

                if f.agent_id:
                    by_agent[f.agent_id] = by_agent.get(f.agent_id, 0) + 1

            total = len(feedbacks)
            return FeedbackStats(
                total_count=total,
                by_type=by_type,
                by_reason=by_reason,
                by_status=by_status,
                by_agent=by_agent,
                positive_rate=positive_count / total if total > 0 else 0.0,
                implicit_rate=implicit_count / total if total > 0 else 0.0,
            )

    async def _save_dataset_entry_to_db(self, data: dict[str, Any]) -> None:
        """데이터셋 엔트리를 DB에 저장"""
        from db.database import async_session_factory
        from db.models import DatasetEntryModel

        async with async_session_factory() as db:
            model = DatasetEntryModel(
                id=data["id"],
                feedback_id=data["feedback_id"],
                system_prompt=data["system_prompt"],
                user_input=data["user_input"],
                assistant_output=data["assistant_output"],
                is_positive=data["is_positive"],
                metadata_json=data.get("metadata_json", {}),
                created_at=data["created_at"],
            )
            db.add(model)
            await db.commit()

    async def _get_dataset_entries_from_db(
        self,
        options: DatasetExportOptions,
    ) -> list[DatasetEntry]:
        """DB에서 데이터셋 엔트리 조회"""
        from sqlalchemy import select

        from db.database import async_session_factory
        from db.models import DatasetEntryModel

        async with async_session_factory() as db:
            query = select(DatasetEntryModel)

            if not options.include_negative:
                query = query.where(DatasetEntryModel.is_positive == True)  # noqa: E712

            if options.start_date:
                query = query.where(DatasetEntryModel.created_at >= options.start_date)
            if options.end_date:
                query = query.where(DatasetEntryModel.created_at <= options.end_date)

            result = await db.execute(query)
            models = result.scalars().all()

            entries = []
            for m in models:
                metadata = m.metadata_json or {}

                # implicit 필터
                if not options.include_implicit:
                    if metadata.get("feedback_type") == FeedbackType.IMPLICIT.value:
                        continue

                # 에이전트 필터
                if options.agent_filter:
                    if metadata.get("agent_id") not in options.agent_filter:
                        continue

                entries.append(
                    DatasetEntry(
                        id=m.id,
                        feedback_id=m.feedback_id,
                        system_prompt=m.system_prompt,
                        user_input=m.user_input,
                        assistant_output=m.assistant_output,
                        is_positive=m.is_positive,
                        metadata=metadata,
                        created_at=m.created_at,
                    )
                )

            return entries

    async def _save_task_evaluation_to_db(self, data: dict[str, Any]) -> None:
        """태스크 평가를 DB에 저장 (UPSERT)"""
        from sqlalchemy.dialects.postgresql import insert

        from db.database import async_session_factory
        from db.models import TaskEvaluationModel

        async with async_session_factory() as db:
            stmt = insert(TaskEvaluationModel).values(
                id=data["id"],
                session_id=data["session_id"],
                task_id=data["task_id"],
                rating=data["rating"],
                result_accuracy=data["result_accuracy"],
                speed_satisfaction=data["speed_satisfaction"],
                comment=data.get("comment"),
                agent_id=data.get("agent_id"),
                context_summary=data.get("context_summary"),
                project_name=data.get("project_name"),
                effort_level=data.get("effort_level"),
                created_at=data["created_at"],
            )
            stmt = stmt.on_conflict_do_update(
                constraint="uq_task_eval_session_task",
                set_={
                    "rating": stmt.excluded.rating,
                    "result_accuracy": stmt.excluded.result_accuracy,
                    "speed_satisfaction": stmt.excluded.speed_satisfaction,
                    "comment": stmt.excluded.comment,
                    "agent_id": stmt.excluded.agent_id,
                    "context_summary": stmt.excluded.context_summary,
                    "project_name": stmt.excluded.project_name,
                    "effort_level": stmt.excluded.effort_level,
                },
            )
            await db.execute(stmt)
            await db.commit()

    async def _get_task_evaluation_from_db(
        self, session_id: str, task_id: str
    ) -> dict[str, Any] | None:
        """DB에서 태스크 평가 조회"""
        from sqlalchemy import select

        from db.database import async_session_factory
        from db.models import TaskEvaluationModel

        async with async_session_factory() as db:
            result = await db.execute(
                select(TaskEvaluationModel).where(
                    TaskEvaluationModel.session_id == session_id,
                    TaskEvaluationModel.task_id == task_id,
                )
            )
            model = result.scalar_one_or_none()
            if not model:
                return None

            return {
                "id": model.id,
                "session_id": model.session_id,
                "task_id": model.task_id,
                "rating": model.rating,
                "result_accuracy": model.result_accuracy,
                "speed_satisfaction": model.speed_satisfaction,
                "comment": model.comment,
                "agent_id": model.agent_id,
                "context_summary": model.context_summary,
                "project_name": model.project_name,
                "effort_level": model.effort_level,
                "created_at": model.created_at,
            }

    async def _list_task_evaluations_from_db(
        self, agent_id: str | None, limit: int, offset: int, project_id: str | None = None
    ) -> list[TaskEvaluationResponse]:
        """DB에서 태스크 평가 목록 조회"""
        from sqlalchemy import desc, select

        from db.database import async_session_factory
        from db.models import TaskEvaluationModel

        async with async_session_factory() as db:
            query = select(TaskEvaluationModel)
            if project_id:
                project_name = self._resolve_project_name(project_id)
                if project_name:
                    query = query.where(TaskEvaluationModel.project_name == project_name)
                else:
                    # project_id를 찾을 수 없으면 빈 결과 반환
                    return []
            if agent_id:
                query = query.where(TaskEvaluationModel.agent_id == agent_id)
            query = query.order_by(desc(TaskEvaluationModel.created_at))
            query = query.offset(offset).limit(limit)

            result = await db.execute(query)
            models = result.scalars().all()

            return [
                TaskEvaluationResponse(
                    id=m.id,
                    session_id=m.session_id,
                    task_id=m.task_id,
                    rating=m.rating,
                    result_accuracy=m.result_accuracy,
                    speed_satisfaction=m.speed_satisfaction,
                    comment=m.comment,
                    agent_id=m.agent_id,
                    created_at=m.created_at,
                )
                for m in models
            ]

    def _resolve_project_name(self, project_id: str) -> str | None:
        """project_id → project_name 매핑"""
        try:
            from models.project import get_project

            project = get_project(project_id)
            return project.name if project else None
        except Exception:
            return None

    async def _get_task_evaluation_stats_from_db(
        self, project_id: str | None = None
    ) -> TaskEvaluationStats:
        """DB에서 태스크 평가 통계 조회"""
        from sqlalchemy import select

        from db.database import async_session_factory
        from db.models import TaskEvaluationModel
        from models.feedback import AgentEvalStats

        async with async_session_factory() as db:
            query = select(TaskEvaluationModel)
            if project_id:
                project_name = self._resolve_project_name(project_id)
                if project_name:
                    query = query.where(TaskEvaluationModel.project_name == project_name)
                else:
                    return TaskEvaluationStats()
            result = await db.execute(query)
            models = result.scalars().all()
            total = len(models)

            if total == 0:
                return TaskEvaluationStats()

            avg_rating = sum(m.rating for m in models) / total
            accuracy_rate = sum(1 for m in models if m.result_accuracy) / total
            speed_rate = sum(1 for m in models if m.speed_satisfaction) / total

            agent_map: dict[str, list] = {}
            for m in models:
                if m.agent_id:
                    agent_map.setdefault(m.agent_id, []).append(m)

            by_agent = []
            for aid, evals in agent_map.items():
                cnt = len(evals)
                by_agent.append(
                    AgentEvalStats(
                        agent_id=aid,
                        avg_rating=round(sum(m.rating for m in evals) / cnt, 2),
                        accuracy_rate=round(sum(1 for m in evals if m.result_accuracy) / cnt, 4),
                        speed_satisfaction_rate=round(
                            sum(1 for m in evals if m.speed_satisfaction) / cnt, 4
                        ),
                        total_count=cnt,
                    )
                )

            return TaskEvaluationStats(
                avg_rating=round(avg_rating, 2),
                accuracy_rate=round(accuracy_rate, 4),
                speed_satisfaction_rate=round(speed_rate, 4),
                total_count=total,
                by_agent=by_agent,
            )

    async def _get_dataset_stats_from_db(self) -> DatasetStats:
        """DB에서 데이터셋 통계 조회"""
        from sqlalchemy import select

        from db.database import async_session_factory
        from db.models import DatasetEntryModel

        async with async_session_factory() as db:
            result = await db.execute(select(DatasetEntryModel))
            entries = result.scalars().all()

            total = len(entries)
            positive = sum(1 for e in entries if e.is_positive)
            by_agent: dict[str, int] = {}
            by_feedback_type: dict[str, int] = {}
            total_input_len = 0
            total_output_len = 0

            for e in entries:
                metadata = e.metadata_json or {}

                agent = metadata.get("agent_id")
                if agent:
                    by_agent[agent] = by_agent.get(agent, 0) + 1

                ft = metadata.get("feedback_type")
                if ft:
                    by_feedback_type[ft] = by_feedback_type.get(ft, 0) + 1

                total_input_len += len(e.user_input or "")
                total_output_len += len(e.assistant_output or "")

            last_updated = None
            if entries:
                last_updated = max(e.created_at for e in entries)

            return DatasetStats(
                total_entries=total,
                positive_entries=positive,
                negative_entries=total - positive,
                by_agent=by_agent,
                by_feedback_type=by_feedback_type,
                avg_input_length=total_input_len / total if total > 0 else 0.0,
                avg_output_length=total_output_len / total if total > 0 else 0.0,
                last_updated=last_updated,
            )


# 싱글톤 인스턴스
_feedback_service: FeedbackService | None = None


def get_feedback_service() -> FeedbackService:
    """피드백 서비스 인스턴스 반환"""
    global _feedback_service
    if _feedback_service is None:
        _feedback_service = FeedbackService()
    return _feedback_service
