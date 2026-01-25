"""Lead Orchestrator Agent - 멀티 에이전트 워크플로우 조정자.

복잡한 태스크를 분석하고 전문 에이전트에게 위임하며,
병렬/순차 실행을 결정하고 결과를 집계합니다.
"""

import asyncio
import json
import time
import uuid
from datetime import datetime
from enum import Enum
from typing import Any

from langchain_core.messages import SystemMessage, HumanMessage
from pydantic import BaseModel, Field

from agents.base import BaseAgent, AgentConfig, AgentResult
from services.agent_registry import (
    AgentRegistry,
    AgentMetadata,
    AgentCategory,
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

    # 예상
    estimated_total_time_ms: int = 0
    estimated_total_cost: float = 0.0


LEAD_ORCHESTRATOR_SYSTEM_PROMPT = """You are a Lead Orchestrator Agent responsible for coordinating multi-agent workflows.

Your role is to:
1. Analyze complex tasks and determine if they need decomposition
2. Break down complex tasks into smaller, manageable subtasks
3. Identify dependencies between subtasks
4. Select the most appropriate specialized agent for each subtask
5. Determine the optimal execution strategy (parallel vs sequential)
6. Aggregate and validate results from all agents

## Available Specialized Agents

### Development Agents
- **mobile-ui-specialist**: React Native UI/UX expert. Components, layouts, navigation, styling.
- **backend-integration-specialist**: Firebase and API integration. Auth, Firestore, data sync.
- **test-automation-specialist**: Testing expert. Jest, React Native Testing Library, coverage.
- **performance-optimizer**: Performance optimization. Rendering, memory, bundle size.

### Quality Agents
- **quality-validator**: Code review and standards compliance.
- **code-simplifier**: Complexity analysis and refactoring.

## Guidelines

1. **Task Analysis**:
   - Assess complexity (1-10 scale)
   - Identify required capabilities
   - Determine if decomposition is needed

2. **Decomposition Rules**:
   - Each subtask should be atomic and assignable to ONE agent
   - Clearly define inputs and expected outputs
   - Identify dependencies (which tasks must complete first)

3. **Execution Strategy**:
   - PARALLEL: Independent subtasks that can run simultaneously
   - SEQUENTIAL: Tasks with dependencies
   - MIXED: Some parallel, some sequential

4. **Agent Selection**:
   - Match task requirements to agent capabilities
   - Consider agent availability and current load
   - Prefer specialists over generalists when possible

5. **Effort Scaling**:
   - QUICK: Simple tasks, < 5 minutes
   - MEDIUM: Moderate complexity, 5-30 minutes
   - THOROUGH: Complex tasks, 30+ minutes

## Output Format

Always respond with valid JSON in this exact structure:
```json
{
  "analysis": {
    "complexity_score": <1-10>,
    "effort_level": "quick|medium|thorough",
    "requires_decomposition": true|false,
    "context_summary": "<brief summary of the task>",
    "key_requirements": ["requirement1", "requirement2"]
  },
  "subtasks": [
    {
      "title": "<short title>",
      "description": "<detailed description>",
      "assigned_agent_id": "<agent-id>",
      "dependencies": ["<subtask-id>"],
      "effort_level": "quick|medium|thorough",
      "priority": <0-10>
    }
  ],
  "execution_strategy": "sequential|parallel|mixed",
  "reasoning": "<brief explanation of your decisions>"
}
```

If the task is simple and doesn't need decomposition:
```json
{
  "analysis": {
    "complexity_score": <1-3>,
    "effort_level": "quick",
    "requires_decomposition": false,
    "context_summary": "<brief summary>",
    "key_requirements": []
  },
  "subtasks": [
    {
      "title": "<same as original task>",
      "description": "<original task description>",
      "assigned_agent_id": "<most suitable agent>",
      "dependencies": [],
      "effort_level": "quick",
      "priority": 10
    }
  ],
  "execution_strategy": "sequential",
  "reasoning": "<why no decomposition needed>"
}
```
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
            model_name="gemini-2.0-flash-exp",
            temperature=0.3,  # 결정적 분석을 위해 낮은 temperature
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
            agent_info = "\n".join(
                f"- {a.id}: {a.description}" for a in available_agents
            )
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
                    id=f"st-{i+1}",
                    title=st_data.get("title", f"Subtask {i+1}"),
                    description=st_data.get("description", ""),
                    assigned_agent_id=st_data.get("assigned_agent_id"),
                    dependencies=st_data.get("dependencies", []),
                    effort_level=EffortLevel(st_data.get("effort_level", "medium")),
                    priority=st_data.get("priority", 0),
                )
                subtasks.append(subtask)

            # 에이전트 할당 검증 및 보정
            subtasks = self._validate_agent_assignments(subtasks)

            analysis = TaskAnalysis(
                original_task=task,
                complexity_score=analysis_data.get("complexity_score", 5),
                effort_level=EffortLevel(analysis_data.get("effort_level", "medium")),
                requires_decomposition=analysis_data.get("requires_decomposition", False),
                execution_strategy=ExecutionStrategy(
                    data.get("execution_strategy", "sequential")
                ),
                subtasks=subtasks,
                context_summary=analysis_data.get("context_summary", ""),
                key_requirements=analysis_data.get("key_requirements", []),
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
            queue.sort(key=lambda x: next(
                (st.priority for st in subtasks if st.id == x), 0
            ), reverse=True)

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
                    groups.append(ready[i:i+3])

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
                failed.append({
                    "subtask_id": st_id,
                    "error": result.get("error"),
                })

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
