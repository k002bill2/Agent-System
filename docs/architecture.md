# Architecture

AOS 백엔드 아키텍처 문서입니다.

## LangGraph Nodes

| Node | 역할 |
|------|------|
| `OrchestratorNode` | 상태 분석, 다음 액션 결정, 의존성 기반 태스크 스케줄링 |
| `PlannerNode` | **LLM 기반** 태스크 분해, 서브태스크 생성, **RAG 컨텍스트 조회** |
| `ExecutorNode` | 태스크 실행, **HITL 승인 체크**, **MCP 도구 자동 통합** |
| `ParallelExecutorNode` | **병렬 태스크 실행** (최대 3개 동시), asyncio.gather 사용 |
| `ReviewerNode` | 품질 검증, 결과 집계 |
| `SelfCorrectionNode` | **에러 분석**, 재시도 전략 생성, 최대 3회 자동 재시도 |

## Agent State

```python
class AgentState(TypedDict):
    session_id: str
    messages: list[dict]
    tasks: dict[str, TaskNode]
    root_task_id: str | None
    agents: dict[str, AgentInfo]
    next_action: str | None
    iteration_count: int
    # HITL (Human-in-the-Loop)
    pending_approvals: dict[str, dict]
    waiting_for_approval: bool
    # Token/Cost Tracking
    token_usage: dict[str, Any]
    total_cost: float
    # Plan Metadata
    plan_metadata: dict[str, Any]
    # Parallel Execution
    batch_task_ids: list[str]  # 병렬 실행 대상 태스크 ID
```

## Task Status Flow

```
pending → in_progress → completed
                     ↘ failed → (retry) → pending
                     ↘ cancelled
                     ↘ paused → (resume) → in_progress
```

## Directory Structure (Backend)

```
src/backend/
├── agents/
│   ├── base.py              # BaseAgent 추상 클래스
│   ├── specialist.py        # Specialist 베이스 클래스
│   ├── lead_orchestrator.py # 리드 오케스트레이터
│   └── specialists/
│       ├── mobile_ui_agent.py
│       ├── backend_agent.py
│       └── test_agent.py
├── orchestrator/
│   ├── engine.py            # 메인 실행 엔진
│   ├── graph.py             # LangGraph 그래프 구성
│   ├── nodes.py             # 6가지 노드 구현
│   ├── parallel_executor.py # 병렬 실행
│   └── tools.py             # MCP 도구 실행자
├── services/
│   ├── agent_registry.py    # 에이전트 등록소
│   ├── auth_service.py      # OAuth/JWT/Email 인증
│   ├── mcp_service.py       # MCP 서버 관리
│   ├── feedback_service.py  # RLHF 피드백
│   ├── rag_service.py       # Vector DB + RAG
│   ├── sandbox_manager.py   # Docker 격리 실행
│   └── ...
├── api/                     # FastAPI 라우터
├── db/                      # SQLAlchemy ORM
└── models/                  # 데이터 모델
```

## Agent Registry

```python
class AgentRegistry:
    def register(self, agent: AgentMetadata) -> bool
    def get_by_category(self, category: AgentCategory) -> list[AgentMetadata]
    def find_by_capability(self, query: str) -> list[tuple[AgentMetadata, int]]
    def select_best_agent(self, task: str) -> AgentMetadata | None
```

**기본 등록 에이전트** (7종):

| Agent ID | 카테고리 | 설명 |
|----------|----------|------|
| `web-ui-specialist` | development | React Web UI/UX |
| `backend-integration-specialist` | development | Firebase, API 통합 |
| `test-automation-specialist` | quality | Vitest 테스트 자동화 |
| `lead-orchestrator` | orchestration | 멀티 에이전트 조정 |
| `quality-validator` | quality | 코드 품질 검증 |
| `code-simplifier` | quality | 복잡도 분석 |
| `performance-optimizer` | development | 성능 최적화 |

## Lead Orchestrator

복잡한 태스크를 분석하고 전문 에이전트에게 위임:

```python
class LeadOrchestratorAgent(BaseAgent):
    async def execute(self, task: str, context: dict) -> AgentResult:
        # 1. 태스크 복잡도 분석
        # 2. 서브태스크 분해
        # 3. 에이전트 선택 및 할당
        # 4. 실행 전략 결정 (sequential/parallel/mixed)
```

**노력 스케일링**:
- `quick`: 단순 태스크 (복잡도 1-3)
- `medium`: 중간 복잡도 (4-6)
- `thorough`: 복잡한 태스크 (7-10)

## MCP Service

```python
class MCPService:
    async def start_server(self, server_id: str) -> bool
    async def call_tool(self, call: MCPToolCall) -> MCPToolResult
    def find_tool(self, tool_name: str) -> tuple[str, MCPToolSchema] | None
```

**기본 MCP 서버**:

| Server ID | 타입 | 설명 |
|-----------|------|------|
| `filesystem` | FILESYSTEM | 파일 시스템 접근 |
| `github` | GITHUB | GitHub API 연동 |
| `playwright` | PLAYWRIGHT | 브라우저 자동화 |

## Parallel Execution

```python
class ParallelExecutorNode(BaseNode):
    async def run(self, state: AgentState) -> dict:
        semaphore = asyncio.Semaphore(3)  # 최대 3개 동시 실행
        results = await asyncio.gather(
            *[self._execute_with_semaphore(tid, semaphore) for tid in batch_task_ids]
        )
```

**조건**: OrchestratorNode가 ready 상태 태스크가 2개 이상일 때 자동 배치

## Docker Sandbox

```python
container = client.containers.run(
    "aos-sandbox:latest",
    command=["bash", "-c", command],
    network_mode="none",   # 네트워크 차단
    mem_limit="512m",      # 메모리 제한
    user="sandbox",        # non-root 사용자
)
```

**빌드**: `./infra/scripts/build-sandbox.sh`

## Database Schema

주요 테이블:
- `sessions`: 세션 정보
- `tasks`: 태스크 트리
- `users`: 사용자 (OAuth + Email)
- `organizations`: 멀티테넌트 조직
- `audit_logs`: 감사 로그
- `feedback`: RLHF 피드백
- `config_versions`: 설정 버전 관리
