"""Lead Orchestrator Agent - 멀티 에이전트 워크플로우 조정자.

복잡한 태스크를 분석하고 전문 에이전트에게 위임하며,
병렬/순차 실행을 결정하고 결과를 집계합니다.
"""

import json
import time
import uuid
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from agents.base import AgentConfig, AgentResult, BaseAgent
from models.llm_models import LLMModelRegistry, LLMProvider
from services.agent_registry import (
    EffortLevel,
    get_agent_registry,
)


class ExecutionStrategy(str, Enum):
    """실행 전략."""

    SEQUENTIAL = "sequential"  # 순차 실행 (의존성 있음)
    PARALLEL = "parallel"  # 병렬 실행 (독립적)
    MIXED = "mixed"  # 혼합 (일부 병렬, 일부 순차)


class SubtaskPlan(BaseModel):
    """서브태스크 계획."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    title: str
    description: str
    assigned_agent_id: str | None = None
    dependencies: list[str] = Field(default_factory=list)  # 선행 태스크 ID
    effort_level: EffortLevel = EffortLevel.MEDIUM
    priority: int = 0  # 높을수록 우선
    task_boundaries: dict[str, list[str]] | None = None  # {do_not, wait_for, stop_if}

    # 실행 결과
    status: str = "pending"  # pending, running, completed, failed
    result: Any = None
    error: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None


class TaskAnalysis(BaseModel):
    """태스크 분석 결과."""

    original_task: str
    complexity_score: int = 0  # 1-10
    effort_level: EffortLevel = EffortLevel.MEDIUM
    requires_decomposition: bool = False
    execution_strategy: ExecutionStrategy = ExecutionStrategy.SEQUENTIAL

    # 분해된 서브태스크
    subtasks: list[SubtaskPlan] = Field(default_factory=list)

    # 컨텍스트 요약
    context_summary: str = ""
    key_requirements: list[str] = Field(default_factory=list)

    # 안전성 및 의존성
    safety_flags: list[str] = Field(default_factory=list)
    dependency_rationale: str = ""

    # 예상
    estimated_total_time_ms: int = 0
    estimated_total_cost: float = 0.0


LEAD_ORCHESTRATOR_SYSTEM_PROMPT = """당신은 멀티 에이전트 워크플로우를 조정하는 Lead Orchestrator Agent입니다.

## 역할
1. 복잡한 태스크를 분석하고 분해 필요 여부 결정
2. 복잡한 태스크를 작고 관리 가능한 서브태스크로 분해
3. 서브태스크 간의 의존성 식별
4. 각 서브태스크에 가장 적합한 전문 에이전트 선택
5. 최적의 실행 전략 결정 (병렬 vs 순차)
6. 안전성 위험 요소 사전 식별

## 사용 가능한 전문 에이전트

### 개발 에이전트
- **web-ui-specialist**: Web UI/UX 전문가. 컴포넌트, 레이아웃, 네비게이션, 스타일링.
- **backend-integration-specialist**: Firebase 및 API 통합 전문가. 인증, Firestore, 데이터 동기화.
- **test-automation-specialist**: 테스트 전문가. Jest, React Testing Library, 커버리지.
- **performance-optimizer**: 성능 최적화 전문가. 렌더링, 메모리, 번들 크기.

### 품질 에이전트
- **quality-validator**: 코드 리뷰 및 표준 준수 검증.
- **code-simplifier**: 복잡도 분석 및 리팩토링.

## 4단계 Effort Scaling

복잡도 점수를 아래 체크리스트로 결정하고, 점수에 따라 노력 수준을 할당하세요.

### 복잡도 체크리스트 (각 0-2점, 합산)
- **파일 수**: 0=1파일, 1=2-4파일, 2=5+파일
- **계층 수**: 0=프론트 또는 백 한쪽, 1=프론트+백, 2=프론트+백+인프라/DB
- **테스트 요구**: 0=불필요, 1=단위 테스트, 2=통합+E2E
- **탐색/조사 필요**: 0=명확, 1=일부 조사, 2=광범위 탐색

