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
        with patch("agents.base.BaseAgent._create_llm", return_value=MagicMock()):
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
        assert plan.task_boundaries is None

    def test_task_boundaries(self):
        """task_boundaries 필드 테스트."""
        boundaries = {
            "do_not": ["다른 파일 수정 금지"],
            "wait_for": ["API 엔드포인트 완성"],
            "stop_if": ["타입 에러 발생"],
        }
        plan = SubtaskPlan(
            title="UI 구현",
            description="로그인 폼 구현",
            task_boundaries=boundaries,
        )
        assert plan.task_boundaries is not None
        assert plan.task_boundaries["do_not"] == ["다른 파일 수정 금지"]
        assert plan.task_boundaries["wait_for"] == ["API 엔드포인트 완성"]
        assert plan.task_boundaries["stop_if"] == ["타입 에러 발생"]


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
        assert analysis.safety_flags == []
        assert analysis.dependency_rationale == ""

    def test_safety_flags_and_dependency_rationale(self):
        """safety_flags, dependency_rationale 필드 테스트."""
        analysis = TaskAnalysis(
            original_task="DB 마이그레이션",
            safety_flags=["data_loss_risk", "irreversible_action"],
            dependency_rationale="백엔드 스키마 변경 후 프론트엔드 업데이트 필요",
        )
        assert analysis.safety_flags == ["data_loss_risk", "irreversible_action"]
        assert "백엔드" in analysis.dependency_rationale

    def test_trivial_effort_level(self):
        """trivial effort level 지원 테스트."""
        analysis = TaskAnalysis(
            original_task="타이포 수정",
            effort_level=EffortLevel.TRIVIAL,
            complexity_score=1,
        )
        assert analysis.effort_level == EffortLevel.TRIVIAL
        assert analysis.effort_level.value == "trivial"


class TestEffortLevel:
    """EffortLevel enum 테스트."""

    def test_all_levels(self):
        """모든 노력 수준 확인."""
        assert EffortLevel.TRIVIAL.value == "trivial"
        assert EffortLevel.QUICK.value == "quick"
        assert EffortLevel.MEDIUM.value == "medium"
        assert EffortLevel.THOROUGH.value == "thorough"

    def test_backward_compatibility(self):
        """기존 문자열 값과의 하위 호환 테스트."""
        assert EffortLevel("quick") == EffortLevel.QUICK
        assert EffortLevel("medium") == EffortLevel.MEDIUM
        assert EffortLevel("thorough") == EffortLevel.THOROUGH
        assert EffortLevel("trivial") == EffortLevel.TRIVIAL


class TestExecutionStrategy:
    """ExecutionStrategy enum 테스트."""

    def test_strategy_values(self):
        """전략 값 확인."""
        assert ExecutionStrategy.SEQUENTIAL.value == "sequential"
        assert ExecutionStrategy.PARALLEL.value == "parallel"
        assert ExecutionStrategy.MIXED.value == "mixed"


class TestAnalyzeTaskParsing:
    """_analyze_task 파싱에서 새 필드 추출 테스트."""

    def setup_method(self):
        """테스트 전 오케스트레이터 생성 (LLM mock)."""
        with patch("agents.base.BaseAgent._create_llm", return_value=MagicMock()):
            self.orchestrator = LeadOrchestratorAgent()

    @pytest.mark.asyncio
    async def test_parse_new_fields(self):
        """safety_flags, dependency_rationale, task_boundaries 파싱 테스트."""
        mock_response = '''```json
{
  "analysis": {
    "complexity_score": 7,
    "effort_level": "medium",
    "requires_decomposition": true,
    "context_summary": "API + UI 기능 구현",
    "key_requirements": ["REST API", "React 컴포넌트"],
    "safety_flags": ["security_sensitive", "external_dependency"],
    "dependency_rationale": "백엔드 API 완성 후 프론트엔드 연동"
  },
  "subtasks": [
    {
      "title": "API 엔드포인트 구현",
      "description": "REST API 엔드포인트 추가",
      "assigned_agent_id": "backend-integration-specialist",
      "dependencies": [],
      "effort_level": "medium",
      "priority": 10,
      "task_boundaries": {
        "do_not": ["프론트엔드 코드 수정 금지"],
        "wait_for": [],
        "stop_if": ["pytest 실패"]
      }
    },
    {
      "title": "UI 컴포넌트 구현",
      "description": "React 컴포넌트 추가",
      "assigned_agent_id": "web-ui-specialist",
      "dependencies": ["st-1"],
      "effort_level": "medium",
      "priority": 8,
      "task_boundaries": {
        "do_not": ["백엔드 코드 수정 금지"],
        "wait_for": ["API 엔드포인트 완성"],
        "stop_if": ["tsc --noEmit 실패"]
      }
    }
  ],
  "execution_strategy": "sequential",
  "reasoning": "API 먼저 구현 후 UI 연동"
}
```'''

        with patch.object(self.orchestrator, '_invoke_llm', new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = mock_response

            result = await self.orchestrator.execute("API와 UI 기능 구현")

            assert result.success is True
            analysis = result.output["analysis"]

            # 새 필드 검증
            assert analysis["safety_flags"] == ["security_sensitive", "external_dependency"]
            assert "백엔드" in analysis["dependency_rationale"]

            # subtask task_boundaries 검증
            subtasks = analysis["subtasks"]
            assert subtasks[0]["task_boundaries"]["do_not"] == ["프론트엔드 코드 수정 금지"]
            assert subtasks[1]["task_boundaries"]["stop_if"] == ["tsc --noEmit 실패"]

    @pytest.mark.asyncio
    async def test_parse_without_new_fields_backward_compat(self):
        """새 필드 없는 기존 응답도 정상 파싱 (하위 호환)."""
        mock_response = '''```json
{
  "analysis": {
    "complexity_score": 3,
    "effort_level": "quick",
    "requires_decomposition": false,
    "context_summary": "간단한 수정",
    "key_requirements": []
  },
  "subtasks": [
    {
      "title": "버튼 추가",
      "description": "삭제 버튼 컴포넌트 추가",
      "assigned_agent_id": "web-ui-specialist",
      "dependencies": [],
      "effort_level": "quick",
      "priority": 10
    }
  ],
  "execution_strategy": "sequential",
  "reasoning": "간단한 작업"
}
```'''

        with patch.object(self.orchestrator, '_invoke_llm', new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = mock_response

            result = await self.orchestrator.execute("버튼 추가")

            assert result.success is True
            analysis = result.output["analysis"]

            # 기본값으로 정상 동작
            assert analysis["safety_flags"] == []
            assert analysis["dependency_rationale"] == ""
            assert analysis["subtasks"][0]["task_boundaries"] is None
