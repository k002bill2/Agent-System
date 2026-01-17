# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

이 저장소는 **Agent Orchestration System (AGS)** - LangGraph 기반 멀티 에이전트 오케스트레이션 시스템입니다. Claude Code 설정과 실제 시스템 소스 코드를 함께 관리하는 하이브리드 모노레포 구조입니다.

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
│   │   ├── orchestrator/ # 오케스트레이션 로직
│   │   ├── api/          # FastAPI 라우터
│   │   └── models/       # 데이터 모델
│   └── dashboard/        # React 대시보드
│       ├── src/
│       │   ├── components/
│       │   ├── stores/
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

| 레이어 | 기술 | 설명 |
|--------|------|------|
| Backend | LangGraph + FastAPI | 에이전트 오케스트레이션 엔진 |
| Frontend | React + Tailwind + Zustand | 대시보드 UI |
| Database | PostgreSQL | 태스크 이력 |
| Cache | Redis | 메시지 큐 |

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
| `ExecutorNode` | 태스크 실행, **HITL 승인 체크**, 도구 호출 |
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
    "ags-sandbox:latest",
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
| `mobile-ui-specialist` | Sonnet | React Native UI/UX |
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
# Required
ANTHROPIC_API_KEY=your_api_key

# LLM Provider (ollama 또는 anthropic)
LLM_PROVIDER=anthropic
OLLAMA_MODEL=qwen2.5:7b
OLLAMA_BASE_URL=http://localhost:11434

# Database (PostgreSQL 영구 저장소)
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/agent_orchestrator
USE_DATABASE=false  # true로 설정하면 DB 영구 저장 활성화

# Redis
REDIS_URL=redis://localhost:6379/0
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
docker run --rm ags-sandbox:latest whoami     # → sandbox
docker run --rm ags-sandbox:latest pwd        # → /workspace
docker run --rm ags-sandbox:latest python --version  # → Python 3.11.x
```

**보안 특성**:
- `network_mode: none` - 네트워크 격리
- `mem_limit: 512m` - 메모리 제한
- `user: sandbox` - non-root 실행
- `security_opt: no-new-privileges` - 권한 상승 차단

---

## LiveMetro (연결된 프로젝트)

**위치**: `projects/livemetro/` (심볼릭 링크 → `/Users/younghwankang/Work/LiveMetro`)

**설명**: 서울 지하철 실시간 도착 정보 React Native Expo 앱

### Tech Stack

| 기술 | 버전 |
|------|------|
| React Native | 0.72 |
| Expo SDK | ~49 |
| TypeScript | 5.1+ (strict) |
| Firebase | Auth, Firestore |
| Navigation | React Navigation 6.x |

### Quick Start

```bash
cd projects/livemetro
npm install
npm start
```

### 주요 명령어

| 명령어 | 설명 |
|--------|------|
| `npm start` | Expo 개발 서버 |
| `npm test` | Jest 테스트 |
| `npm run lint` | ESLint |
| `npm run type-check` | TypeScript 검사 |
| `npm run build:production` | 프로덕션 빌드 |

### 경로 별칭

```typescript
import { Button } from '@components/Button'
import { useAuth } from '@hooks/useAuth'
import { MetroService } from '@services/MetroService'
```

> 자세한 내용은 `projects/livemetro/CLAUDE.md` 참조
