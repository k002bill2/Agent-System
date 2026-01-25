# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

이 저장소는 **Agent Orchestration Service (AOS)** - LangGraph 기반 멀티 에이전트 오케스트레이션 서비스입니다. Claude Code 설정과 실제 시스템 소스 코드를 함께 관리하는 하이브리드 모노레포 구조입니다.

## Directory Structure

```
Agent System/
├── .claude/              # Claude Code 설정
│   ├── skills/           # AI 스킬
│   ├── agents/           # 서브 에이전트
│   │   └── shared/       # 공유 프레임워크 (ACE, Quality Gates 등)
│   ├── commands/         # 슬래시 명령어
│   ├── hooks/            # 자동화 훅 스크립트
│   └── hooks.json        # 훅 설정
│
├── projects/             # 연결된 프로젝트
│   └── livemetro/        # → LiveMetro (심볼릭 링크)
│
├── src/                  # 시스템 소스코드
│   ├── backend/          # Python (LangGraph + FastAPI)
│   │   ├── agents/       # 에이전트 정의
│   │   │   ├── specialists/  # 전문 에이전트 (UI, Backend, Test)
│   │   │   └── lead_orchestrator.py
│   │   ├── orchestrator/ # 오케스트레이션 로직
│   │   │   ├── engine.py     # 메인 실행 엔진
│   │   │   ├── graph.py      # LangGraph 그래프 구성
│   │   │   ├── nodes.py      # 6가지 노드 구현
│   │   │   ├── parallel_executor.py  # 병렬 실행
│   │   │   └── tools.py      # MCP 도구 실행자
│   │   ├── services/     # 서비스 레이어
│   │   │   ├── agent_registry.py      # 에이전트 등록소
│   │   │   ├── auth_service.py        # OAuth/JWT 인증
│   │   │   ├── mcp_manager.py         # MCP 서버 관리
│   │   │   ├── feedback_service.py    # RLHF 피드백 서비스
│   │   │   ├── claude_session_monitor.py  # Claude Code 세션 모니터링
│   │   │   ├── session_service.py     # 세션 생명주기 관리
│   │   │   ├── task_service.py        # 태스크 CRUD + 재시도
│   │   │   ├── rag_service.py         # Vector DB + RAG
│   │   │   └── sandbox_manager.py     # Docker 격리 실행
│   │   ├── api/          # FastAPI 라우터
│   │   │   ├── auth.py           # OAuth 인증 API
│   │   │   ├── agents.py         # Agent/MCP API
│   │   │   ├── feedback.py       # RLHF Feedback API
│   │   │   ├── claude_sessions.py  # Claude Sessions API
│   │   │   ├── rag.py            # RAG API
│   │   │   └── routes.py         # 세션/태스크/프로젝트 API
│   │   ├── db/           # 데이터베이스 계층
│   │   │   ├── database.py   # 비동기 SQLAlchemy
│   │   │   ├── models.py     # ORM 모델
│   │   │   └── repository.py # 데이터 접근
│   │   └── models/       # 데이터 모델
│   └── dashboard/        # React 대시보드
│       ├── src/
│       │   ├── pages/
│       │   │   ├── DashboardPage.tsx     # 메인 대시보드
│       │   │   ├── AgentsPage.tsx        # 에이전트 레지스트리
│       │   │   ├── ClaudeSessionsPage.tsx  # Claude Code 세션 모니터링
│       │   │   ├── LoginPage.tsx         # OAuth 로그인
│       │   │   └── AuthCallbackPage.tsx  # OAuth 콜백
│       │   ├── components/
│       │   │   ├── AgentCard.tsx         # 에이전트 카드
│       │   │   ├── AgentStatsPanel.tsx
│       │   │   ├── TaskAnalyzer.tsx      # 태스크 분석 UI
│       │   │   ├── DiffViewer.tsx        # 파일 변경 비교
│       │   │   ├── feedback/             # RLHF 피드백 컴포넌트
│       │   │   │   ├── FeedbackButton.tsx
│       │   │   │   ├── FeedbackModal.tsx
│       │   │   │   ├── FeedbackHistoryPanel.tsx
│       │   │   │   └── DatasetPanel.tsx
│       │   │   ├── claude-sessions/      # Claude Sessions 컴포넌트
│       │   │   │   ├── SessionList.tsx
│       │   │   │   ├── SessionCard.tsx
│       │   │   │   ├── SessionDetails.tsx
│       │   │   │   └── TranscriptViewer.tsx
│       │   │   └── mcp/                  # MCP 관리 컴포넌트
│       │   │       ├── MCPManagerTab.tsx
│       │   │       ├── MCPServerCard.tsx
│       │   │       └── MCPToolCaller.tsx
│       │   ├── stores/                   # Zustand 스토어 (12개)
│       │   │   ├── orchestration.ts      # 세션/태스크 관리
│       │   │   ├── agents.ts             # Agent Registry
│       │   │   ├── feedback.ts           # RLHF Feedback
│       │   │   ├── claudeSessions.ts     # Claude Sessions
│       │   │   ├── mcp.ts                # MCP 서버 관리
│       │   │   ├── auth.ts               # 인증 상태
│       │   │   └── diff.ts               # 파일 변경 비교
│       │   └── hooks/
│       └── package.json
│
├── infra/                # 인프라 설정
│   ├── docker/           # Docker Compose, Dockerfile
│   └── scripts/          # 개발 스크립트
│
├── docs/                 # 문서
│   ├── prd/              # PRD 문서
│   ├── trd/              # TRD 문서
│   └── architecture/     # 아키텍처 다이어그램
│
└── tests/                # 테스트
    ├── backend/
    └── dashboard/
```

