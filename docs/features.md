# Features

AOS 핵심 기능 상세 문서입니다.

---

## 1. LLM 기반 태스크 분해

복잡한 요청을 LLM이 자동으로 서브태스크로 분해합니다.

```python
class TaskPlanResult(BaseModel):
    analysis: str           # 태스크 분석
    is_complex: bool        # 복잡성 여부
    subtasks: list[SubtaskPlan]  # 서브태스크 목록
```

---

## 2. HITL (Human-in-the-Loop) 승인 시스템

위험한 작업(bash 실행, 파일 삭제 등) 전 사용자 승인을 요청합니다.

```python
TOOL_RISK_CONFIG = {
    "execute_bash": {"risk_level": "HIGH", "requires_approval": True},
    "write_file": {"risk_level": "MEDIUM", "requires_approval": False},
}
```

---

## 3. Token/Cost 모니터링

에이전트별 토큰 사용량과 비용을 실시간 추적합니다.

```python
COST_PER_1K_TOKENS = {
    # Claude 4 series
    "claude-opus-4-5-20250514": {"input": 0.015, "output": 0.075},
    "claude-sonnet-4-20250514": {"input": 0.003, "output": 0.015},
    "claude-3-5-sonnet-20241022": {"input": 0.003, "output": 0.015},
    "claude-3-5-haiku-20241022": {"input": 0.0008, "output": 0.004},
    # Gemini 2.0 series
    "gemini-2.0-flash": {"input": 0.00025, "output": 0.001},
    "gemini-1.5-pro": {"input": 0.00125, "output": 0.005},
    # OpenAI GPT-4o / o1 series
    "gpt-4o": {"input": 0.0025, "output": 0.01},
    "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
    "o1": {"input": 0.015, "output": 0.06},
    "o1-mini": {"input": 0.003, "output": 0.012},
}
```

**Provider별 Context 한도**:
- Claude 4/3.5: 200K tokens
- Gemini 2.0: 1M tokens (1.5-pro: 2M)
- GPT-4o: 128K tokens
- o1: 200K tokens

---

## 4. Self-Correction (자기 수정)

태스크 실패 시 에러를 분석하고 최대 3회 자동 재시도합니다.

```python
class SelfCorrectionNode(BaseNode):
    # 에러 분석 → 수정 전략 생성 → 태스크 재설정
```

---

## 5. 데이터베이스 지속성

PostgreSQL을 사용한 세션/태스크 영구 저장 (선택적):

```bash
USE_DATABASE=true
```

---

## 6. Vector DB + RAG

프로젝트 코드를 ChromaDB에 인덱싱하여 의미론적 검색:

```python
class ProjectVectorStore:
    async def index_project(self, project_id: str, project_path: str) -> IndexingResult
    async def query(self, project_id: str, query: str, k: int = 5) -> QueryResult
```

**특징**:
- 전체 프로젝트 컨텍스트 검색
- 쿼리 응답 시간 < 200ms
- 자동 파일 우선순위 (CLAUDE.md > README > 코드)

**Dashboard UI**:
- `RAGQueryPanel`: Projects 페이지에서 RAG 검색 버튼 클릭 시 사이드패널 표시
- 자연어로 코드베이스 검색 (예: "인증 로직", "에러 처리 패턴")
- 결과 수 조절 (3~20개), 우선순위 필터링 (High/Normal)
- 인덱스 상태 확인, 재인덱싱, 인덱스 삭제 기능

---

## 7. Diff 뷰어

파일 변경사항을 Split/Unified 뷰로 실시간 확인:

```typescript
interface DiffEntry {
  taskId: string
  filePath: string
  oldContent: string
  newContent: string
  status: 'pending' | 'applied' | 'rejected'
}
```

---

## 8. 병렬 태스크 실행

독립적인 태스크들을 asyncio.gather()로 동시 실행 (최대 3개).

**조건**: ready 상태 태스크가 2개 이상일 때 자동 배치

---

## 9. Docker 샌드박스

