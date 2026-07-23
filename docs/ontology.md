# AOS Ontology

AOS 도메인 개념의 온톨로지 정의입니다.

---

## 클래스 (Class) - 개념/범주 정의

### Core Classes

```
Agent              # 작업을 수행하는 주체
Task               # 수행할 작업 단위
Session            # 작업 컨텍스트/생명주기
Capability         # 에이전트가 가진 능력
Tool               # 에이전트가 사용하는 도구
```

### Agent Hierarchy

```
Agent
├── OrchestratorAgent          # 조율/관리 에이전트
│   └── LeadOrchestratorAgent  # 최상위 조율자
│
└── SpecialistAgent            # 전문 에이전트
    ├── PlannerAgent           # 계획 수립
    ├── ExecutorAgent          # 실행
    ├── ReviewerAgent          # 검토/품질
    ├── ResearcherAgent        # 조사/탐색
    ├── OptimizerAgent         # 최적화
    └── ValidatorAgent         # 검증
```

### Task Hierarchy

```
Task
├── RootTask                   # 최상위 태스크
├── SubTask                    # 하위 태스크
│   ├── PlanningTask           # 계획 태스크
│   ├── ExecutionTask          # 실행 태스크
│   ├── ReviewTask             # 검토 태스크
│   └── ValidationTask         # 검증 태스크
└── ParallelTask               # 병렬 실행 태스크
```

### Resource Hierarchy

```
Resource
├── CodeResource               # 코드 파일
├── DocumentResource           # 문서
├── ConfigResource             # 설정
└── DataResource               # 데이터
```

### Tenancy Hierarchy

멀티테넌시는 Organization → Project → Session 의 2단계 소속 구조다.

```
Organization                   # 최상위 테넌트 (조직)
├── OrganizationMember         # 조직 구성원 (role/permissions 보유)
├── OrganizationInvitation     # 조직 초대
└── Project                    # 조직에 속한 프로젝트 (organization_id)
    ├── ProjectAccess          # 프로젝트 RBAC 부여
    ├── ProjectInvitation      # 프로젝트 초대
    └── Session                # 프로젝트 컨텍스트의 세션
```

### LLM Access Hierarchy

LLM 실행 권한·자격증명·사용량은 별도 계층으로 분리되어 있다.

```
LLMAccess
├── LLMModelConfig             # 모델 레지스트리 (가격/컨텍스트/능력)
│   └── LLMModelSuppression    # DB 재등록 금지 목록 (hard delete)
├── Credential                 # 자격증명 (암호화 저장)
│   ├── UserLLMCredential      # 사용자 개인 API 키
│   └── DeploymentUsageCredential  # 배포 단위 usage 조회 전용 키
├── UserLLMEntitlement         # 사용자/조직의 실행 모드·범위 권한
│   └── LLMCLIProfile          # 구독형 CLI 실행 프로파일
└── LLMUsageLedger             # AOS 발생 LLM 사용량의 내부 정본 원장
```

---

## 속성 (Property) - 관계와 값

### Agent Properties

| Property | Domain | Range | Description |
|----------|--------|-------|-------------|
| `agentId` | Agent | string | 고유 식별자 |
| `agentName` | Agent | string | 표시 이름 |
| `agentStatus` | Agent | Status | 현재 상태 |
| `hasCapability` | Agent | Capability[] | 보유 능력 |
| `usesTool` | Agent | Tool[] | 사용 도구 |
| `maxConcurrency` | Agent | integer | 최대 동시 실행 수 |

### Task Properties

| Property | Domain | Range | Description |
|----------|--------|-------|-------------|
| `taskId` | Task | string | 고유 식별자 |
| `taskStatus` | Task | TaskStatus | 현재 상태 |
| `priority` | Task | integer | 우선순위 (1-10) |
| `complexity` | Task | integer | 복잡도 (1-10) |
| `retryCount` | Task | integer | 재시도 횟수 |
| `estimatedTokens` | Task | integer | 예상 토큰 |

