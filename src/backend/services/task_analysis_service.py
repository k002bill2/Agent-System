"""
Task Analysis Service

태스크 분석 히스토리 저장 및 조회 서비스
In-memory와 Database 모드 모두 지원합니다.
"""

import os
import uuid
from datetime import datetime
from typing import Any

from models.task_analysis import (
    TaskAnalysisEntry,
    TaskAnalysisListResponse,
    TaskAnalysisSaveRequest,
    TaskAnalysisQueryParams,
)


# Environment variable to control storage mode
USE_DATABASE = os.getenv("USE_DATABASE", "false").lower() == "true"


class TaskAnalysisService:
    """태스크 분석 히스토리 관리 서비스

    In-memory와 Database 모드 모두 지원합니다.
    """

    def __init__(self, use_database: bool = USE_DATABASE):
        self.use_database = use_database
        # In-memory storage
        self._analyses: dict[str, dict[str, Any]] = {}

    # =========================================================================
    # Public Methods
    # =========================================================================

    async def save_analysis(
        self,
        request: TaskAnalysisSaveRequest,
    ) -> TaskAnalysisEntry:
        """분석 결과 저장"""
        analysis_id = str(uuid.uuid4())
        now = datetime.utcnow()

        # Extract summary fields from analysis
        complexity_score = None
        effort_level = None
        subtask_count = None
        strategy = None

        if request.success and request.analysis:
            analysis_data = request.analysis.get("analysis", {})
            execution_plan = request.analysis.get("execution_plan", {})

            complexity_score = analysis_data.get("complexity_score")
            effort_level = analysis_data.get("effort_level")
            subtask_count = request.analysis.get("subtask_count")
            strategy = request.analysis.get("strategy")

        entry_data = {
            "id": analysis_id,
            "project_id": request.project_id,
            "user_id": request.user_id,
            "task_input": request.task_input,
            "context_json": request.context or {},
            "success": request.success,
            "analysis_json": request.analysis,
            "error": request.error,
            "execution_time_ms": request.execution_time_ms,
            "complexity_score": complexity_score,
            "effort_level": effort_level,
            "subtask_count": subtask_count,
            "strategy": strategy,
            "created_at": now,
        }

        if self.use_database:
            await self._save_to_db(entry_data)
        else:
            self._analyses[analysis_id] = entry_data

        return TaskAnalysisEntry(
            id=analysis_id,
            project_id=request.project_id,
            user_id=request.user_id,
            task_input=request.task_input,
            context=request.context,
            success=request.success,
            analysis=request.analysis,
            error=request.error,
            execution_time_ms=request.execution_time_ms,
            complexity_score=complexity_score,
            effort_level=effort_level,
            subtask_count=subtask_count,
            strategy=strategy,
            created_at=now,
        )

    async def get_analyses(
        self,
        params: TaskAnalysisQueryParams,
    ) -> TaskAnalysisListResponse:
        """분석 히스토리 조회"""
        if self.use_database:
            return await self._query_from_db(params)
        else:
            return self._query_from_memory(params)

    async def get_analysis(self, analysis_id: str) -> TaskAnalysisEntry | None:
        """단일 분석 조회"""
        if self.use_database:
            return await self._get_from_db(analysis_id)
        else:
            data = self._analyses.get(analysis_id)
            return self._to_entry(data) if data else None

    async def delete_analysis(self, analysis_id: str) -> bool:
        """분석 삭제"""
        if self.use_database:
            return await self._delete_from_db(analysis_id)
        else:
            if analysis_id in self._analyses:
                del self._analyses[analysis_id]
                return True
            return False

    # =========================================================================
    # Private Methods - In-Memory Operations
    # =========================================================================

    def _query_from_memory(
        self,
        params: TaskAnalysisQueryParams,
    ) -> TaskAnalysisListResponse:
        """메모리에서 분석 검색"""
        results = []

        for data in self._analyses.values():
            # 필터 적용
            if params.project_id and data["project_id"] != params.project_id:
                continue
            if params.user_id and data["user_id"] != params.user_id:
                continue

            results.append(self._to_entry(data))

        # 정렬 (최신순)
        results.sort(key=lambda x: x.created_at, reverse=True)

        # Total count before pagination
        total = len(results)

        # 페이지네이션
        paginated = results[params.offset : params.offset + params.limit]
        has_more = params.offset + params.limit < total

        return TaskAnalysisListResponse(
            items=paginated,
            total=total,
            has_more=has_more,
        )

    def _to_entry(self, data: dict[str, Any]) -> TaskAnalysisEntry:
        """딕셔너리를 TaskAnalysisEntry로 변환"""
        return TaskAnalysisEntry(
            id=data["id"],
            project_id=data.get("project_id"),
            user_id=data.get("user_id"),
            task_input=data["task_input"],
            context=data.get("context_json"),
            success=data["success"],
            analysis=data.get("analysis_json"),
            error=data.get("error"),
            execution_time_ms=data.get("execution_time_ms", 0),
            complexity_score=data.get("complexity_score"),
            effort_level=data.get("effort_level"),
            subtask_count=data.get("subtask_count"),
            strategy=data.get("strategy"),
            created_at=data["created_at"],
        )

    # =========================================================================
    # Private Methods - Database Operations
    # =========================================================================

    async def _save_to_db(self, data: dict[str, Any]) -> None:
        """분석 결과를 DB에 저장"""
        from db.database import async_session_factory
        from db.models import TaskAnalysisModel

        async with async_session_factory() as db:
            model = TaskAnalysisModel(
                id=data["id"],
                project_id=data.get("project_id"),
                user_id=data.get("user_id"),
                task_input=data["task_input"],
                context_json=data.get("context_json", {}),
                success=data["success"],
                analysis_json=data.get("analysis_json"),
                error=data.get("error"),
                execution_time_ms=data.get("execution_time_ms", 0),
                complexity_score=data.get("complexity_score"),
                effort_level=data.get("effort_level"),
                subtask_count=data.get("subtask_count"),
                strategy=data.get("strategy"),
                created_at=data["created_at"],
            )
            db.add(model)
            await db.commit()

    async def _query_from_db(
        self,
        params: TaskAnalysisQueryParams,
    ) -> TaskAnalysisListResponse:
        """DB에서 분석 목록 조회"""
        from sqlalchemy import select, desc, func
        from db.database import async_session_factory
        from db.models import TaskAnalysisModel

        async with async_session_factory() as db:
            # Base query
            query = select(TaskAnalysisModel)
            count_query = select(func.count(TaskAnalysisModel.id))

            # Filters
            if params.project_id:
                query = query.where(TaskAnalysisModel.project_id == params.project_id)
                count_query = count_query.where(TaskAnalysisModel.project_id == params.project_id)
            if params.user_id:
                query = query.where(TaskAnalysisModel.user_id == params.user_id)
                count_query = count_query.where(TaskAnalysisModel.user_id == params.user_id)

            # Get total count
            total_result = await db.execute(count_query)
            total = total_result.scalar() or 0

            # Pagination
            query = query.order_by(desc(TaskAnalysisModel.created_at))
            query = query.offset(params.offset).limit(params.limit)

            result = await db.execute(query)
            models = result.scalars().all()

            items = [
                TaskAnalysisEntry(
                    id=m.id,
                    project_id=m.project_id,
                    user_id=m.user_id,
                    task_input=m.task_input,
                    context=m.context_json,
                    success=m.success,
                    analysis=m.analysis_json,
                    error=m.error,
                    execution_time_ms=m.execution_time_ms or 0,
                    complexity_score=m.complexity_score,
                    effort_level=m.effort_level,
                    subtask_count=m.subtask_count,
                    strategy=m.strategy,
                    created_at=m.created_at,
                )
                for m in models
            ]

            has_more = params.offset + params.limit < total

            return TaskAnalysisListResponse(
                items=items,
                total=total,
                has_more=has_more,
            )

    async def _get_from_db(self, analysis_id: str) -> TaskAnalysisEntry | None:
        """DB에서 단일 분석 조회"""
        from sqlalchemy import select
        from db.database import async_session_factory
        from db.models import TaskAnalysisModel

        async with async_session_factory() as db:
            result = await db.execute(
                select(TaskAnalysisModel).where(TaskAnalysisModel.id == analysis_id)
            )
            m = result.scalar_one_or_none()

            if not m:
                return None

            return TaskAnalysisEntry(
                id=m.id,
                project_id=m.project_id,
                user_id=m.user_id,
                task_input=m.task_input,
                context=m.context_json,
                success=m.success,
                analysis=m.analysis_json,
                error=m.error,
                execution_time_ms=m.execution_time_ms or 0,
                complexity_score=m.complexity_score,
                effort_level=m.effort_level,
                subtask_count=m.subtask_count,
                strategy=m.strategy,
                created_at=m.created_at,
            )

    async def _delete_from_db(self, analysis_id: str) -> bool:
        """DB에서 분석 삭제"""
        from sqlalchemy import delete
        from db.database import async_session_factory
        from db.models import TaskAnalysisModel

        async with async_session_factory() as db:
            result = await db.execute(
                delete(TaskAnalysisModel).where(TaskAnalysisModel.id == analysis_id)
            )
            await db.commit()
            return result.rowcount > 0


# 싱글톤 인스턴스
_task_analysis_service: TaskAnalysisService | None = None


def get_task_analysis_service() -> TaskAnalysisService:
    """태스크 분석 서비스 인스턴스 반환"""
    global _task_analysis_service
    if _task_analysis_service is None:
        _task_analysis_service = TaskAnalysisService()
    return _task_analysis_service