위험한 bash 명령을 격리된 Docker 컨테이너에서 실행:

**보안 특성**:
- `network_mode: none` - 네트워크 격리
- `mem_limit: 512m` - 메모리 제한
- `user: sandbox` - non-root 실행
- `security_opt: no-new-privileges` - 권한 상승 차단

---

## 10. Claude Code Plan Usage Monitoring

Claude Code의 Plan Usage Limits를 실시간 모니터링:

```python
# 환경 변수로 설정 가능 (배포 시 필수)
CLAUDE_OAUTH_TOKEN=...           # Anthropic OAuth 토큰 (non-macOS 필수)
CLAUDE_STATS_CACHE_PATH=...      # stats-cache.json 경로
CLAUDE_USAGE_CACHE_PATH=...      # API 응답 캐시 경로
```

**기능**:
- Current Session / Weekly Limits 실시간 표시
- Sonnet/Opus 모델별 사용량 분리
- 로컬 토큰 통계 (stats-cache.json 기반)
- OAuth 토큰: 환경 변수 > macOS Keychain 순 우선순위
- API 실패 시 캐시 fallback (최대 1시간)

**Dashboard UI**: `ClaudeUsageDashboard` 컴포넌트 (DashboardPage 사이드바)

---

## 11. Claude Sessions 모니터링

외부에서 실행 중인 Claude Code 세션을 실시간 모니터링:

```python
class ClaudeSessionMonitor:
    def discover_sessions(self) -> list[ClaudeSessionInfo]
    def get_session_details(self, session_id: str) -> ClaudeSessionDetail
    async def watch_session(self, session_id: str) -> AsyncIterator[ClaudeSessionDetail]
```

**기능**:
- `~/.claude/projects/` 스캔으로 세션 자동 발견
- 파일 캐싱 (mtime + size 기반)
- 실시간 SSE 스트리밍
- Tool Use 입력값 추적
- 프로세스 정리 (고아 프로세스 제거)

---

## 12. 인증 시스템

Google/GitHub OAuth + 이메일/비밀번호 인증 지원:

```python
class AuthService:
    async def create_oauth_url(self, provider: str) -> str
    async def handle_callback(self, provider: str, code: str) -> TokenResponse
    async def register_with_email(self, email: str, password: str, name: str) -> TokenResponse
    async def login_with_email(self, email: str, password: str) -> TokenResponse
```

**토큰 설정**:
- Access Token: 60분 유효
- Refresh Token: 7일 유효
- `authFetch` 래퍼를 통한 자동 토큰 갱신 (401 시 refresh 자동 수행)

---

## 13. Task Lifecycle

태스크 재시도, 취소, 소프트 삭제:

```python
class TaskService:
    async def retry_task(self, session_id: str, task_id: str) -> TaskNode
    async def cancel_task(self, session_id: str, task_id: str) -> TaskNode
    async def soft_delete_task(self, session_id: str, task_id: str) -> bool
```

---

## 14. Pause/Resume

태스크 실행 일시정지 및 재개:

```python
class TaskStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
```

---

## 15. Permission Toggles

세션 단위 에이전트 권한 제어:

```python
class AgentPermission(str, Enum):
    EXECUTE_BASH = "execute_bash"
    WRITE_FILE = "write_file"
    DELETE_FILE = "delete_file"
    NETWORK_ACCESS = "network_access"
    MCP_TOOL_CALL = "mcp_tool_call"
```

---

## 16. Audit Trail

모든 시스템 액션 기록 및 추적:

```python
class AuditAction(str, Enum):
    TASK_CREATED = "task_created"
    TASK_COMPLETED = "task_completed"
    TASK_FAILED = "task_failed"
    APPROVAL_GRANTED = "approval_granted"
    TOOL_EXECUTED = "tool_executed"
```

**무결성 검증**: 로그 변조 감지 기능

---

## 17. Smart Notifications

다중 채널 이벤트 기반 알림:

**채널**: `slack`, `discord`, `email`, `webhook`