### Session Properties

| Property | Domain | Range | Description |
|----------|--------|-------|-------------|
| `sessionId` | Session | string | 고유 식별자 |
| `sessionStatus` | Session | SessionStatus | 현재 상태 (핵심 `sessions` 테이블은 Enum이 아닌 자유 문자열 — 아래 Status Enumerations 주석 참조) |
| `totalCost` | Session | float | 누적 비용 |
| `tokenUsage` | Session | TokenUsage | 토큰 사용량 |

---

## 관계 (Relationship) - 개념 간 연결

### Hierarchical Relations (계층)

```
is-a (상속)
├── SpecialistAgent is-a Agent
├── PlannerAgent is-a SpecialistAgent
├── SubTask is-a Task
└── CodeResource is-a Resource

part-of (구성)
├── SubTask part-of RootTask
├── Agent part-of Session
└── Tool part-of Agent
```

### Dependency Relations (의존성)

```
depends-on (의존)
├── ExecutionTask depends-on PlanningTask
├── ReviewTask depends-on ExecutionTask
└── ValidationTask depends-on ReviewTask

blocks (차단)
├── PlanningTask blocks ExecutionTask
└── ApprovalPending blocks Execution
```

### Operational Relations (운영)

```
executes (실행)
├── ExecutorAgent executes ExecutionTask
├── PlannerAgent executes PlanningTask
└── ReviewerAgent executes ReviewTask

uses (사용)
├── Agent uses Tool
├── Agent uses MCPServer
└── Task uses Resource

produces (생산)
├── PlannerAgent produces Plan
├── ExecutorAgent produces Result
└── ReviewerAgent produces Feedback

consumes (소비)
├── ExecutorAgent consumes Plan
├── ReviewerAgent consumes Result
└── ValidatorAgent consumes Feedback
```

### Association Relations (연관)

```
assigned-to (할당)
├── Task assigned-to Agent
└── Session assigned-to User

belongs-to (소속)
├── Agent belongs-to Session
├── Task belongs-to Session
├── User belongs-to Organization
├── Project belongs-to Organization
└── Session belongs-to Project

entitled-to (권한)
├── User entitled-to LLMRuntimeMode
└── UserLLMEntitlement references LLMCLIProfile

records (기록)
└── LLMUsageLedger records LLMInvocation

monitors (모니터링)
├── OrchestratorAgent monitors SpecialistAgent
└── Session monitors Task
```

---

## 인스턴스 (Instance) - 실제 개체

### Agent Instances

| Instance ID | Class | Capabilities |
|-------------|-------|--------------|
| `aos-orchestrator` | LeadOrchestratorAgent | task-decomposition, agent-selection, parallel-coordination |
| `web-ui-specialist` | ExecutorAgent | react, tailwind, typescript, ui-design |
| `backend-integration-specialist` | ExecutorAgent | firebase, api, data-sync |
| `test-automation-specialist` | ValidatorAgent | vitest, testing-library, coverage |
| `performance-optimizer` | OptimizerAgent | profiling, bundle-analysis, caching |
| `quality-validator` | ReviewerAgent | code-review, standards, compliance |
| `code-simplifier` | OptimizerAgent | refactoring, complexity-analysis |

### Tool Instances

| Instance ID | Class | Provider |
|-------------|-------|----------|
| `mcp-filesystem` | MCPTool | filesystem |
| `mcp-github` | MCPTool | github |
| `mcp-playwright` | MCPTool | playwright |

### Status Enumerations