## Tech Stack

### Backend

| 기술 | 버전 | 용도 |
|------|------|------|
| LangGraph | 0.2.0+ | 에이전트 오케스트레이션 |
| FastAPI | 0.115+ | REST/WebSocket API |
| SQLAlchemy | 2.0+ | 비동기 ORM |
| PostgreSQL | 15+ | 영구 저장소 |
| Redis | 7+ | 캐시/메시지 큐 |
| ChromaDB | 0.4+ | Vector DB (RAG) |
| PyJWT | 2.8+ | JWT 인증 |

### Frontend

| 기술 | 버전 | 용도 |
|------|------|------|
| React | 18.3.1 | UI 프레임워크 |
| Zustand | 5.0.0 | 상태 관리 |
| Tailwind CSS | 3.4.16 | 스타일링 |
| Vite | 6.0+ | 빌드 도구 |
| TypeScript | 5.6+ | 타입 안정성 |

### LLM Provider

| Provider | 모델 | 설명 |
|----------|------|------|
| Google | gemini-2.0-flash-exp | 기본 프로바이더 |
| Anthropic | claude-sonnet-4-20250514 | Claude API |
| Ollama | qwen2.5:7b | 로컬 실행 |

## Quick Start

### 1. 인프라 실행
```bash
cd infra/scripts
./dev.sh
```

### 2. Backend 실행
```bash
cd src/backend
uv pip install -e .
uvicorn api.app:app --reload
```

### 3. Dashboard 실행
```bash
cd src/dashboard
npm install
npm run dev
```

### Service URLs
- Backend API: http://localhost:8000
- Dashboard: http://localhost:5173
- PostgreSQL: localhost:5432
- Redis: localhost:6379

## Backend Architecture

### LangGraph Nodes
| Node | 역할 |
|------|------|
| `OrchestratorNode` | 상태 분석, 다음 액션 결정, 의존성 기반 태스크 스케줄링 |
| `PlannerNode` | **LLM 기반** 태스크 분해, 서브태스크 생성, **RAG 컨텍스트 조회** |
| `ExecutorNode` | 태스크 실행, **HITL 승인 체크**, **MCP 도구 자동 통합** |
| `ParallelExecutorNode` | **병렬 태스크 실행** (최대 3개 동시), asyncio.gather 사용 |
| `ReviewerNode` | 품질 검증, 결과 집계 |
| `SelfCorrectionNode` | **에러 분석**, 재시도 전략 생성, 최대 3회 자동 재시도 |