**기능**:
- 규칙 기반 알림 (이벤트 타입, 조건, 우선순위)
- 채널별 Rate Limiting
- 템플릿 기반 메시지 포맷
- 조직 초대 이메일 발송

---

## 18. Analytics Dashboard

Claude 세션 파일 기반 실제 데이터 시각화:

```python
class AnalyticsService:
    # Claude 세션 파일에서 실시간 데이터 수집 (USE_DATABASE 무관)
    def get_overview_from_sessions(project_name) -> OverviewMetrics
    def get_trends_from_sessions(time_range, project_name) -> MultiTrendData
    def get_agent_performance_from_sessions(time_range, project_name) -> AgentPerformanceList
    def get_cost_analytics_from_sessions(time_range, project_name) -> CostAnalytics
    def get_activity_heatmap_from_sessions(time_range, project_name) -> ActivityHeatmap
```

**데이터 소스**: `~/.claude/projects/` 세션 파일 스캔 (DB 모드와 무관)

**버킷팅 기준**: `created_at` (세션 생성 시점) 기준 시간별 분포

**에이전트 그룹화**: 실제 모델명 기준 (claude-opus-4-6, claude-haiku 등)

**비용 분류**: 프로젝트별 + 모델별 이중 분류

---

## 19. Agent Playground

에이전트 대화형 테스트 환경:

```python
class PlaygroundService:
    @staticmethod
    def create_session(data: PlaygroundSessionCreate) -> PlaygroundSession
    @staticmethod
    async def execute(session_id: str, request: PlaygroundExecuteRequest) -> PlaygroundExecution
    @staticmethod
    async def compare(request: PlaygroundCompareRequest) -> PlaygroundCompareResult
```

**기능**:
- 세션 기반 대화
- 모델/온도/도구 설정
- 스트리밍 응답
- 에이전트 비교 (2-5개)

---

## 20. LLM Auto-Switch

여러 LLM 프로바이더 간 자동 전환 및 Failover:

**라우팅 전략**:
- `priority`: 우선순위 기반 (기본)
- `round_robin`: 순차 분배
- `least_cost`: 비용 최소화
- `least_latency`: 지연 최소화
- `fallback_chain`: 장애 시 순차 시도

---

## 21. Version Control

설정 변경사항 버전 관리 및 롤백:

```python
class VersionService:
    @staticmethod
    def create_version(data: ConfigVersionCreate) -> ConfigVersion
    @staticmethod
    def compare_versions(version_id_a: str, version_id_b: str) -> ConfigVersionCompare
    @staticmethod
    def rollback(request: RollbackRequest) -> RollbackResult
```

**버전 상태**: `draft`, `active`, `archived`, `rolled_back`

---

## 22. Multi-tenant (Organizations)

조직 기반 멀티테넌트 격리:

**플랜별 제한**:

| 플랜 | 멤버 | 프로젝트 | 일일 세션 | 월간 토큰 |
|------|------|---------|----------|----------|
| Free | 5 | 3 | 100 | 100K |
| Starter | 10 | 10 | 500 | 500K |
| Professional | 50 | 50 | 2,000 | 2M |
| Enterprise | ∞ | ∞ | ∞ | ∞ |

**멤버 역할**: `owner`, `admin`, `member`, `viewer`

**기능**:
- 멤버 초대 (이메일 발송)
- 역할 변경
- 조직 통계
- 토큰 사용량 추적
- **QuotaService 중앙 집중식 제한 enforcement** (멤버/프로젝트/세션/토큰)
- 세션/프로젝트에 `organization_id` 연동
- `GET /organizations/{id}/quota` API로 quota 현황 조회
- `QuotaStatusPanel` 대시보드 컴포넌트 (progress bar 기반)
- **멤버별 사용량 추적**: `MemberUsageRecord`로 개인별 토큰/세션 사용 기록
- `GET /organizations/{id}/members/usage?period=day|week|month` API
- `MemberUsagePanel` 컴포넌트 (기간별 필터, 사용량 비율 시각화)

