"""Agent Registry - 에이전트 등록/검색/관리 시스템.

에이전트의 메타데이터, 능력, 상태를 중앙에서 관리합니다.
Lead Orchestrator가 적절한 에이전트를 선택할 때 사용합니다.
"""

from collections.abc import Callable
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class AgentCategory(str, Enum):
    """에이전트 카테고리."""

    DEVELOPMENT = "development"
    ORCHESTRATION = "orchestration"
    QUALITY = "quality"
    RESEARCH = "research"


class AgentStatus(str, Enum):
    """에이전트 상태."""

    AVAILABLE = "available"
    BUSY = "busy"
    UNAVAILABLE = "unavailable"
    ERROR = "error"


class EffortLevel(str, Enum):
    """태스크 노력 수준 (effort scaling)."""

    QUICK = "quick"  # < 5분, 단순 작업
    MEDIUM = "medium"  # 5-30분, 중간 복잡도
    THOROUGH = "thorough"  # 30분+, 복잡한 작업


class AgentCapability(BaseModel):
    """에이전트 능력 정의."""

    name: str
    description: str
    keywords: list[str] = Field(default_factory=list)
    priority: int = 0  # 높을수록 우선


class AgentMetadata(BaseModel):
    """에이전트 메타데이터."""

    id: str
    name: str
    description: str
    category: AgentCategory
    model: str = "claude-sonnet-4-20250514"

    # 능력 및 전문 영역
    capabilities: list[AgentCapability] = Field(default_factory=list)
    specializations: list[str] = Field(default_factory=list)

    # 비용 및 성능
    estimated_cost_per_task: float = 0.0  # USD
    avg_execution_time_ms: int = 0
    max_concurrent_tasks: int = 1

    # 상태
    status: AgentStatus = AgentStatus.AVAILABLE
    current_tasks: list[str] = Field(default_factory=list)

    # 메타
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_used_at: datetime | None = None

    # 통계
    total_tasks_completed: int = 0
    success_rate: float = 1.0

    def is_available(self) -> bool:
        """에이전트가 사용 가능한지 확인."""
        return (
            self.status == AgentStatus.AVAILABLE
            and len(self.current_tasks) < self.max_concurrent_tasks
        )

    def matches_capability(self, query: str) -> tuple[bool, int]:
        """쿼리에 대한 능력 매칭 여부와 점수 반환."""
        query_lower = query.lower()
        max_score = 0

        for cap in self.capabilities:
            # 직접 이름 매칭
            if cap.name.lower() in query_lower:
                max_score = max(max_score, cap.priority + 10)
                continue

            # 키워드 매칭
            for keyword in cap.keywords:
                if keyword.lower() in query_lower:
                    max_score = max(max_score, cap.priority + 5)
                    break

        # 전문 영역 매칭
        for spec in self.specializations:
            if spec.lower() in query_lower:
                max_score = max(max_score, 3)

        return max_score > 0, max_score