### Agent State
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

### API Endpoints

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/sessions` | 세션 생성 |
| GET | `/api/sessions/{id}` | 세션 상태 조회 |
| POST | `/api/sessions/{id}/tasks` | 태스크 제출 |
| WS | `/ws/{session_id}` | 실시간 스트리밍 |
| GET | `/api/sessions/{id}/approvals` | 대기 중인 승인 요청 조회 |
| POST | `/api/sessions/{id}/approve/{approval_id}` | 작업 승인 |
| POST | `/api/sessions/{id}/deny/{approval_id}` | 작업 거부 |

#### RAG (Vector DB) Endpoints

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/rag/projects/{id}/index` | 프로젝트 벡터 인덱싱 |
| POST | `/api/rag/projects/{id}/query` | 의미론적 검색 쿼리 |
| GET | `/api/rag/projects/{id}/stats` | 인덱스 통계 조회 |
| DELETE | `/api/rag/projects/{id}/index` | 프로젝트 인덱스 삭제 |

#### Claude Sessions (외부 세션 모니터링) Endpoints

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/claude-sessions` | 세션 목록 조회 (정렬/필터 지원) |
| GET | `/api/claude-sessions/{id}` | 세션 상세 정보 (recent_messages 포함) |
| GET | `/api/claude-sessions/{id}/stream` | 실시간 SSE 스트리밍 |
| GET | `/api/claude-sessions/{id}/transcript` | Raw 트랜스크립트 (페이지네이션) |
| POST | `/api/claude-sessions/{id}/save` | 세션 DB 저장 (USE_DATABASE=true 필요) |

**쿼리 파라미터** (`GET /api/claude-sessions`):
- `status`: `active` | `idle` | `completed` - 상태 필터
- `sort_by`: `last_activity` | `created_at` | `message_count` | `estimated_cost` | `project_name`
- `sort_order`: `asc` | `desc` (기본: `desc`)
- `limit`: 최대 반환 개수 (기본: 50)

#### RLHF Feedback Endpoints

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/feedback` | 피드백 제출 |
| GET | `/api/feedback` | 피드백 목록 조회 (필터/페이지네이션) |
| GET | `/api/feedback/stats` | 피드백 통계 |
| GET | `/api/feedback/{id}` | 단일 피드백 조회 |
| POST | `/api/feedback/{id}/process` | 피드백 → 데이터셋 변환 |
| POST | `/api/feedback/process-batch` | 일괄 처리 |
| POST | `/api/feedback/process-pending` | 대기 중 자동 처리 |
| GET | `/api/feedback/dataset/stats` | 데이터셋 통계 |
| GET | `/api/feedback/dataset/export` | 데이터셋 내보내기 (JSONL/CSV) |

### 핵심 기능

#### 1. LLM 기반 태스크 분해

복잡한 요청을 LLM이 자동으로 서브태스크로 분해합니다.

```python
# models/task_plan.py
class TaskPlanResult(BaseModel):
    analysis: str           # 태스크 분석
    is_complex: bool        # 복잡성 여부
    subtasks: list[SubtaskPlan]  # 서브태스크 목록
```

#### 2. HITL (Human-in-the-Loop) 승인 시스템

위험한 작업(bash 실행, 파일 삭제 등) 전 사용자 승인을 요청합니다.

```python
# models/hitl.py
TOOL_RISK_CONFIG = {
    "execute_bash": {"risk_level": "HIGH", "requires_approval": True},
    "write_file": {"risk_level": "MEDIUM", "requires_approval": False},
}
```

#### 3. Token/Cost 모니터링