---

## 23. Project Config Management

Claude Code 프로젝트의 스킬, 에이전트, MCP, Hook을 웹 UI에서 관리:

```python
class ProjectConfigMonitor:
    def scan_projects(self) -> list[ProjectConfig]
    def get_project_skills(self, project_id: str) -> list[SkillConfig]
    def get_project_agents(self, project_id: str) -> list[AgentConfig]
    def get_project_mcp_servers(self, project_id: str) -> list[MCPServerConfig]
    def get_project_hooks(self, project_id: str) -> list[HookConfig]
```

**기능**:
- `.claude/` 디렉토리 스캔으로 자동 발견
- YAML Frontmatter 파싱
- 웹 UI에서 CRUD 작업
- 프로젝트 간 설정 복사

### Skills 관리
- 스킬 생성/수정/삭제
- 트리거 조건 설정
- 프롬프트 내용 편집

### Agents 관리
- 에이전트 생성/수정/삭제
- 시스템 프롬프트 편집
- 도구 구성 설정

### MCP 관리
- MCP 서버 추가/수정/삭제
- 서버 시작/중지
- 도구 목록 조회
- 도구 직접 호출 테스트

### Hooks 관리
- Hook 생성/수정/삭제
- 이벤트 타입 선택 (PreToolUse, PostToolUse, PostToolUseFailure, Notification, UserPromptSubmit, SessionStart, SessionEnd, Stop, SubagentStart, SubagentStop, PreCompact, PermissionRequest, Setup)
- 매처 패턴 설정
- 타임아웃 설정

### Commands 관리
- 커맨드 생성/수정/삭제
- 콘텐츠 편집
- 허용 도구 설정
- 프로젝트 간 커맨드 복사

---

## 24. RLHF Feedback

에이전트 실행 결과에 대한 사용자 피드백 수집:

**피드백 유형**:
- `implicit`: 사용자가 결과를 수정
- `explicit_positive`: 만족 (👍)
- `explicit_negative`: 불만족 (👎)

**데이터셋 출력 형식** (JSONL):
```json
{"messages": [...], "metadata": {"feedback_type": "implicit", "agent_id": "..."}}
```

**태스크 평가**:
- 세션/태스크 단위 평가 제출
- 평가 통계 및 목록 조회
- AgentEvalPanel 컴포넌트로 시각화

---

## 25. Git Team Collaboration

팀 협업을 위한 Git 기반 브랜치 관리 및 머지 시스템:

```python
class GitService:
    def list_branches(include_remote: bool = True) -> list[GitBranch]
    def create_branch(name: str, start_point: str = "HEAD") -> GitBranch
    def delete_branch(name: str, force: bool = False) -> bool
    def get_commits(branch: str, limit: int = 50) -> list[GitCommit]

class MergeService:
    def check_merge_conflicts(source: str, target: str) -> MergePreview
    def merge_branch(source: str, target: str, message: str) -> MergeResult
```

### Working Directory

작업 디렉토리 변경 사항 관리:
- Staged/Unstaged/Untracked 파일 표시
- 파일 스테이징 (git add)
- 커밋 생성 (git commit)

### LLM 기반 Draft Commits

AI가 Git 변경사항을 분석하여 논리적인 커밋 그룹을 제안:
- 관련 파일 자동 그룹화 (같은 기능/모듈)
- Conventional Commits 형식 메시지 생성
- 커밋 타입/스코프 자동 추론 (feat, fix, docs 등)
- 패턴 기반 그룹화와 LLM 기반 그룹화 전환 가능

### 브랜치 관리

- 로컬/리모트 브랜치 목록 조회
- 브랜치 생성/삭제 (로컬 + 원격)
- Ahead/Behind 커밋 수 계산
- 보호 브랜치 (main, master) 설정
- 원격 브랜치 삭제 (`?remote=true` 쿼리 파라미터)

### 충돌 감지

- `git merge-tree` 기반 드라이런
- 충돌 파일 목록 및 상세 정보
- 3-way diff 지원