# 기본 에이전트 정의
DEFAULT_AGENTS: list[AgentMetadata] = [
    # 개발 전문가
    AgentMetadata(
        id="web-ui-specialist",
        name="Web UI Specialist",
        description="Web UI/UX 전문가. 컴포넌트 설계, 반응형 레이아웃, UX 최적화.",
        category=AgentCategory.DEVELOPMENT,
        capabilities=[
            AgentCapability(
                name="react-native-components",
                description="React Native 컴포넌트 설계 및 구현",
                keywords=["component", "ui", "view", "screen", "layout", "style"],
                priority=10,
            ),
            AgentCapability(
                name="navigation",
                description="React Navigation 설정 및 최적화",
                keywords=["navigation", "screen", "route", "tab", "drawer", "stack"],
                priority=8,
            ),
            AgentCapability(
                name="responsive-design",
                description="반응형 레이아웃 및 다양한 화면 크기 지원",
                keywords=["responsive", "adaptive", "dimension", "orientation"],
                priority=6,
            ),
        ],
        specializations=["React Native", "Expo", "TypeScript", "Tailwind"],
        estimated_cost_per_task=0.05,
        avg_execution_time_ms=15000,
    ),
    AgentMetadata(
        id="backend-integration-specialist",
        name="Backend Integration Specialist",
        description="Firebase 및 API 통합 전문가. 데이터 동기화, 인증, 실시간 업데이트.",
        category=AgentCategory.DEVELOPMENT,
        capabilities=[
            AgentCapability(
                name="firebase-integration",
                description="Firebase Auth, Firestore, Functions 통합",
                keywords=["firebase", "firestore", "auth", "authentication", "realtime"],
                priority=10,
            ),
            AgentCapability(
                name="api-integration",
                description="REST/GraphQL API 연동 및 데이터 처리",
                keywords=["api", "rest", "graphql", "fetch", "axios", "endpoint"],
                priority=9,
            ),
            AgentCapability(
                name="data-sync",
                description="오프라인 우선 데이터 동기화 전략",
                keywords=["sync", "offline", "cache", "persistence"],
                priority=7,
            ),
        ],
        specializations=["Firebase", "REST API", "GraphQL", "AsyncStorage"],
        estimated_cost_per_task=0.06,
        avg_execution_time_ms=20000,
    ),
    AgentMetadata(
        id="test-automation-specialist",
        name="Test Automation Specialist",
        description="테스트 자동화 전문가. Jest, RTL, 커버리지 분석, TDD.",
        category=AgentCategory.DEVELOPMENT,
        capabilities=[
            AgentCapability(
                name="unit-testing",
                description="Jest를 사용한 단위 테스트 작성",
                keywords=["test", "jest", "unit", "spec", "mock", "expect"],
                priority=10,
            ),
            AgentCapability(
                name="component-testing",
                description="React Native Testing Library 컴포넌트 테스트",
                keywords=["rtl", "render", "screen", "fireEvent", "component test"],
                priority=9,
            ),
            AgentCapability(
                name="coverage-analysis",
                description="테스트 커버리지 분석 및 개선",
                keywords=["coverage", "branch", "statement", "function"],
                priority=7,
            ),
        ],
        specializations=["Jest", "React Native Testing Library", "Coverage"],
        estimated_cost_per_task=0.04,
        avg_execution_time_ms=12000,
    ),
    # 오케스트레이션
    AgentMetadata(
        id="lead-orchestrator",
        name="Lead Orchestrator",
        description="멀티 에이전트 워크플로우 조정자. 태스크 분해, 에이전트 선택, 결과 집계.",
        category=AgentCategory.ORCHESTRATION,
        capabilities=[
            AgentCapability(
                name="task-decomposition",
                description="복잡한 태스크를 서브태스크로 분해",
                keywords=["decompose", "break down", "split", "subtask"],
                priority=10,
            ),
            AgentCapability(
                name="agent-selection",
                description="태스크에 적합한 에이전트 선택",
                keywords=["select", "assign", "delegate", "agent"],
                priority=9,
            ),
            AgentCapability(
                name="workflow-coordination",
                description="병렬/순차 실행 워크플로우 조정",
                keywords=["parallel", "sequential", "workflow", "coordinate"],
                priority=8,
            ),
        ],
        specializations=["Multi-Agent", "Workflow", "Orchestration"],
        estimated_cost_per_task=0.08,
        avg_execution_time_ms=30000,
        max_concurrent_tasks=3,
    ),
    # 품질
    AgentMetadata(
        id="quality-validator",
        name="Quality Validator",
        description="코드 품질 검증자. 리뷰, 표준 준수 확인, 품질 게이트.",
        category=AgentCategory.QUALITY,
        capabilities=[
            AgentCapability(
                name="code-review",
                description="코드 리뷰 및 개선 제안",
                keywords=["review", "quality", "check", "validate", "verify"],
                priority=10,
            ),
            AgentCapability(
                name="standards-compliance",
                description="코딩 표준 및 프로젝트 규칙 준수 확인",
                keywords=["standard", "convention", "rule", "lint"],
                priority=8,
            ),
        ],
        specializations=["Code Review", "Quality Gates"],
        estimated_cost_per_task=0.03,
        avg_execution_time_ms=8000,
    ),
    AgentMetadata(
        id="code-simplifier",
        name="Code Simplifier",
        description="코드 복잡도 분석 및 단순화 전문가. 리팩토링, 중복 제거.",
        category=AgentCategory.QUALITY,
        capabilities=[
            AgentCapability(
                name="complexity-analysis",
                description="순환 복잡도 및 코드 복잡도 분석",
                keywords=["complexity", "cyclomatic", "cognitive", "nesting"],
                priority=10,
            ),
            AgentCapability(
                name="refactoring",
                description="코드 리팩토링 및 단순화",
                keywords=["refactor", "simplify", "clean", "restructure"],
                priority=9,
            ),
            AgentCapability(
                name="deduplication",
                description="중복 코드 식별 및 제거",
                keywords=["duplicate", "redundant", "dry", "extract"],
                priority=7,
            ),
        ],
        specializations=["Refactoring", "Clean Code"],
        estimated_cost_per_task=0.04,
        avg_execution_time_ms=10000,
    ),
    # 성능
    AgentMetadata(
        id="performance-optimizer",
        name="Performance Optimizer",
        description="성능 최적화 전문가. 메모리, 렌더링, 번들 크기 최적화.",
        category=AgentCategory.DEVELOPMENT,
        capabilities=[
            AgentCapability(
                name="render-optimization",
                description="React Native 렌더링 최적화",
                keywords=["render", "rerender", "memo", "useMemo", "useCallback"],
                priority=10,
            ),
            AgentCapability(
                name="memory-optimization",
                description="메모리 누수 감지 및 최적화",
                keywords=["memory", "leak", "garbage", "profiler"],
                priority=9,
            ),
            AgentCapability(
                name="bundle-optimization",
                description="번들 크기 분석 및 최적화",
                keywords=["bundle", "size", "tree-shaking", "code-splitting"],
                priority=7,
            ),
        ],
        specializations=["Performance", "Optimization", "Profiling"],
        estimated_cost_per_task=0.05,
        avg_execution_time_ms=18000,
    ),
]


