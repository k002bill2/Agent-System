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
├── services/                    # 63개 서비스 모듈
│   ├── agent_manager.py           # 에이전트 인스턴스 관리
│   ├── agent_registry.py          # 에이전트 등록소
│   ├── alerting_service.py        # 알림/경고 서비스
│   ├── analytics_service.py       # 분석 서비스 (세션 파일 + DB 이중 지원)
│   ├── artifact_service.py        # 워크플로우 아티팩트 관리
│   ├── audit_integrity.py         # 감사 로그 무결성 검증
│   ├── audit_service.py           # 감사 로그 서비스
│   ├── auth_service.py            # OAuth/JWT/Email 인증
│   ├── claude_config_service.py   # Claude OAuth 토큰 관리 (Keychain/env/파일)
│   ├── claude_session_monitor.py  # Claude 세션 파일 스캔/파싱
│   ├── code_entity_extractor.py   # RAG 메타데이터용 코드 엔티티 추출 (AST/Regex)
│   ├── cost_allocation_service.py # 비용 추적/할당 서비스
│   ├── credential_service.py      # 자격증명 암호화/저장
│   ├── encryption_service.py      # AES-256-GCM 암호화 서비스
│   ├── external_usage_service.py  # 외부 LLM 사용량 추적
│   ├── feedback_service.py        # RLHF 피드백
│   ├── frontmatter_parser.py      # YAML Frontmatter 파싱 (SKILL.md, agent .md)
│   ├── git_service.py             # Git 작업 관리 서비스
│   ├── github_service.py          # GitHub API 통합
│   ├── health_service.py          # 시스템 헬스체크 서비스
│   ├── key_management.py          # HKDF 기반 암호화 키 관리
│   ├── llm_router_service.py      # LLM 라우팅/Failover
│   ├── llm_service.py             # LLM 프로바이더 팩토리
│   ├── logging_service.py         # 구조화된 로깅
│   ├── mcp_config_manager.py      # MCP 설정 파일 관리
│   ├── mcp_manager.py             # MCP 서버 생명주기 관리
│   ├── mcp_service.py             # MCP 서버 관리
│   ├── merge_service.py           # Git 머지/충돌 해결
│   ├── notification_service.py    # 알림 서비스 (Slack, Discord, Email, Webhook)
│   ├── organization_service.py    # 조직/멀티테넌트 서비스
│   ├── playground_service.py      # 에이전트 플레이그라운드
│   ├── playground_tools.py        # 플레이그라운드 도구 정의
│   ├── project_access_service.py  # RBAC 접근제어 서비스
│   ├── project_cleanup_service.py # 프로젝트 삭제/정리
│   ├── project_config_monitor.py  # 프로젝트 설정 파일 모니터링
│   ├── project_discovery.py       # 프로젝트 자동 발견
│   ├── project_invitation_service.py # 프로젝트 멤버 초대 (이메일, 7일 만료)
│   ├── project_runner.py          # 프로젝트 체크 실행 (test/lint/build/typecheck)
│   ├── project_template_service.py # 프로젝트 템플릿 관리
│   ├── quota_service.py           # 사용량 쿼터 서비스
│   ├── rag_service.py             # Vector DB + RAG
│   ├── rate_limit_service.py      # API 속도 제한 서비스
│   ├── sandbox_manager.py         # Docker 격리 실행
│   ├── scheduler_service.py       # APScheduler 기반 Cron 스케줄링
│   ├── secret_service.py          # Fernet 암호화 시크릿 관리
│   ├── session_service.py         # 세션 생명주기 관리
│   ├── skill_manager.py           # SKILL.md 파일 CRUD 관리
│   ├── task_analysis_service.py   # 태스크 복잡도 분석
│   ├── task_service.py            # 태스크 CRUD/상태 관리
│   ├── template_service.py        # 워크플로우 템플릿 관리
│   ├── tmux_service.py            # Tmux 세션 관리
│   ├── variable_expander.py       # ${{ }} 변수 치환 (steps/env/matrix/secrets)
│   ├── version_service.py         # 설정 버전 관리/롤백
│   ├── warp_service.py            # Warp 터미널 + MCP 에이전트
│   ├── webhook_service.py         # Webhook 딜리버리 (HMAC-SHA256)
│   ├── workflow_engine.py         # 워크플로우 DAG 실행 엔진
│   ├── workflow_service.py        # 워크플로우 CRUD 서비스
│   └── workflow_yaml_parser.py    # 워크플로우 YAML 파싱
├── api/                     # FastAPI 라우터 (55개 모듈)
├── auth/                    # 인증 프로바이더
│   └── providers/
│       ├── base.py          # AuthProvider ABC, UserInfo
│       ├── google.py        # Google OAuth
│       ├── github.py        # GitHub OAuth
│       ├── oidc.py          # OpenID Connect (httpx 기반)
│       └── saml.py          # SAML 2.0 (stdlib XML 기반)
├── db/                      # SQLAlchemy ORM
│   └── models/
│       ├── session.py       # SessionModel, TaskModel, MessageModel, ApprovalModel
│       ├── auth.py          # UserModel, RefreshTokenModel
│       ├── claude_session.py # ClaudeSessionSnapshotModel (세션 스냅샷)
│       ├── feedback.py      # FeedbackModel, TaskEvaluationModel
│       ├── organization.py  # OrganizationModel, OrganizationMemberModel
│       ├── notification.py  # NotificationRuleModel (project_ids JSONB)
│       ├── workflow.py      # WorkflowModel, WorkflowRunModel
│       ├── git.py           # MergeRequestModel, BranchProtectionRuleModel
│       ├── cost.py          # CostAllocationModel
│       ├── llm.py           # LLMModelConfigModel
│       ├── project.py       # ProjectModel
│       ├── activity.py      # SessionActivityModel
│       └── base.py          # Base, TimestampMixin
├── models/                  # Pydantic 데이터 모델 (32개)
├── middleware/
│   └── rate_limit.py        # RateLimitMiddleware (per-user/IP, tier-based)
├── utils/
│   └── time.py              # utcnow() - timezone-aware UTC (datetime.utcnow() 대체)
└── tools/                   # MCP 도구 구현
    ├── bash_tools.py
    ├── code_tools.py
    ├── file_tools.py
    └── warp_tools.py
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
| `backend-integration-specialist` | development | FastAPI, SQLAlchemy, LangGraph 통합 |
| `test-automation-specialist` | quality | Vitest 테스트 자동화 |
| `aos-orchestrator` | orchestration | 멀티 에이전트 조정 |
| `quality-validator` | quality | 코드 품질 검증 |
| `code-simplifier` | quality | 복잡도 분석 |
| `performance-optimizer` | development | 성능 최적화 |