```python
# SSOT: src/backend/models/agent_state.py
TaskStatus = {
    PENDING,      # 대기 중
    IN_PROGRESS,  # 진행 중
    WAITING,      # 대기(의존성/외부 응답 대기)
    PAUSED,       # 일시정지
    COMPLETED,    # 완료
    FAILED,       # 실패
    CANCELLED     # 취소
}

# SSOT: src/backend/models/hitl.py
ApprovalStatus = {
    PENDING,      # 승인 대기
    APPROVED,     # 승인됨
    DENIED,       # 거부됨
    EXPIRED       # 만료
}

# 주의: AgentStatus는 코드에 단일 SSOT가 없다. 두 정의가 공존한다.
# (1) 레지스트리 계열 — src/backend/services/agent_registry.py,
#     api/v1/agents.py, api/v1/agent_registry.py
AgentStatus = {
    AVAILABLE,    # 가용
    BUSY,         # 작업 중
    UNAVAILABLE,  # 비가용
    ERROR         # 오류
}

# (2) 모니터 계열 — src/backend/api/v1/agent_monitor.py
AgentMonitorStatus = {
    IDLE,         # 유휴
    RUNNING,      # 실행 중
    ERROR,        # 오류
    OFFLINE       # 오프라인
}
# BLOCKED는 어느 정의에도 존재하지 않는다 (문서상 값, 코드 미사용).

# 주의: 핵심 Session(`sessions` 테이블)의 status는 Enum이 아닌
# String(50) 자유 문자열이며 default="active"로 생성된다. 코드가 이 컬럼에
# 다른 값을 기록하는 곳은 없고, 읽는 쪽도 == "active" 비교뿐이다
# (db/repository.py, services/analytics_service.py).
# "completed" 계열 상태는 별개 개념 — Task는 TaskStatus,
# Claude 세션 스냅샷은 아래 SessionStatus를 쓴다. 혼동 주의.
# 아래 Enum은 Claude 세션 스냅샷 전용 — src/backend/models/claude_session.py
SessionStatus = {
    ACTIVE,       # 활성
    IDLE,         # 유휴
    COMPLETED,    # 완료
    UNKNOWN       # 판별 불가
}
# EXPIRED는 두 경로(핵심 세션 / 스냅샷) 어디에서도 확인되지 않았다 — 확인 필요.
```

---

## 추론 규칙 (Inference Rules)

### Task Scheduling

```
IF task.status = PENDING
   AND task.dependencies.all(status = COMPLETED)
   AND agent.status = IDLE
   AND agent.hasCapability(task.requiredCapability)
THEN task CAN BE assigned-to agent
```

### Parallel Execution

```
IF tasks.count >= 2
   AND tasks.all(dependencies.satisfied)
   AND tasks.none(blocks another in tasks)
THEN tasks CAN BE executed-in-parallel
```

### Agent Selection

```
IF task.requiredCapability IN agent.capabilities
   AND agent.status = IDLE
   AND agent.currentLoad < agent.maxConcurrency
THEN agent IS candidate-for task
ORDER BY capability-match-score DESC
```

### Self-Correction

```
IF task.status = FAILED
   AND task.retryCount < 3
   AND task.error.isRecoverable
THEN task SHOULD BE retried
WITH correctionStrategy = analyzeError(task.error)
```

---

## 확장 가이드

### 새 Agent 추가

1. 적절한 상위 클래스 선택 (SpecialistAgent 하위)
2. Capability 정의
3. 사용할 Tool 연결
4. 실행할 Task 타입 매핑

```yaml
NewAgent:
  is-a: SpecialistAgent
  hasCapability: [cap1, cap2]
  usesTool: [tool1, tool2]
  executes: [TaskType1, TaskType2]
```

### 새 Task 타입 추가

1. 상위 Task 클래스 선택
2. 필수 속성 정의
3. 의존성 관계 설정
4. 실행 가능 Agent 매핑

```yaml
NewTaskType:
  is-a: SubTask
  properties:
    - customProperty: type
  depends-on: [PrerequisiteTask]
  executed-by: [CapableAgent]
```

### 새 Capability 추가

1. Capability 이름 정의
2. 관련 Tool 연결
3. Agent에 부여

```yaml
NewCapability:
  name: "new-skill"
  requiresTool: [tool1]
  enabledFor: [Agent1, Agent2]
```