| 수준 | 복잡도 점수 | 에이전트 수 | 기준 |
|------|-----------|-----------|------|
| trivial | 1-2 | 0 (직접 실행) | 타이포 수정, 단일 라인 변경, 설정값 변경 |
| quick | 3-4 | 1 | 단일 파일 수정, 간단한 컴포넌트 추가 |
| medium | 5-7 | 2-3 | UI+API 연동, 테스트 포함, 여러 파일 수정 |
| thorough | 8-10 | 4+ | 시스템 전반 변경, 아키텍처 리팩토링 |

### 토큰 경제성 원칙
- 멀티 에이전트 실행은 단일 에이전트 대비 약 15배 토큰 소비
- trivial/quick 태스크에 2개 이상 에이전트 할당 금지
- 에이전트 수를 최소화하되, 품질을 희생하지 않는 범위에서 결정

## 안전성 검증

아래 항목에 해당하면 safety_flags에 추가하세요:
- `data_loss_risk`: 데이터 삭제, 덮어쓰기, 마이그레이션 관련 작업
- `irreversible_action`: 되돌릴 수 없는 작업 (DB 스키마 변경, 프로덕션 배포 등)
- `security_sensitive`: 인증, 권한, 토큰, 비밀번호 관련 변경
- `external_dependency`: 외부 API, 서드파티 서비스 의존 변경
- `breaking_change`: 기존 API 계약 변경, 하위 호환성 파괴 가능

## 위임 템플릿

각 서브태스크의 description에 다음을 포함하세요:
- **목표**: 이 서브태스크가 달성해야 할 구체적 결과
- **출력 형식**: 예상 산출물 (파일, 함수, 테스트 등)
- **참조 소스**: 참고해야 할 기존 파일/패턴

복잡한 서브태스크(medium 이상)에는 task_boundaries를 지정하세요:
- **do_not**: 해당 서브태스크에서 하지 말아야 할 것 (범위 초과 방지)
- **wait_for**: 선행 조건이 충족되었는지 확인할 것
- **stop_if**: 중단 조건 (테스트 실패, 타입 에러 등)

## 의존성 순서 원칙

서브태스크 간 의존성은 아래 자연스러운 순서를 따르세요:
```
backend-integration → web-ui → test-automation → performance-optimizer → quality-validator
```
- 백엔드 API가 먼저 존재해야 프론트엔드가 연동 가능
- 구현이 완료되어야 테스트 작성 가능
- 기능이 동작해야 성능 최적화 의미 있음
- 모든 작업 완료 후 품질 검증

dependency_rationale에 의존성 결정 이유를 간단히 설명하세요.

## 출력 형식

**중요: 모든 텍스트 필드(context_summary, key_requirements, title, description, reasoning, dependency_rationale)는 반드시 한글로 작성하세요.**

항상 다음 구조의 유효한 JSON으로 응답하세요:
```json
{
  "analysis": {
    "complexity_score": <1-10>,
    "effort_level": "trivial|quick|medium|thorough",
    "requires_decomposition": true|false,
    "context_summary": "<태스크에 대한 간단한 요약 - 한글로>",
    "key_requirements": ["요구사항1", "요구사항2"],
    "safety_flags": ["data_loss_risk", "security_sensitive"],
    "dependency_rationale": "<의존성 결정 이유 - 한글로>"
  },
  "subtasks": [
    {
      "title": "<짧은 제목 - 한글로>",
      "description": "<목표/출력형식/참조소스 포함 상세 설명 - 한글로>",
      "assigned_agent_id": "<agent-id>",
      "dependencies": ["<subtask-id>"],
      "effort_level": "trivial|quick|medium|thorough",
      "priority": <0-10>,
      "task_boundaries": {
        "do_not": ["범위 밖 작업1"],
        "wait_for": ["선행 조건1"],
        "stop_if": ["중단 조건1"]
      }
    }
  ],
  "execution_strategy": "sequential|parallel|mixed",
  "reasoning": "<결정에 대한 간단한 설명 - 한글로>"
}
```

