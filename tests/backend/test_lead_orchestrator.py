"""Tests for Lead Orchestrator Agent."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from agents.lead_orchestrator import (
    LeadOrchestratorAgent,
    TaskAnalysis,
    SubtaskPlan,
    ExecutionStrategy,
    EffortLevel,
    get_lead_orchestrator,
)


class TestLeadOrchestratorAgent:
    """Lead Orchestrator Agent 테스트."""

    def setup_method(self):
        """테스트 전 오케스트레이터 생성 (LLM mock)."""
        with patch("agents.base.ChatGoogleGenerativeAI"):
            self.orchestrator = LeadOrchestratorAgent()

    def test_initialization(self):
        """초기화 테스트."""
        assert self.orchestrator.name == "LeadOrchestrator"
        assert "Multi-agent" in self.orchestrator.description

    @pytest.mark.asyncio
    async def test_execute_simple_task(self):
        """간단한 태스크 실행 테스트."""
        # LLM 응답 모킹
        mock_response = '''```json
{
  "analysis": {
    "complexity_score": 3,
    "effort_level": "quick",
    "requires_decomposition": false,
    "context_summary": "Simple UI task",
    "key_requirements": ["React Native"]
  },
  "subtasks": [
    {
      "title": "Create Button",
      "description": "Create a simple button component",
      "assigned_agent_id": "web-ui-specialist",
      "dependencies": [],
      "effort_level": "quick",
      "priority": 10
    }
  ],
  "execution_strategy": "sequential",
  "reasoning": "Simple task, no decomposition needed"
}
```'''

        with patch.object(self.orchestrator, '_invoke_llm', new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = mock_response

            result = await self.orchestrator.execute("Create a button component")

            assert result.success is True
            assert "analysis" in result.output
            assert result.output["subtask_count"] == 1

    @pytest.mark.asyncio
    async def test_execute_complex_task(self):
        """복잡한 태스크 실행 테스트 (분해 필요)."""
        mock_response = '''```json
{
  "analysis": {
    "complexity_score": 8,
    "effort_level": "thorough",
    "requires_decomposition": true,
    "context_summary": "Full feature implementation",
    "key_requirements": ["UI", "Backend", "Tests"]
  },
  "subtasks": [
    {
      "title": "Create UI Components",
      "description": "Build login form UI",
      "assigned_agent_id": "web-ui-specialist",
      "dependencies": [],
      "effort_level": "medium",
      "priority": 10
    },
    {
      "title": "Implement Auth Service",
      "description": "Firebase auth integration",
      "assigned_agent_id": "backend-integration-specialist",
      "dependencies": [],
      "effort_level": "medium",
      "priority": 9
    },
    {
      "title": "Write Tests",
      "description": "Unit tests for login",
      "assigned_agent_id": "test-automation-specialist",
      "dependencies": ["st-1", "st-2"],
      "effort_level": "medium",
      "priority": 5
    }
  ],
  "execution_strategy": "mixed",
  "reasoning": "Complex feature requires multiple specialists"
}
```'''

        with patch.object(self.orchestrator, '_invoke_llm', new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = mock_response

            result = await self.orchestrator.execute("Implement user login with Firebase")

            assert result.success is True
            assert result.output["subtask_count"] == 3
            assert result.output["strategy"] == "mixed"

    def test_topological_sort(self):
        """위상 정렬 테스트."""
        subtasks = [
            SubtaskPlan(id="st-1", title="Task 1", description="First", priority=10),
            SubtaskPlan(id="st-2", title="Task 2", description="Second", dependencies=["st-1"], priority=5),
            SubtaskPlan(id="st-3", title="Task 3", description="Third", dependencies=["st-1"], priority=8),
            SubtaskPlan(id="st-4", title="Task 4", description="Fourth", dependencies=["st-2", "st-3"], priority=1),
        ]

        order = self.orchestrator._topological_sort(subtasks)

        # st-1이 먼저
        assert order.index("st-1") < order.index("st-2")
        assert order.index("st-1") < order.index("st-3")

        # st-2, st-3가 st-4보다 먼저
        assert order.index("st-2") < order.index("st-4")
        assert order.index("st-3") < order.index("st-4")

    def test_create_parallel_groups_sequential(self):
        """순차 실행 그룹 생성 테스트."""
        subtasks = [
            SubtaskPlan(id="st-1", title="Task 1", description="First"),
            SubtaskPlan(id="st-2", title="Task 2", description="Second", dependencies=["st-1"]),
        ]
        order = ["st-1", "st-2"]

        groups = self.orchestrator._create_parallel_groups(
            subtasks, order, ExecutionStrategy.SEQUENTIAL
        )

        # 순차 실행이므로 각 태스크가 별도 그룹
        assert len(groups) == 2
        assert groups[0] == ["st-1"]
        assert groups[1] == ["st-2"]

    def test_create_parallel_groups_parallel(self):
        """병렬 실행 그룹 생성 테스트."""
        subtasks = [
            SubtaskPlan(id="st-1", title="Task 1", description="First"),
            SubtaskPlan(id="st-2", title="Task 2", description="Second"),
            SubtaskPlan(id="st-3", title="Task 3", description="Third"),
        ]
        order = ["st-1", "st-2", "st-3"]

        groups = self.orchestrator._create_parallel_groups(
            subtasks, order, ExecutionStrategy.PARALLEL
        )

        # 의존성이 없으므로 모두 한 그룹
        assert len(groups) == 1
        assert set(groups[0]) == {"st-1", "st-2", "st-3"}

    @pytest.mark.asyncio
    async def test_aggregate_results(self):
        """결과 집계 테스트."""
        subtask_results = {
            "st-1": {"success": True, "output": "Result 1"},
            "st-2": {"success": True, "output": "Result 2"},
            "st-3": {"success": False, "error": "Failed"},
        }

        aggregated = await self.orchestrator.aggregate_results(subtask_results)

        assert aggregated["total_subtasks"] == 3
        assert aggregated["successful"] == 2
        assert aggregated["failed"] == 1
        assert aggregated["all_successful"] is False


class TestSubtaskPlan:
    """SubtaskPlan 모델 테스트."""

    def test_default_values(self):
        """기본값 테스트."""
        plan = SubtaskPlan(title="Test", description="Test task")

        assert plan.id is not None
        assert plan.assigned_agent_id is None
        assert plan.dependencies == []
        assert plan.effort_level == EffortLevel.MEDIUM
        assert plan.status == "pending"


class TestTaskAnalysis:
    """TaskAnalysis 모델 테스트."""

    def test_default_values(self):
        """기본값 테스트."""
        analysis = TaskAnalysis(original_task="Test task")

        assert analysis.complexity_score == 0
        assert analysis.effort_level == EffortLevel.MEDIUM
        assert analysis.requires_decomposition is False
        assert analysis.execution_strategy == ExecutionStrategy.SEQUENTIAL
        assert analysis.subtasks == []


class TestExecutionStrategy:
    """ExecutionStrategy enum 테스트."""

    def test_strategy_values(self):
        """전략 값 확인."""
        assert ExecutionStrategy.SEQUENTIAL.value == "sequential"
        assert ExecutionStrategy.PARALLEL.value == "parallel"
        assert ExecutionStrategy.MIXED.value == "mixed"