에이전트별 토큰 사용량과 비용을 실시간 추적합니다.

```python
# models/cost.py
COST_PER_1K_TOKENS = {
    "claude-sonnet-4-20250514": {"input": 0.003, "output": 0.015},
}
```

#### 4. Self-Correction (자기 수정)

태스크 실패 시 에러를 분석하고 최대 3회 자동 재시도합니다.

```python
# orchestrator/nodes.py
class SelfCorrectionNode(BaseNode):
    # 에러 분석 → 수정 전략 생성 → 태스크 재설정
```

#### 5. 데이터베이스 지속성 (선택)

PostgreSQL을 사용한 세션/태스크 영구 저장을 지원합니다.

```bash
# 활성화
USE_DATABASE=true
```

#### 6. Vector DB + RAG (의미론적 검색)

프로젝트 코드를 ChromaDB에 인덱싱하여 의미론적 검색을 지원합니다.

```python
# services/rag_service.py
class ProjectVectorStore:
    async def index_project(self, project_id: str, project_path: str) -> IndexingResult
    async def query(self, project_id: str, query: str, k: int = 5) -> QueryResult
```

**특징**:
- CLAUDE.md 2000자 제한 대신 전체 프로젝트 컨텍스트 검색
- 쿼리 응답 시간 < 200ms
- 자동 파일 우선순위 (CLAUDE.md > README > 코드)

#### 7. Diff 뷰어 (파일 변경 시각화)

파일 변경사항을 Split/Unified 뷰로 실시간 확인합니다.

```typescript
// stores/diff.ts
interface DiffEntry {
  taskId: string
  filePath: string
  oldContent: string
  newContent: string
  status: 'pending' | 'applied' | 'rejected'
}
```

**컴포넌트**: `DiffViewer.tsx` - react-diff-view 기반 Split/Unified 토글 지원

#### 8. 병렬 태스크 실행

독립적인 태스크들을 asyncio.gather()로 동시 실행합니다 (최대 3개).

```python
# orchestrator/parallel_executor.py
class ParallelExecutorNode(BaseNode):
    async def run(self, state: AgentState) -> dict:
        semaphore = asyncio.Semaphore(3)
        results = await asyncio.gather(
            *[self._execute_with_semaphore(tid, semaphore) for tid in batch_task_ids]
        )
```

**조건**: OrchestratorNode가 ready 상태 태스크가 2개 이상일 때 자동 배치

#### 9. Docker 샌드박스 (격리 실행)

위험한 bash 명령을 격리된 Docker 컨테이너에서 실행합니다.

```python
# services/sandbox_manager.py
container = client.containers.run(
    "aos-sandbox:latest",
    command=["bash", "-c", command],
    network_mode="none",   # 네트워크 차단
    mem_limit="512m",      # 메모리 제한
    user="sandbox",        # non-root 사용자
)
```

**빌드**: `./infra/scripts/build-sandbox.sh`

#### 10. Claude Sessions 모니터링

외부에서 실행 중인 Claude Code 세션을 실시간 모니터링합니다.

```python
# services/claude_session_monitor.py
class ClaudeSessionMonitor:
    def discover_sessions(self) -> list[ClaudeSessionInfo]
    def get_session_details(self, session_id: str) -> ClaudeSessionDetail
    async def watch_session(self, session_id: str) -> AsyncIterator[ClaudeSessionDetail]
```

**주요 기능**:
- `~/.claude/projects/` 디렉토리 스캔으로 세션 자동 발견
- 파일 캐싱 (mtime + size 기반 무효화)
- 실시간 SSE 스트리밍
- Tool Use 입력값 추적 (`tool_input`)

**Dashboard 컴포넌트**:

| 컴포넌트 | 설명 |
|----------|------|
| `SessionList` | 세션 목록 (정렬, 자동 새로고침) |
| `SessionCard` | 세션 카드 (상태, 토큰, 비용) |
| `SessionDetails` | 상세 정보 + Recent Activity |
| `TranscriptViewer` | Raw 트랜스크립트 (JSON Tree 뷰) |