태스크가 간단하고 분해가 필요 없는 경우 (trivial/quick):
```json
{
  "analysis": {
    "complexity_score": <1-4>,
    "effort_level": "trivial|quick",
    "requires_decomposition": false,
    "context_summary": "<간단한 요약 - 한글로>",
    "key_requirements": [],
    "safety_flags": [],
    "dependency_rationale": ""
  },
  "subtasks": [
    {
      "title": "<원래 태스크와 동일 - 한글로>",
      "description": "<원래 태스크 설명 - 한글로>",
      "assigned_agent_id": "<가장 적합한 에이전트>",
      "dependencies": [],
      "effort_level": "quick",
      "priority": 10,
      "task_boundaries": null
    }
  ],
  "execution_strategy": "sequential",
  "reasoning": "<분해가 필요 없는 이유 - 한글로>"
}
```

## 주의사항
- trivial 태스크(타이포, 설정값 변경)에는 에이전트를 할당하지 말고 직접 실행을 권장하세요
- task_boundaries는 medium 이상 복잡도에서만 지정하세요. quick/trivial에서는 null로 설정
- safety_flags가 비어있으면 빈 배열 []로 출력하세요
"""


class LeadOrchestratorAgent(BaseAgent):
    """
    Lead Orchestrator Agent.

    복잡한 태스크를 분석하고 전문 에이전트에게 위임하여
    효율적인 멀티 에이전트 워크플로우를 조정합니다.
    """

    def __init__(self):
        config = AgentConfig(
            name="LeadOrchestrator",
            description="Multi-agent workflow coordinator that decomposes complex tasks and delegates to specialized agents",
            system_prompt=LEAD_ORCHESTRATOR_SYSTEM_PROMPT,
            model_name=LLMModelRegistry.get_default(LLMProvider.GOOGLE),
            temperature=0.0,  # 일관된 분석 결과를 위해 temperature 0
            max_tokens=4096,
        )
        super().__init__(config)
        self._registry = get_agent_registry()
        self._execution_results: dict[str, Any] = {}

    async def execute(self, task: str, context: dict[str, Any] | None = None) -> AgentResult:
        """
        태스크 실행 - 분석, 분해, 위임, 집계.

        Args:
            task: 실행할 태스크 설명
            context: 추가 컨텍스트 (프로젝트 정보, 이전 결과 등)

        Returns:
            AgentResult with orchestration results
        """
        start_time = time.time()

        try:
            # 1. 태스크 분석
            analysis = await self._analyze_task(task, context)

            if not analysis:
                return self._format_error(Exception("Failed to analyze task"))

            # 2. 서브태스크가 없으면 직접 실행
            if not analysis.subtasks:
                return AgentResult(
                    success=True,
                    output={
                        "analysis": analysis.model_dump(),
                        "message": "Task analysis completed but no subtasks generated",
                    },
                    execution_time_ms=int((time.time() - start_time) * 1000),
                )

            # 3. 실행 계획 생성
            execution_plan = self._create_execution_plan(analysis)

            # 4. 서브태스크 실행 (실제 에이전트 실행은 orchestrator/nodes.py에서 수행)
            # 여기서는 계획만 반환
            execution_time = int((time.time() - start_time) * 1000)

            return AgentResult(
                success=True,
                output={
                    "type": "orchestration_plan",
                    "analysis": analysis.model_dump(),
                    "execution_plan": execution_plan,
                    "subtask_count": len(analysis.subtasks),
                    "strategy": analysis.execution_strategy.value,
                },
                execution_time_ms=execution_time,
            )

        except Exception as e:
            return self._format_error(e)

    async def _analyze_task(
        self,
        task: str,
        context: dict[str, Any] | None = None,
    ) -> TaskAnalysis | None:
        """태스크 분석 및 분해."""
        # 컨텍스트 준비
        context_str = ""
        if context:
            # 사용 가능한 에이전트 목록 추가
            available_agents = self._registry.get_available()
            agent_info = "\n".join(f"- {a.id}: {a.description}" for a in available_agents)
            context_str = f"""
## Available Agents
{agent_info}

## Additional Context
{json.dumps(context, indent=2, default=str)}
"""

        # LLM 호출
        prompt = f"""Analyze the following task and create an execution plan.

