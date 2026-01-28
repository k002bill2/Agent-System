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
| `sessionStatus` | Session | SessionStatus | 현재 상태 |
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
└── User belongs-to Organization

monitors (모니터링)
├── OrchestratorAgent monitors SpecialistAgent
└── Session monitors Task
```

---

## 인스턴스 (Instance) - 실제 개체

### Agent Instances

| Instance ID | Class | Capabilities |
|-------------|-------|--------------|
| `lead-orchestrator` | LeadOrchestratorAgent | task-decomposition, agent-selection, parallel-coordination |
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
TaskStatus = {
    PENDING,      # 대기 중
    IN_PROGRESS,  # 진행 중
    PAUSED,       # 일시정지
    COMPLETED,    # 완료
    FAILED,       # 실패
    CANCELLED     # 취소
}

AgentStatus = {
    IDLE,         # 유휴
    BUSY,         # 작업 중
    BLOCKED,      # 차단됨
    ERROR         # 오류
}

SessionStatus = {
    ACTIVE,       # 활성
    IDLE,         # 유휴
    COMPLETED,    # 완료
    EXPIRED       # 만료
}
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
