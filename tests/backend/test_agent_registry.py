"""Tests for Agent Registry."""

import pytest
from services.agent_registry import (
    AgentRegistry,
    AgentMetadata,
    AgentCategory,
    AgentStatus,
    AgentCapability,
    EffortLevel,
    get_agent_registry,
)


class TestAgentRegistry:
    """Agent Registry 테스트."""

    def setup_method(self):
        """테스트 전 새 레지스트리 생성."""
        # 싱글톤과 초기화 상태 모두 리셋
        AgentRegistry._instance = None

        # 새 인스턴스 생성하되 자동 초기화 막기
        registry = object.__new__(AgentRegistry)
        registry._initialized = False
        registry._agents = {}
        registry._agent_factories = {}
        registry._initialized = True
        AgentRegistry._instance = registry

        # 기본 에이전트를 복사해서 등록 (상태 격리)
        from services.agent_registry import DEFAULT_AGENTS
        for agent in DEFAULT_AGENTS:
            # 깊은 복사를 통해 새 인스턴스 생성
            agent_copy = AgentMetadata(
                id=agent.id,
                name=agent.name,
                description=agent.description,
                category=agent.category,
                model=agent.model,
                capabilities=agent.capabilities.copy(),
                specializations=agent.specializations.copy(),
                estimated_cost_per_task=agent.estimated_cost_per_task,
                avg_execution_time_ms=agent.avg_execution_time_ms,
                max_concurrent_tasks=agent.max_concurrent_tasks,
            )
            registry.register(agent_copy)

        self.registry = registry

    def test_default_agents_registered(self):
        """기본 에이전트가 등록되어 있는지 확인."""
        agents = self.registry.get_all()
        assert len(agents) >= 7  # 기본 에이전트 7개

        # 특정 에이전트 존재 확인
        assert self.registry.get("web-ui-specialist") is not None
        assert self.registry.get("backend-integration-specialist") is not None
        assert self.registry.get("test-automation-specialist") is not None
        assert self.registry.get("lead-orchestrator") is not None

    def test_get_by_category(self):
        """카테고리별 에이전트 조회."""
        dev_agents = self.registry.get_by_category(AgentCategory.DEVELOPMENT)
        assert len(dev_agents) >= 3

        quality_agents = self.registry.get_by_category(AgentCategory.QUALITY)
        assert len(quality_agents) >= 2

    def test_get_available(self):
        """사용 가능한 에이전트만 조회."""
        available = self.registry.get_available()
        assert len(available) > 0

        # 모든 에이전트가 available 상태인지 확인
        for agent in available:
            assert agent.is_available()

    def test_find_by_capability(self):
        """능력 기반 에이전트 검색."""
        # UI 관련 검색
        results = self.registry.find_by_capability("create a new React Native component")
        assert len(results) > 0
        # web-ui-specialist가 상위에 있어야 함
        agent_ids = [r[0].id for r in results]
        assert "web-ui-specialist" in agent_ids

        # 테스트 관련 검색
        results = self.registry.find_by_capability("write unit tests with Jest")
        assert len(results) > 0
        agent_ids = [r[0].id for r in results]
        assert "test-automation-specialist" in agent_ids

    def test_select_best_agent(self):
        """최적 에이전트 선택."""
        agent = self.registry.select_best_agent("implement Firebase authentication")
        assert agent is not None
        assert agent.id == "backend-integration-specialist"

    def test_mark_task_started(self):
        """태스크 시작 처리."""
        agent_id = "web-ui-specialist"
        task_id = "task-1"

        # 태스크 시작
        result = self.registry.mark_task_started(agent_id, task_id)
        assert result is True

        # 에이전트 상태 확인
        agent = self.registry.get(agent_id)
        assert task_id in agent.current_tasks

    def test_mark_task_completed(self):
        """태스크 완료 처리."""
        agent_id = "web-ui-specialist"
        task_id = "task-2"

        # 같은 레지스트리 사용
        registry = self.registry

        # 태스크 시작
        start_result = registry.mark_task_started(agent_id, task_id)
        assert start_result is True, "Task should start successfully"

        # 태스크 완료
        result = registry.mark_task_completed(agent_id, task_id, success=True)
        assert result is True

        # 에이전트 상태 확인
        agent = registry.get(agent_id)
        assert task_id not in agent.current_tasks
        assert agent.total_tasks_completed > 0

    def test_update_status(self):
        """에이전트 상태 업데이트."""
        agent_id = "web-ui-specialist"

        # 상태 변경
        result = self.registry.update_status(agent_id, AgentStatus.UNAVAILABLE)
        assert result is True

        agent = self.registry.get(agent_id)
        assert agent.status == AgentStatus.UNAVAILABLE

    def test_get_stats(self):
        """레지스트리 통계 조회."""
        stats = self.registry.get_stats()

        assert "total_agents" in stats
        assert "available_agents" in stats
        assert "by_category" in stats
        assert stats["total_agents"] >= 7


class TestAgentMetadata:
    """AgentMetadata 모델 테스트."""

    def test_is_available(self):
        """가용성 체크."""
        agent = AgentMetadata(
            id="test-agent",
            name="Test Agent",
            description="Test",
            category=AgentCategory.DEVELOPMENT,
        )

        assert agent.is_available() is True

        # 상태를 BUSY로 변경
        agent.status = AgentStatus.BUSY
        assert agent.is_available() is False

    def test_matches_capability(self):
        """능력 매칭 테스트."""
        agent = AgentMetadata(
            id="test-agent",
            name="Test Agent",
            description="Test",
            category=AgentCategory.DEVELOPMENT,
            capabilities=[
                AgentCapability(
                    name="testing",
                    description="Test capability",
                    keywords=["test", "jest", "unit"],
                    priority=10,
                )
            ],
        )

        matches, score = agent.matches_capability("write unit tests")
        assert matches is True
        assert score > 0

        matches, score = agent.matches_capability("deploy to production")
        assert matches is False
        assert score == 0


class TestEffortLevel:
    """EffortLevel enum 테스트."""

    def test_effort_levels(self):
        """노력 수준 값 확인."""
        assert EffortLevel.QUICK.value == "quick"
        assert EffortLevel.MEDIUM.value == "medium"
        assert EffortLevel.THOROUGH.value == "thorough"