### 충돌 해결

PR/MR 머지 시 발생하는 충돌을 대시보드에서 직접 해결:

```python
class MergeService:
    def resolve_conflict(request: ConflictResolutionRequest) -> ConflictResolutionResult
    def abort_merge() -> MergeAbortResult
    def complete_merge(message: str) -> MergeResult
```

**해결 전략**:
- `ours`: Target 브랜치 버전 유지 (머지 대상)
- `theirs`: Source 브랜치 버전 유지 (머지 소스)
- `custom`: 사용자가 직접 해결된 내용 입력

**Dashboard UI**:
- 충돌 파일 목록 사이드바
- 3열 가로 배치 3-way diff (Base, Ours, Theirs)
- 해결 전략 선택 라디오 버튼
- Custom 모드 시 텍스트 에디터 제공
- 파일별 개별 해결 후 전체 머지 완료

### Merge Request (내부 MR)

- 팀 내부 머지 요청 생성 (DB 영속화, 서버 재시작 시에도 유지)
- 승인/거부 워크플로우
- MR 상태: `open`, `merged`, `closed`, `draft`
- **Auto-Merge**: MR 생성 시 `auto_merge` 활성화 → 승인 조건 충족 시 자동 머지

### GitHub 통합

- Pull Request 목록 조회
- PR 머지 (`merge`, `squash`, `rebase`)
- PR 리뷰 생성/조회

### 권한 체계

| 역할 | read | write | merge_main | admin |
|------|------|-------|------------|-------|
| owner | ✓ | ✓ | ✓ | ✓ |
| admin | ✓ | ✓ | ✓ | - |
| member | ✓ | ✓ | - | - |
| viewer | ✓ | - | - | - |

### 브랜치 보호 규칙 (동적)

DB 기반 동적 브랜치 보호 규칙 관리:
- glob 패턴 매칭 (`main`, `release/*`, `feature/*`)
- 필요 승인 수, 충돌 금지, 역할별 머지 권한 설정
- Force push / 삭제 허용 여부
- **Auto-Deploy**: 머지 시 GitHub Actions workflow 자동 트리거
- Dashboard Protection 탭에서 CRUD 관리

**보호 브랜치**: 규칙 미설정 시 기본으로 `main`, `master` 브랜치는 `merge_main` 권한 필요

---

## 26. Project Monitoring

프로젝트 헬스 체크 자동화:

```python
class ProjectRunner:
    async def run_check(self, project_path: str, check_type: CheckType) -> CheckResult
```

**체크 타입**:
- `test`: npm test 실행
- `lint`: ESLint 검사
- `build`: 프로덕션 빌드
- `type_check`: TypeScript 타입 검사

**Dashboard UI**:
- 프로젝트별 헬스 상태 표시
- 실시간 출력 로그
- 체크 실행/중지
- 결과 히스토리
- `WorkflowCheckCard`

---

## 27. Rate Limiting

API 속도 제한 및 할당량 관리:

```python
class RateLimitService:
    def check_limit(user_id: str, endpoint: str) -> bool
    def record_request(user_id: str, endpoint: str) -> None
    def get_usage(user_id: str) -> RateLimitUsage
```

**제한 타입**:
- 분당 요청 수
- 일일 요청 수
- 동시 세션 수

---

## 28. Cost Allocation

LLM 비용 추적 및 할당:

```python
class CostAllocationService:
    def track_usage(session_id: str, model: str, tokens: int) -> None
    def get_session_cost(session_id: str) -> CostSummary
    def get_organization_cost(org_id: str, period: str) -> CostReport
```

**Dashboard UI**:
- 세션별 비용 표시
- 에이전트별 비용 분석
- 일간/주간/월간 추이
- 비용 예측

---

## 29. Process Cleanup

고아 프로세스 및 리소스 정리:

```python
class ProjectCleanupService:
    def cleanup_orphan_processes(project_id: str) -> CleanupResult
    def cleanup_temp_files(project_path: str) -> CleanupResult
```