class AgentRegistry:
    """에이전트 레지스트리 - 싱글톤."""

    _instance: "AgentRegistry | None" = None

    def __new__(cls) -> "AgentRegistry":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._agents: dict[str, AgentMetadata] = {}
        self._agent_factories: dict[str, Callable] = {}
        self._initialized = True

        # 기본 에이전트 등록
        for agent in DEFAULT_AGENTS:
            self.register(agent)

    def register(self, metadata: AgentMetadata) -> None:
        """에이전트 등록."""
        self._agents[metadata.id] = metadata

    def register_factory(self, agent_id: str, factory: Callable) -> None:
        """에이전트 인스턴스 팩토리 등록."""
        self._agent_factories[agent_id] = factory

    def unregister(self, agent_id: str) -> bool:
        """에이전트 등록 해제."""
        if agent_id in self._agents:
            del self._agents[agent_id]
            if agent_id in self._agent_factories:
                del self._agent_factories[agent_id]
            return True
        return False

    def get(self, agent_id: str) -> AgentMetadata | None:
        """ID로 에이전트 조회."""
        return self._agents.get(agent_id)

    def get_all(self) -> list[AgentMetadata]:
        """모든 에이전트 조회."""
        return list(self._agents.values())

    def get_by_category(self, category: AgentCategory) -> list[AgentMetadata]:
        """카테고리별 에이전트 조회."""
        return [a for a in self._agents.values() if a.category == category]

    def get_available(self) -> list[AgentMetadata]:
        """사용 가능한 에이전트만 조회."""
        return [a for a in self._agents.values() if a.is_available()]

    def find_by_capability(
        self,
        query: str,
        category: AgentCategory | None = None,
        limit: int = 5,
    ) -> list[tuple[AgentMetadata, int]]:
        """
        능력 기반 에이전트 검색.

        Args:
            query: 검색 쿼리 (태스크 설명)
            category: 필터링할 카테고리 (선택)
            limit: 최대 반환 개수

        Returns:
            (에이전트, 매칭 점수) 튜플 리스트 (점수 내림차순)
        """
        results: list[tuple[AgentMetadata, int]] = []

        for agent in self._agents.values():
            # 카테고리 필터
            if category and agent.category != category:
                continue

            # 사용 가능 여부
            if not agent.is_available():
                continue

            # 능력 매칭
            matches, score = agent.matches_capability(query)
            if matches:
                results.append((agent, score))

        # 점수 내림차순 정렬
        results.sort(key=lambda x: x[1], reverse=True)

        return results[:limit]

    def select_best_agent(
        self,
        task_description: str,
        category: AgentCategory | None = None,
    ) -> AgentMetadata | None:
        """
        태스크에 가장 적합한 에이전트 선택.

        Args:
            task_description: 태스크 설명
            category: 선호 카테고리 (선택)

        Returns:
            가장 적합한 에이전트 또는 None
        """
        results = self.find_by_capability(task_description, category, limit=1)
        if results:
            return results[0][0]
        return None

    def update_status(self, agent_id: str, status: AgentStatus) -> bool:
        """에이전트 상태 업데이트."""
        agent = self._agents.get(agent_id)
        if agent:
            agent.status = status
            return True
        return False

    def mark_task_started(self, agent_id: str, task_id: str) -> bool:
        """에이전트에 태스크 할당."""
        agent = self._agents.get(agent_id)
        if agent and agent.is_available():
            agent.current_tasks.append(task_id)
            if len(agent.current_tasks) >= agent.max_concurrent_tasks:
                agent.status = AgentStatus.BUSY
            return True
        return False

    def mark_task_completed(
        self,
        agent_id: str,
        task_id: str,
        success: bool = True,
    ) -> bool:
        """에이전트 태스크 완료 처리."""
        agent = self._agents.get(agent_id)
        if agent and task_id in agent.current_tasks:
            agent.current_tasks.remove(task_id)
            agent.total_tasks_completed += 1
            agent.last_used_at = datetime.utcnow()

            # 성공률 업데이트 (이동 평균)
            alpha = 0.1
            agent.success_rate = alpha * (1.0 if success else 0.0) + (1 - alpha) * agent.success_rate

            if agent.status == AgentStatus.BUSY and len(agent.current_tasks) < agent.max_concurrent_tasks:
                agent.status = AgentStatus.AVAILABLE
            return True
        return False

    def get_stats(self) -> dict[str, Any]:
        """레지스트리 통계 반환."""
        agents = list(self._agents.values())
        return {
            "total_agents": len(agents),
            "available_agents": sum(1 for a in agents if a.is_available()),
            "busy_agents": sum(1 for a in agents if a.status == AgentStatus.BUSY),
            "by_category": {
                cat.value: sum(1 for a in agents if a.category == cat)
                for cat in AgentCategory
            },
            "total_tasks_completed": sum(a.total_tasks_completed for a in agents),
            "avg_success_rate": sum(a.success_rate for a in agents) / len(agents) if agents else 0,
        }


# 글로벌 레지스트리 인스턴스
_registry: AgentRegistry | None = None


def get_agent_registry() -> AgentRegistry:
    """에이전트 레지스트리 싱글톤 반환."""
    global _registry
    if _registry is None:
        _registry = AgentRegistry()
    return _registry