## AOS Orchestrator

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

## Database

### 데이터베이스 스택

| DB | 용도 | 설명 |
|----|------|------|
| **PostgreSQL** | 메인 DB | 관계형 데이터 (사용자, 세션, 태스크 등) |
| **Redis** | 캐시/세션 | 실시간 상태, 세션 스토어 |
| **Qdrant** | 벡터 DB | RAG용 임베딩 검색 |

> ⚠️ **Firebase가 아닙니다!** PostgreSQL은 오픈소스 DB로 가입이 필요 없습니다.

### 실행 방법

```bash
# Docker로 로컬 실행 (PostgreSQL, Redis, Qdrant 모두 포함)
cd infra/scripts && ./dev.sh
```

### 환경 변수

```bash
# PostgreSQL 연결
DATABASE_URL=postgresql+asyncpg://aos:aos@localhost:5432/aos

# DB 사용 여부 (false면 DB 없이 개발 가능)
USE_DATABASE=false
```

### 프로덕션 배포 옵션

로컬 Docker 외에 관리형 PostgreSQL 사용 가능:
- **Railway** - 간편한 배포
- **Supabase** - PostgreSQL + 인증 통합
- **AWS RDS** - 엔터프라이즈급
- **Neon** - 서버리스 PostgreSQL

### Schema (주요 테이블 - 34개)