**Dashboard UI**:
- 실행 중인 프로세스 목록
- 프로세스 종료
- 일괄 정리

---

## 30. Project Templates

프로젝트 템플릿 관리:

```python
class ProjectTemplateService:
    def list_templates() -> list[ProjectTemplate]
    def create_from_template(template_id: str, project_name: str) -> Project
    def export_as_template(project_id: str) -> ProjectTemplate
```

**기능**:
- 템플릿 목록 조회
- 템플릿에서 프로젝트 생성
- 프로젝트를 템플릿으로 내보내기

---

## 31. MCP Tool Integration

Model Context Protocol 도구 통합:

```python
class MCPService:
    async def start_server(server_config: MCPServerConfig) -> MCPServer
    async def stop_server(server_id: str) -> bool
    async def call_tool(server_id: str, tool_name: str, args: dict) -> ToolResult
    def list_tools(server_id: str) -> list[MCPTool]
```

**지원 서버**:
- `filesystem`: 파일 시스템 접근
- `github`: GitHub API 통합
- `playwright`: 브라우저 자동화
- `sqlite`: 데이터베이스 접근
- 커스텀 MCP 서버

**Dashboard UI**:
- MCP 서버 목록
- 서버 상태 표시
- 도구 목록 조회
- 도구 직접 호출 테스트
- 통계 패널

---

## 32. Health Check

시스템 건강도 체크:

```python
class HealthService:
    def check_all() -> HealthStatus
    def check_database() -> ComponentHealth
    def check_redis() -> ComponentHealth
    def check_llm_providers() -> dict[str, ComponentHealth]
```

**체크 항목**:
- 데이터베이스 연결
- Redis 연결
- LLM 프로바이더 상태
- MCP 서버 상태

---

## 33. Warp Terminal Integration

Warp 터미널을 통한 Claude Code 실행:

```python
class WarpService:
    def build_claude_command(task: str | None = None) -> str
    def open_with_command(path: str, command: str, title: str | None = None) -> dict
    def cleanup_old_configs(max_age_hours: int = 24) -> int
    def list_models() -> list[dict]          # Warp 사용 가능 모델 목록
    def run_agent(task, model, mcp_servers) -> dict  # MCP 연동 에이전트 실행
```

**특징**:
- Warp Launch Configuration (YAML) 기반 실행
- 태스크 내용을 임시 파일로 저장 후 `claude --dangerously-skip-permissions "$(cat file)"` 방식으로 전달
- Docker 모드 지원 (URI를 프론트엔드로 반환)
- 오래된 설정 파일 자동 정리
- MCP 서버 연동 에이전트 실행 지원

---

## 34. Admin Menu Management

관리자 페이지에서 사이드바 메뉴 가시성 및 순서 관리:

**기능**:
- 역할별(user/manager/admin) 메뉴 가시성 제어
- 드래그 앤 드롭으로 메뉴 순서 변경 (HTML5 네이티브 DnD)
- 변경사항 DB 저장 후 모든 사용자에게 적용
- `MENU_LABELS` 단일 소스로 메뉴 이름 일관성 유지

**DB 모델**: `MenuVisibilityModel` (menu_key, role, visible, sort_order)

---

## 35. E2E 암호화

민감 데이터 필드 암호화 및 패스워드 해싱 업그레이드:

```python
class EncryptedString(TypeDecorator):
    """SQLAlchemy 커스텀 타입 - DB 저장 시 AES-256-GCM 암호화"""
    impl = String
    # process_bind_param: 저장 시 encrypt
    # process_result_value: 읽기 시 decrypt

class KeyManager:
    """HKDF 기반 마스터 키에서 서비스별 키 파생"""
    def get_field_encryption_key() -> bytes
    def rotate_key(old_key, new_key, db_session)
```

**암호화 대상**: ChannelConfigModel (webhook_url, api_key, bot_token, smtp_password), SAMLConfigModel (idp_certificate)

**패스워드**: SHA-256 → bcrypt 점진적 마이그레이션 (로그인 시 자동 업그레이드)

