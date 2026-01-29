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
    "claude-sonnet-4-20250514": {"input": 0.003, "output": 0.015},
}
```

**Provider별 Context 한도**:
- Claude: 200K tokens
- Gemini: 1M tokens
- GPT-4: 128K tokens

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

## 10. Claude Sessions 모니터링

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

---

## 11. 인증 시스템

Google/GitHub OAuth + 이메일/비밀번호 인증 지원:

```python
class AuthService:
    async def create_oauth_url(self, provider: str) -> str
    async def handle_callback(self, provider: str, code: str) -> TokenResponse
    async def register_with_email(self, email: str, password: str, name: str) -> TokenResponse
    async def login_with_email(self, email: str, password: str) -> TokenResponse
```

**토큰 설정**:
- Access Token: 15분 유효
- Refresh Token: 7일 유효

---

## 12. Task Lifecycle

태스크 재시도, 취소, 소프트 삭제:

```python
class TaskService:
    async def retry_task(self, session_id: str, task_id: str) -> TaskNode
    async def cancel_task(self, session_id: str, task_id: str) -> TaskNode
    async def soft_delete_task(self, session_id: str, task_id: str) -> bool
```

---

## 13. Pause/Resume

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

## 14. Permission Toggles

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

## 15. Audit Trail

모든 시스템 액션 기록 및 추적:

```python
class AuditAction(str, Enum):
    TASK_CREATED = "task_created"
    TASK_COMPLETED = "task_completed"
    TASK_FAILED = "task_failed"
    APPROVAL_GRANTED = "approval_granted"
    TOOL_EXECUTED = "tool_executed"
```

---

## 16. Smart Notifications

다중 채널 이벤트 기반 알림:

**채널**: `slack`, `discord`, `email`, `webhook`

**기능**:
- 규칙 기반 알림 (이벤트 타입, 조건, 우선순위)
- 채널별 Rate Limiting
- 템플릿 기반 메시지 포맷

---

## 17. Analytics Dashboard

메트릭, 트렌드, 성능 데이터 시각화:

```python
class AnalyticsService:
    def get_overview() -> OverviewMetrics
    def get_trends(time_range) -> MultiTrendData
    def get_agent_performance(time_range) -> AgentPerformanceList
    def get_cost_analytics(time_range) -> CostAnalytics
```

---

## 18. Agent Playground

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

## 19. LLM Auto-Switch

여러 LLM 프로바이더 간 자동 전환 및 Failover:

**라우팅 전략**:
- `priority`: 우선순위 기반 (기본)
- `round_robin`: 순차 분배
- `least_cost`: 비용 최소화
- `least_latency`: 지연 최소화
- `fallback_chain`: 장애 시 순차 시도

---

## 20. Version Control

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

## 21. Multi-tenant (Organizations)

조직 기반 멀티테넌트 격리:

**플랜별 제한**:

| 플랜 | 멤버 | 프로젝트 | 일일 세션 | 월간 토큰 |
|------|------|---------|----------|----------|
| Free | 5 | 3 | 100 | 100K |
| Starter | 10 | 10 | 500 | 500K |
| Professional | 50 | 50 | 2,000 | 2M |
| Enterprise | ∞ | ∞ | ∞ | ∞ |

**멤버 역할**: `owner`, `admin`, `member`, `viewer`

---

## 22. Project Config Management

Claude Code 프로젝트의 스킬, 에이전트, 명령어를 웹 UI에서 관리:

```python
class ProjectConfigMonitor:
    def scan_projects(self) -> list[ProjectConfig]
    def get_project_skills(self, project_id: str) -> list[SkillConfig]
    def get_project_agents(self, project_id: str) -> list[AgentConfig]
    def get_project_commands(self, project_id: str) -> list[CommandConfig]
```

**기능**:
- `.claude/` 디렉토리 스캔으로 자동 발견
- YAML Frontmatter 파싱
- 웹 UI에서 CRUD 작업

---

## 23. RLHF Feedback

에이전트 실행 결과에 대한 사용자 피드백 수집:

**피드백 유형**:
- `implicit`: 사용자가 결과를 수정
- `explicit_positive`: 만족 (👍)
- `explicit_negative`: 불만족 (👎)

**데이터셋 출력 형식** (JSONL):
```json
{"messages": [...], "metadata": {"feedback_type": "implicit", "agent_id": "..."}}
```

---

## 24. Git Team Collaboration

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

### 주요 기능

**브랜치 관리**:
- 로컬/리모트 브랜치 목록 조회
- 브랜치 생성/삭제
- Ahead/Behind 커밋 수 계산
- 보호 브랜치 (main, master) 설정

**충돌 감지**:
- `git merge-tree` 기반 드라이런
- 충돌 파일 목록 및 상세 정보
- 3-way diff 지원

**Merge Request (내부 MR)**:
- 팀 내부 머지 요청 생성
- 승인/거부 워크플로우
- MR 상태: `open`, `merged`, `closed`, `draft`

**GitHub 통합**:
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

**보호 브랜치**: `main`, `master` 브랜치는 `merge_main` 권한 필요