## Task
{task}

{context_str}

Remember to respond with valid JSON only."""

        response = await self._invoke_llm(prompt)

        # JSON 파싱
        try:
            # JSON 블록 추출
            json_str = response
            if "```json" in response:
                json_str = response.split("```json")[1].split("```")[0].strip()
            elif "```" in response:
                json_str = response.split("```")[1].split("```")[0].strip()

            data = json.loads(json_str)

            # TaskAnalysis 생성
            analysis_data = data.get("analysis", {})
            subtasks_data = data.get("subtasks", [])

            # 서브태스크 생성
            subtasks = []
            for i, st_data in enumerate(subtasks_data):
                subtask = SubtaskPlan(
                    id=f"st-{i + 1}",
                    title=st_data.get("title", f"Subtask {i + 1}"),
                    description=st_data.get("description", ""),
                    assigned_agent_id=st_data.get("assigned_agent_id"),
                    dependencies=st_data.get("dependencies", []),
                    effort_level=EffortLevel(st_data.get("effort_level", "medium")),
                    priority=st_data.get("priority", 0),
                    task_boundaries=st_data.get("task_boundaries"),
                )
                subtasks.append(subtask)

            # 에이전트 할당 검증 및 보정
            subtasks = self._validate_agent_assignments(subtasks)

            analysis = TaskAnalysis(
                original_task=task,
                complexity_score=analysis_data.get("complexity_score", 5),
                effort_level=EffortLevel(analysis_data.get("effort_level", "medium")),
                requires_decomposition=analysis_data.get("requires_decomposition", False),
                execution_strategy=ExecutionStrategy(data.get("execution_strategy", "sequential")),
                subtasks=subtasks,
                context_summary=analysis_data.get("context_summary", ""),
                key_requirements=analysis_data.get("key_requirements", []),
                safety_flags=analysis_data.get("safety_flags", []),
                dependency_rationale=analysis_data.get("dependency_rationale", ""),
            )

            # 예상 시간/비용 계산
            analysis.estimated_total_time_ms = self._estimate_total_time(subtasks)
            analysis.estimated_total_cost = self._estimate_total_cost(subtasks)

            return analysis

        except json.JSONDecodeError as e:
            # JSON 파싱 실패 시 기본 분석 반환
            return TaskAnalysis(
                original_task=task,
                complexity_score=5,
                effort_level=EffortLevel.MEDIUM,
                requires_decomposition=False,
                subtasks=[
                    SubtaskPlan(
                        title=task[:50],
                        description=task,
                        effort_level=EffortLevel.MEDIUM,
                    )
                ],
                context_summary=f"Failed to parse LLM response: {str(e)}",
            )

    def _validate_agent_assignments(
        self,
        subtasks: list[SubtaskPlan],
    ) -> list[SubtaskPlan]:
        """에이전트 할당 검증 및 자동 할당."""
        for subtask in subtasks:
            if subtask.assigned_agent_id:
                # 할당된 에이전트가 존재하는지 확인
                agent = self._registry.get(subtask.assigned_agent_id)
                if not agent or not agent.is_available():
                    # 대체 에이전트 찾기
                    best_agent = self._registry.select_best_agent(subtask.description)
                    subtask.assigned_agent_id = best_agent.id if best_agent else None
            else:
                # 에이전트 자동 할당
                best_agent = self._registry.select_best_agent(subtask.description)
                subtask.assigned_agent_id = best_agent.id if best_agent else None

        return subtasks

    def _estimate_total_time(self, subtasks: list[SubtaskPlan]) -> int:
        """총 예상 실행 시간 계산 (ms)."""
        total = 0
        for subtask in subtasks:
            if subtask.assigned_agent_id:
                agent = self._registry.get(subtask.assigned_agent_id)
                if agent:
                    total += agent.avg_execution_time_ms
        return total

    def _estimate_total_cost(self, subtasks: list[SubtaskPlan]) -> float:
        """총 예상 비용 계산 (USD)."""
        total = 0.0
        for subtask in subtasks:
            if subtask.assigned_agent_id:
                agent = self._registry.get(subtask.assigned_agent_id)
                if agent:
                    total += agent.estimated_cost_per_task
        return total

    def _create_execution_plan(
        self,
        analysis: TaskAnalysis,
    ) -> dict[str, Any]:
        """실행 계획 생성."""
        # 의존성 기반 실행 순서 결정
        execution_order = self._topological_sort(analysis.subtasks)

        # 병렬 실행 그룹 생성
        parallel_groups = self._create_parallel_groups(
            analysis.subtasks,
            execution_order,
            analysis.execution_strategy,
        )

        return {
            "strategy": analysis.execution_strategy.value,
            "execution_order": execution_order,
            "parallel_groups": parallel_groups,
            "subtasks": {
                st.id: {
                    "title": st.title,
                    "agent": st.assigned_agent_id,
                    "dependencies": st.dependencies,
                    "effort": st.effort_level.value,
                }
                for st in analysis.subtasks
            },
        }

    def _topological_sort(self, subtasks: list[SubtaskPlan]) -> list[str]:
        """의존성 기반 위상 정렬."""
        # 그래프 구성
        in_degree: dict[str, int] = {st.id: 0 for st in subtasks}
        graph: dict[str, list[str]] = {st.id: [] for st in subtasks}

        for st in subtasks:
            for dep in st.dependencies:
                if dep in graph:
                    graph[dep].append(st.id)
                    in_degree[st.id] += 1

        # Kahn's algorithm
        queue = [st_id for st_id, degree in in_degree.items() if degree == 0]
        result = []

        while queue:
            # 우선순위가 높은 것 먼저
            queue.sort(
                key=lambda x: next((st.priority for st in subtasks if st.id == x), 0), reverse=True
            )

            current = queue.pop(0)
            result.append(current)

            for neighbor in graph[current]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        return result

    def _create_parallel_groups(
        self,
        subtasks: list[SubtaskPlan],
        execution_order: list[str],
        strategy: ExecutionStrategy,
    ) -> list[list[str]]:
        """병렬 실행 그룹 생성."""
        if strategy == ExecutionStrategy.SEQUENTIAL:
            # 모두 순차 실행
            return [[st_id] for st_id in execution_order]

        # 의존성이 없는 태스크끼리 그룹화
        subtask_map = {st.id: st for st in subtasks}
        groups: list[list[str]] = []
        completed: set[str] = set()

        remaining = set(execution_order)

        while remaining:
            # 현재 실행 가능한 태스크 (의존성이 모두 완료된)
            ready = []
            for st_id in remaining:
                st = subtask_map[st_id]
                if all(dep in completed for dep in st.dependencies):
                    ready.append(st_id)

            if not ready:
                # 순환 의존성 또는 오류
                break

            if strategy == ExecutionStrategy.PARALLEL:
                # 모두 병렬
                groups.append(ready)
            else:  # MIXED
                # 최대 3개씩 병렬
                for i in range(0, len(ready), 3):
                    groups.append(ready[i : i + 3])

            for st_id in ready:
                completed.add(st_id)
                remaining.remove(st_id)

        return groups

    async def aggregate_results(
        self,
        subtask_results: dict[str, Any],
    ) -> dict[str, Any]:
        """서브태스크 결과 집계."""
        successful = []
        failed = []

        for st_id, result in subtask_results.items():
            if result.get("success"):
                successful.append(st_id)
            else:
                failed.append(
                    {
                        "subtask_id": st_id,
                        "error": result.get("error"),
                    }
                )

        return {
            "total_subtasks": len(subtask_results),
            "successful": len(successful),
            "failed": len(failed),
            "success_rate": len(successful) / len(subtask_results) if subtask_results else 0,
            "failures": failed,
            "all_successful": len(failed) == 0,
        }


# 싱글톤 인스턴스
_orchestrator: LeadOrchestratorAgent | None = None


def get_lead_orchestrator() -> LeadOrchestratorAgent:
    """Lead Orchestrator 싱글톤 반환."""
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = LeadOrchestratorAgent()
    return _orchestrator