**TLS**: PostgreSQL/Redis 서비스 간 TLS 지원 (DB_SSL_MODE, REDIS_SSL)

**하위 호환**: `ENCRYPTION_MASTER_KEY` 미설정 시 평문 저장

---

## 36. 프로젝트별 RBAC

프로젝트 단위 세분화된 접근제어:

```python
class ProjectAccessService:
    async def grant_access(db, project_id, user_id, role, granted_by)
    async def check_access(db, project_id, user_id) -> str | None
    async def has_any_access_control(db, project_id) -> bool
```

**역할 계층**: `viewer` (0) < `editor` (1) < `owner` (2)

**하위 호환**: project_access 레코드가 없는 프로젝트 → 모든 인증 사용자 접근 허용

**시스템 admin**: 모든 프로젝트 접근 바이패스

**Dashboard UI**: `ProjectMembersPanel` - 멤버 목록, 초대, 역할 변경, 제거

---

## 37. Kubernetes 스케일링

프로덕션 수준 K8s 배포 및 Helm Chart:

**K8s 매니페스트** (`infra/k8s/base/`):
- Backend/Dashboard Deployment + HPA (CPU 70%, 2-10 replicas)
- PostgreSQL/Redis StatefulSet (영구 스토리지)
- NetworkPolicy (기본 deny + 선택적 허용)
- Ingress (TLS 종료, /api→backend, /→dashboard)

**Helm Chart** (`infra/helm/aos/`):
- 환경별 values (개발/프로덕션)
- 전체 리소스 템플릿화

**Dockerfile 최적화**:
- 멀티스테이지 빌드 (builder → runtime)
- non-root 유저, HEALTHCHECK
- Dashboard: nginx-alpine 기반 SPA 호스팅

---

## 38. DB 기반 프로젝트 레지스트리

파일시스템 스캔 대신 DB에 명시적으로 등록된 프로젝트만 관리:

```python
class ProjectModel(Base):
    __tablename__ = "projects"
    id          = Column(String(36), primary_key=True)  # UUID
    name        = Column(String(255), unique=True, nullable=False)
    slug        = Column(String(100), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    path        = Column(String(1000), nullable=True)   # 파일시스템 경로 (config 스캔용)
    is_active   = Column(Boolean, default=True)
    settings    = Column(JSON, default={})
```

**기능**:
- DB 기반 프로젝트 CRUD (생성, 조회, 수정, 비활성화, 복원)
- Soft-delete 패턴 (`is_active` 플래그)으로 안전한 삭제
- URL-friendly slug 자동 생성 (`_slugify()`)
- Claude Sessions 프로젝트 필터가 DB 등록 프로젝트만 표시
- ProjectConfigs 연동: DB 프로젝트의 `path`가 있는 프로젝트만 설정 스캔
- 서버 시작 시 자동 마이그레이션 (Migration 8)

**API**: `/api/project-registry` (7개 엔드포인트)

**Dashboard UI**: `ProjectManagementPage` - 프로젝트 생성, 검색, 인라인 편집, 비활성화/복원

---

## 39. Workflow Automation (CI/CD)

GitHub Actions 유사 워크플로우 자동화 시스템:

```python
class WorkflowEngine:
    def build_job_dag(jobs) -> list[list[str]]          # 위상정렬 기반 DAG 병렬 그룹
    async def execute_run(run_id, definition, ...) -> dict  # 워크플로우 실행
    def expand_matrix(job_name, job) -> list[tuple]     # Matrix 전략 확장
    def cancel_run(run_id)                               # 실행 취소
```

**워크플로우 정의** (YAML DSL):
- `name`, `description`: 워크플로우 메타데이터
- `on`: 트리거 설정 (manual, push, pull_request, schedule, webhook, merge)
- `jobs`: Job 정의 (needs 의존성, steps, matrix, environment)
- `env`: 환경 변수