**정렬 옵션**:
- 마지막 활동 (기본, DESC)
- 생성일
- 메시지 수
- 비용
- 프로젝트명

**Store** (`stores/claudeSessions.ts`):
```typescript
interface ClaudeSessionsState {
  sessions: ClaudeSessionInfo[]
  sortBy: SortField
  sortOrder: 'asc' | 'desc'
  // actions
  fetchSessions: (status?: SessionStatus) => Promise<void>
  setSortBy: (field: SortField) => void
  setSortOrder: (order: SortOrder) => void
}
```

#### 11. Agent Registry (에이전트 등록소)

에이전트 등록, 검색, 상태 관리를 담당하는 중앙 시스템입니다.

```python
# services/agent_registry.py
class AgentRegistry:
    def register(self, agent: AgentMetadata) -> bool
    def get_by_category(self, category: AgentCategory) -> list[AgentMetadata]
    def find_by_capability(self, query: str) -> list[tuple[AgentMetadata, int]]
    def select_best_agent(self, task: str) -> AgentMetadata | None
```

**기본 등록 에이전트** (7종):
| Agent ID | 카테고리 | 설명 |
|----------|----------|------|
| `web-ui-specialist` | development | React Web UI/UX (Tailwind CSS) |
| `backend-integration-specialist` | development | Firebase, API 통합 |
| `test-automation-specialist` | quality | Jest 테스트 자동화 |
| `lead-orchestrator` | orchestration | 멀티 에이전트 조정 |
| `quality-validator` | quality | 코드 품질 검증 |
| `code-simplifier` | quality | 복잡도 분석 |
| `performance-optimizer` | development | 성능 최적화 |

#### 12. Lead Orchestrator (리드 오케스트레이터)

복잡한 태스크를 분석하고 전문 에이전트에게 위임하는 상위 조정자입니다.

```python
# agents/lead_orchestrator.py
class LeadOrchestratorAgent(BaseAgent):
    async def execute(self, task: str, context: dict) -> AgentResult:
        # 1. 태스크 복잡도 분석
        # 2. 서브태스크 분해
        # 3. 에이전트 선택 및 할당
        # 4. 실행 전략 결정 (sequential/parallel/mixed)
```

**분석 결과**:
```python
class TaskAnalysis(BaseModel):
    complexity_score: int         # 1-10
    effort_level: EffortLevel     # quick/medium/thorough
    requires_decomposition: bool
    subtasks: list[SubtaskPlan]
    execution_strategy: ExecutionStrategy
```

**노력 스케일링** (`EffortLevel`):
- `quick`: 단순 태스크 (복잡도 1-3)
- `medium`: 중간 복잡도 (4-6)
- `thorough`: 복잡한 태스크 (7-10)

#### 13. MCP Manager (Model Context Protocol)

외부 도구 연동을 위한 MCP 서버 관리자입니다.

```python
# services/mcp_manager.py
class MCPManager:
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

**도구 호출 예시**:
```python
call = MCPToolCall(
    server_id="github",
    tool_name="list_issues",
    arguments={"repo": "owner/repo", "state": "open"}
)
result = await mcp_manager.call_tool(call)
```

#### Agent API Endpoints

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/agents` | 에이전트 목록 조회 |
| GET | `/api/agents/stats` | 레지스트리 통계 |
| POST | `/api/agents/search` | 능력 기반 검색 |
| POST | `/api/agents/orchestrate/analyze` | 태스크 분석 |
| GET | `/api/agents/mcp/servers` | MCP 서버 목록 |
| POST | `/api/agents/mcp/servers/{id}/start` | MCP 서버 시작 |
| POST | `/api/agents/mcp/tools/call` | MCP 도구 호출 |