| 테이블 | 용도 |
|--------|------|
| `sessions` | 세션 정보 |
| `tasks` | 태스크 트리 |
| `messages` | 대화 메시지 |
| `approvals` | HITL 승인 요청 |
| `users` | 사용자 (OAuth + Email) |
| `organizations` | 멀티테넌트 조직 |
| `organization_members` | 조직 멤버 |
| `projects` | DB 기반 프로젝트 레지스트리 |
| `audit_logs` | 감사 로그 |
| `feedback` | RLHF 피드백 |
| `config_versions` | 설정 버전 관리 |
| `notification_rules` | 알림 규칙 |
| `secrets` | 암호화된 시크릿 |
| `rate_limits` | API 속도 제한 |
| `claude_session_snapshots` | Claude 세션 스냅샷 (모델, 토큰, 비용, 프로젝트별) |
| `workflow_definitions` | 워크플로우 정의 |
| `workflow_runs` | 워크플로우 실행 이력 |
| `workflow_jobs` | 워크플로우 잡 |
| `workflow_steps` | 워크플로우 스텝 |
| `workflow_secrets` | 워크플로우 시크릿 |
| `workflow_webhooks` | 워크플로우 웹훅 |
| `workflow_artifacts` | 워크플로우 아티팩트 |
| `workflow_templates` | 워크플로우 템플릿 |
| `merge_requests` | 머지 요청 |
| `branch_protection_rules` | 브랜치 보호 규칙 |
| `cost_centers` | 비용 센터 |
| `cost_allocations` | 비용 할당 |
| `llm_model_configs` | LLM 모델 설정 |
| `user_llm_credentials` | 사용자 LLM 자격증명 |
| `project_access` | 프로젝트 접근 제어 |
| `project_invitations` | 프로젝트 초대 |
| `menu_visibility` | UI 메뉴 가시성 |
| `task_evaluations` | 태스크 평가 |
| `session_activities` | 세션 활동 |
| `task_analyses` | 태스크 분석 |

### Database Migration (Alembic)

스키마 변경 관리를 위한 Alembic 설정:

```
src/backend/
├── alembic.ini              # 마이그레이션 설정
└── alembic/
    ├── env.py               # 환경 설정 (SQLAlchemy 연동)
    ├── script.py.mako       # 마이그레이션 템플릿
    └── versions/            # 마이그레이션 스크립트
```

**주요 명령어**:

```bash
# 새 마이그레이션 생성 (모델 변경 감지)
alembic revision --autogenerate -m "Add new table"

# 최신 버전으로 업그레이드
alembic upgrade head

# 한 단계 롤백
alembic downgrade -1

# 현재 버전 확인
alembic current

# 마이그레이션 히스토리
alembic history
```

## Analytics Data Flow

Analytics 대시보드는 Claude 세션 파일에서 직접 데이터를 수집합니다:

```
~/.claude/projects/          Claude 세션 JSONL 파일
         ↓
ClaudeSessionMonitor         세션 파일 스캔/파싱 (mtime+size 캐싱)
         ↓
AnalyticsService             *_from_sessions() 메서드
  ├── get_overview_from_sessions()     # 전체 메트릭
  ├── get_trends_from_sessions()       # 시간별 트렌드 (created_at 기준 버킷)
  ├── get_agent_performance_from_sessions()  # 모델별 성능
  ├── get_cost_analytics_from_sessions()     # 프로젝트별/모델별 비용
  └── get_activity_heatmap_from_sessions()   # 요일/시간 히트맵
         ↓
api/analytics.py             REST API (항상 세션 기반, DB 무관)
         ↓
Dashboard AnalyticsPage      Recharts 차트 시각화
```

> **Note**: `USE_DATABASE=true`여도 analytics 엔드포인트는 세션 파일 기반 메서드를 사용합니다.
> DB 기반 `*_async()` 메서드는 향후 DB에 세션 데이터가 동기화될 때를 위해 유지됩니다.