**실행 엔진**:
- Kahn's Algorithm 기반 위상정렬로 DAG 스케줄링
- Job 단위 병렬 실행 (asyncio.gather)
- Matrix 전략: 모든 조합 자동 확장
- Runner: `local` (직접 실행) / `docker` (SandboxManager 위임)
- `${{ matrix.* }}`, `${{ env.* }}` 변수 치환
- Step 타임아웃 지원

**API 엔드포인트** (12개):
- `GET/POST /api/workflows` - 워크플로우 CRUD
- `GET/PUT/DELETE /api/workflows/{id}` - 개별 워크플로우
- `GET/POST /api/workflows/{id}/runs` - 실행 목록/트리거
- `GET /api/workflows/runs/{id}` - 실행 상세
- `POST /api/workflows/runs/{id}/cancel` - 실행 취소
- `POST /api/workflows/runs/{id}/retry` - 실행 재시도
- `GET /api/workflows/runs/{id}/stream` - SSE 실시간 로그
- `GET /api/workflows/{id}/yaml` - YAML 내보내기

**Dashboard UI**:
- `WorkflowsPage`: 3-패널 레이아웃 (목록 | 상세+DAG | 로그)
- `WorkflowDAG`: 의존성 기반 파이프라인 시각화
- `WorkflowRunLogs`: 터미널 스타일 실시간 로그 (SSE)
- `WorkflowCreateModal`: YAML 에디터 (샘플 템플릿 포함)

**DB 테이블**: `workflow_definitions`, `workflow_runs`, `workflow_jobs`, `workflow_steps`, `workflow_secrets`, `workflow_webhooks`, `workflow_artifacts`, `workflow_templates`

### Phase 2: 트리거 시스템 + 고급 UI

**Variable Expander**: `${{ steps.<id>.outputs.<key> }}`, `${{ secrets.<name> }}`, `${{ inputs.<key> }}`, `${{ env.<key> }}`, `${{ matrix.<key> }}` 패턴 지원. Step stdout에서 `::set-output name=KEY::VALUE` 캡처.

**Secret Management**: Fernet 암호화 기반 시크릿 저장. scope (workflow/project/global). 로그에서 자동 마스킹 (`***`).

**Scheduler Service**: APScheduler BackgroundScheduler + CronTrigger 기반. cron 프리셋, 일시정지/재개, 다음 실행 미리보기.

**Webhook Service**: HMAC-SHA256 서명 검증. GitHub push/PR payload 파싱. branch/path fnmatch 필터 매칭.

**고급 UI**:
- `YamlEditor`: js-yaml 검증, 에러 라인 표시, Edit/Preview 토글
- `EnhancedRunLogs`: 로그 레벨 필터, 검색, job 접기/펴기
- `InteractiveDAG`: 확장 가능한 Job 노드, 위상정렬 레이어링
- `TriggerConfigPanel` + `CronBuilder`: 트리거 유형별 탭 UI

### Phase 3: Matrix 고도화 + Artifacts + Templates

**Advanced Matrix**: `exclude` (조합 제외), `include` (추가 커스텀 조합) 지원.

**Step-level Retry**: `retry: {max_attempts, backoff: linear|exponential, delay_seconds}`. 지수 백오프 `delay * 2^attempt`.

**Artifact Service**: 로컬 파일시스템 `./data/artifacts/{run_id}/` 저장. 보존 정책 (expires_at). multipart 업로드.

**Template Service**: 내장 4종 (Python CI, Node.js CI, Deploy, Test Suite). 카테고리별 필터, popularity 추적.

**추가 UI**:
- `TemplateGallery`: 카테고리 필터 + 검색, YAML 미리보기, 프로젝트 선택 + 중복 검증
- `WorkflowCreateModal`: 워크플로우 생성 모달 (프로젝트 선택, 중복 검증)
- `ArtifactBrowser`: 파일 아이콘/크기, 다운로드
- `SecretsManager`: 시크릿 CRUD 모달, 마스킹 표시
- `ExecutionTimeline`: Gantt 차트 스타일 실행 타임라인