**Dashboard 컴포넌트** (Agents 페이지):
| 컴포넌트 | 설명 |
|----------|------|
| `AgentCard` | 에이전트 카드 (능력, 상태, 통계) |
| `AgentStatsPanel` | 레지스트리 통계 패널 |
| `TaskAnalyzer` | 태스크 분석 UI |

#### RLHF Feedback API Endpoints

에이전트 실행 결과에 대한 사용자 피드백을 수집하고 Fine-tuning용 데이터셋으로 변환합니다.

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/feedback` | 피드백 제출 |
| GET | `/api/feedback` | 피드백 목록 조회 (필터/페이지네이션) |
| GET | `/api/feedback/stats` | 피드백 통계 |
| GET | `/api/feedback/{id}` | 단일 피드백 조회 |
| POST | `/api/feedback/{id}/process` | 단일 피드백 처리 (데이터셋 변환) |
| POST | `/api/feedback/process-batch` | 피드백 일괄 처리 |
| POST | `/api/feedback/process-pending` | 대기 중인 피드백 일괄 처리 |
| GET | `/api/feedback/dataset/stats` | 데이터셋 통계 |
| GET | `/api/feedback/dataset/export` | 데이터셋 내보내기 (JSONL/CSV) |

**피드백 유형** (`FeedbackType`):
- `implicit`: 사용자가 에이전트 결과를 수정
- `explicit_positive`: 결과에 만족 (👍)
- `explicit_negative`: 결과에 불만족 (👎)

**부정 피드백 사유** (`FeedbackReason`):
- `incorrect`: 결과가 틀림
- `incomplete`: 불완전한 결과
- `off_topic`: 주제에서 벗어남
- `style`: 스타일/형식 문제
- `performance`: 성능 문제
- `other`: 기타

**데이터셋 출력 형식** (JSONL):
```jsonl
{"messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}], "metadata": {"feedback_type": "implicit", "agent_id": "web-ui-specialist"}}
```

**Dashboard 컴포넌트** (Feedback 탭):
| 컴포넌트 | 설명 |
|----------|------|
| `FeedbackButton` | 👍/👎 피드백 버튼 |
| `FeedbackModal` | 부정 피드백 사유 선택 모달 |
| `FeedbackHistoryPanel` | 피드백 히스토리 목록 |
| `DatasetPanel` | 데이터셋 통계 및 내보내기 |

#### 14. OAuth 인증 시스템

Google/GitHub OAuth를 통한 사용자 인증과 JWT 기반 세션 관리를 지원합니다.

```python
# services/auth_service.py
class AuthService:
    async def create_oauth_url(self, provider: str) -> str
    async def handle_callback(self, provider: str, code: str) -> TokenResponse
    async def refresh_token(self, refresh_token: str) -> TokenResponse
    async def get_current_user(self, token: str) -> UserInfo
```

**지원 프로바이더**:
- Google OAuth 2.0
- GitHub OAuth

**토큰 설정**:
- Access Token: 15분 유효
- Refresh Token: 7일 유효
- 쿠키 기반 세션 저장소

**API Endpoints**:
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/auth/google` | Google OAuth 리다이렉트 URL |
| POST | `/api/auth/google/callback` | Google OAuth 콜백 처리 |
| GET | `/api/auth/github` | GitHub OAuth 리다이렉트 URL |
| POST | `/api/auth/github/callback` | GitHub OAuth 콜백 처리 |
| POST | `/api/auth/refresh` | Access Token 갱신 |
| GET | `/api/auth/me` | 현재 사용자 정보 |
| POST | `/api/auth/logout` | 로그아웃 (쿠키 삭제) |

**Dashboard 페이지**:
| 페이지 | 설명 |
|--------|------|
| `LoginPage` | OAuth 로그인 UI |
| `AuthCallbackPage` | OAuth 콜백 처리 |

#### 15. Task Lifecycle 관리

태스크 재시도, 취소, 소프트 삭제 기능을 지원합니다.

```python
# services/task_service.py
class TaskService:
    async def retry_task(self, session_id: str, task_id: str) -> TaskNode
    async def cancel_task(self, session_id: str, task_id: str) -> TaskNode
    async def soft_delete_task(self, session_id: str, task_id: str) -> bool
```

**Task Retry**:
- 상태: `failed`/`cancelled` → `pending`
- `retry_count` 자동 증가
- 에러 메시지 초기화

**API Endpoints**:
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/sessions/{id}/tasks/{tid}/retry` | 태스크 재시도 |
| POST | `/api/sessions/{id}/tasks/{tid}/cancel` | 태스크 취소 |
| DELETE | `/api/sessions/{id}/tasks/{tid}` | 태스크 소프트 삭제 |
| GET | `/api/sessions/{id}/tasks/{tid}/deletion-info` | 삭제 영향도 조회 |

**Session Lifecycle**:
- 세션 TTL 자동 갱신 (마지막 활동 기준)
- 유휴 세션 정리 작업

## Dev Docs 시스템

대규모 작업의 컨텍스트를 유지하기 위한 3-파일 시스템입니다.

### 디렉토리 구조

```
dev/
└── active/
    └── [task-name]/
        ├── [task-name]-plan.md     # 승인된 계획
        ├── [task-name]-context.md  # 핵심 결정사항
        └── [task-name]-tasks.md    # 체크리스트
```

### 워크플로우

1. **계획 승인 후**: `/dev-docs` 실행하여 3개 문서 생성
2. **구현 중**: 주기적으로 tasks.md 업데이트
3. **Context 20% 이하**: `/update-dev-docs` 실행 후 `/compact`
4. **세션 재개**: `/resume` 또는 dev/active/ 파일 읽기

### 관련 명령어

| 명령어 | 설명 |
|--------|------|
| `/dev-docs` | Dev Docs 3-파일 생성 |
| `/update-dev-docs` | Context Compaction 전 업데이트 |
| `/save-and-compact` | 저장 후 /compact 실행 |
| `/resume` | 이전 세션 컨텍스트 복원 |

### 효과

- 계획 준수율: 40% → 95%
- Context 후 작업 재개 성공률: 20% → 90%
- Claude의 "건망증" 문제 해결

## Claude Code Commands

### 검증 및 품질

```bash
/check-health     # 타입체크, 린트, 테스트, 빌드 종합 검증
/verify-app       # Boris Cherny 스타일 검증 피드백 루프
/test-coverage    # 테스트 커버리지 분석
/simplify-code    # 코드 복잡도 분석 및 단순화
/review           # 변경된 파일 코드 리뷰
```

### Git 워크플로우

```bash
/commit-push-pr   # 커밋 → 푸시 → PR 자동화
```

### 세션 관리

```bash
/save-and-compact   # 컨텍스트 저장 후 /compact 실행
/resume             # 이전 세션 컨텍스트 복원
```

## Sub-agents

### 개발 전문가

| Agent | Model | 전문 영역 |
|-------|-------|-----------|
| `web-ui-specialist` | Sonnet | React Web UI/UX (Tailwind CSS) |
| `backend-integration-specialist` | Sonnet | Firebase, API 통합 |
| `performance-optimizer` | Sonnet | 성능 최적화 |
| `test-automation-specialist` | Sonnet | 테스트 자동화 |

### 오케스트레이션

| Agent | Model | 전문 영역 |
|-------|-------|-----------|
| `lead-orchestrator` | Sonnet | 멀티 에이전트 워크플로우 |
| `code-simplifier` | Sonnet | 코드 복잡도 분석 |
| `quality-validator` | Sonnet | 품질 검증 |

### Shared Frameworks
- `ace-framework.md`: 병렬 실행 프로토콜
- `quality-gates.md`: 공유 품질 게이트
- `effort-scaling.md`: 태스크 복잡도별 리소스 할당

## Code Patterns

### Backend (Python)

```python
# Agent 정의
class MyAgent(BaseAgent):
    async def execute(self, task: str, context: dict) -> AgentResult:
        result = await self._invoke_llm(task, context)
        return AgentResult(success=True, output=result)
```

### Frontend (React/TypeScript)

```tsx
// Zustand 스토어 패턴
export const useStore = create<State>((set, get) => ({
  // state
  data: null,
  // actions
  fetchData: async () => { ... },
}))
```

### 경로 별칭
- Backend: 상대 경로 (`from ..models import ...`)
- Dashboard: `@/` 절대 경로 (`import { cn } from '@/lib/utils'`)

## Environment Variables

```bash
# LLM Provider (google, anthropic, ollama 중 선택)
LLM_PROVIDER=google  # 기본값: google

# Google (Gemini)
GOOGLE_API_KEY=your_google_api_key
GOOGLE_MODEL=gemini-2.0-flash-exp

# Anthropic (Claude)
ANTHROPIC_API_KEY=your_anthropic_api_key
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# Ollama (로컬)
OLLAMA_MODEL=qwen2.5:7b
OLLAMA_BASE_URL=http://localhost:11434

# Database (PostgreSQL 영구 저장소)
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/agent_orchestrator
USE_DATABASE=false  # true로 설정하면 DB 영구 저장 활성화

# Redis
REDIS_URL=redis://localhost:6379/0

# OAuth 인증
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# JWT 설정
SESSION_SECRET_KEY=your_secret_key_for_jwt
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# Frontend URL (OAuth 콜백용)
FRONTEND_URL=http://localhost:5173
```

## Testing

### Backend

```bash
cd src/backend
pytest ../../tests/backend
```

### Dashboard

```bash
cd src/dashboard
npm test
```

## Docker

```bash
# 인프라만 실행 (PostgreSQL, Redis)
cd infra/docker
docker-compose up -d postgres redis

# 전체 실행 (Backend, Dashboard 포함)
docker-compose --profile full up -d
```

### 샌드박스 빌드

격리된 코드 실행을 위한 샌드박스 Docker 이미지를 빌드합니다.

```bash
# 샌드박스 이미지 빌드
./infra/scripts/build-sandbox.sh

# 빌드 검증
docker run --rm aos-sandbox:latest whoami     # → sandbox
docker run --rm aos-sandbox:latest pwd        # → /workspace
docker run --rm aos-sandbox:latest python --version  # → Python 3.11.x
```

**보안 특성**:
- `network_mode: none` - 네트워크 격리
- `mem_limit: 512m` - 메모리 제한
- `user: sandbox` - non-root 실행
- `security_opt: no-new-privileges` - 권한 상승 차단

---

## Dashboard (React Web)

**위치**: `src/dashboard/`

**설명**: AOS 대시보드 - React + Vite + Tailwind CSS 기반 웹 애플리케이션

### Tech Stack

| 기술 | 버전 | 용도 |
|------|------|------|
| React | 18.3.1 | UI 프레임워크 |
| Vite | 6.0+ | 빌드 도구 |
| TypeScript | 5.6+ (strict) | 타입 안정성 |
| Tailwind CSS | 3.4.16 | 스타일링 |
| Zustand | 5.0.0 | 상태 관리 |

### Quick Start

```bash
cd src/dashboard
npm install
npm run dev
```

### 주요 명령어

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | 개발 서버 (http://localhost:5173) |
| `npm test` | Vitest 테스트 |
| `npm run lint` | ESLint |
| `npm run type-check` | TypeScript 검사 |
| `npm run build` | 프로덕션 빌드 |

### 경로 별칭

```typescript
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { useOrchestration } from '@/stores/orchestration'
```

### 스타일링 패턴

```tsx
// cn() 유틸리티로 조건부 클래스 결합
import { cn } from '@/lib/utils';

<div className={cn(
  'p-4 rounded-lg',
  isActive && 'bg-blue-100',
  className
)}>
  {children}
</div>
```
