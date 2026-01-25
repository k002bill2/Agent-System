# Parallel Agents Safety Protocol v3.1.0
## ACE Framework Integration - AOS Dashboard Project

## Document Information
- **Version**: 3.1.0
- **Last Updated**: 2025-01-26
- **Status**: Active - ACE Framework Integrated for AOS Dashboard
- **Scope**: Multi-agent parallel execution for AOS React Web + Python Backend
- **Framework**: Based on Autonomous Cognitive Entity (ACE) Framework
- **Project**: AOS Dashboard - Agent Orchestration Service

---

## 1. ACE Framework Foundation

### 1.1 ACE Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: ASPIRATIONAL LAYER                                 │
│ Purpose: Define ethical principles and universal constraints│
│ Scope: All agents, all operations                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: GLOBAL STRATEGY LAYER                              │
│ Purpose: Maintain overall mission and long-term goals       │
│ Scope: Primary Agent (with user input)                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: AGENT MODEL LAYER                                  │
│ Purpose: Self-awareness of capabilities and limitations     │
│ Scope: All agents (individual self-assessment)              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: EXECUTIVE FUNCTION LAYER                           │
│ Purpose: Task decomposition and resource allocation         │
│ Scope: Primary Agent (coordination)                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 5: COGNITIVE CONTROL LAYER                            │
│ Purpose: Task selection and conflict prevention             │
│ Scope: All agents (local execution control)                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 6: TASK PROSECUTION LAYER                             │
│ Purpose: Actual execution with tools and skills             │
│ Scope: All agents (parallel operation)                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ FEEDBACK LOOPS (Cross-Layer)                                │
│ Purpose: Continuous learning and protocol evolution         │
│ Scope: All layers (bidirectional feedback)                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Core Principles - AOS Dashboard

### 2.1 Aspirational Layer: Ethical Principles

#### 2.1.1 Core Mission (Heuristic Imperatives)

**1. Reduce Suffering**
- 세션 데이터 무결성 보장 (PostgreSQL/Redis)
- API Rate Limit 존중 (Firebase, LLM Provider)
- 사용자 승인 없는 위험 작업 방지 (HITL)

**2. Increase Prosperity**
- 병렬 처리로 개발 효율 극대화
- LangGraph 오케스트레이션으로 자동화
- 테스트 커버리지 75%+ 유지

**3. Increase Understanding**
- 타입 안전성 (TypeScript strict, Python type hints)
- 명확한 문서화 (CLAUDE.md, Dev Docs)
- 투명한 에러 메시지

#### 2.1.2 Universal Ethical Constraints

| Constraint | Description | AOS Context |
|------------|-------------|-------------|
| **Data Integrity** | 세션/태스크 데이터 손실 방지 | DB 트랜잭션 필수 |
| **Transparency** | 에러/충돌 숨기지 않음 | 로깅 철저히 |
| **Harm Prevention** | 시스템 손상 작업 금지 | HITL 승인 시스템 |
| **Respect Boundaries** | 권한 범위 초과 금지 | 에이전트별 권한 분리 |

---

## 3. Agent Roles - AOS Dashboard

### 3.1 Primary Agent (Lead Orchestrator)

**Core Responsibilities:**
- 태스크 분해 및 서브에이전트 할당
- LangGraph 그래프 조정
- 충돌 해결 및 통합
- 사용자 커뮤니케이션

**Exclusive Permissions:**
- 공유 파일 수정 (orchestrator/, models/)
- 충돌하는 변경사항 병합
- HITL 승인 최종 결정
- 최종 결과물 프레젠테이션

### 3.2 Secondary Agents (Specialists)

| Agent | Domain | Workspace | Tools |
|-------|--------|-----------|-------|
| `web-ui-specialist` | React Web UI | `src/dashboard/` | Edit, Read, Write |
| `backend-integration-specialist` | FastAPI/LangGraph | `src/backend/` | Edit, Read, Bash |
| `test-automation-specialist` | Vitest/Pytest | `tests/` | Edit, Read, Bash |
| `performance-optimizer` | 성능 최적화 | All | Read, Grep, Bash |
| `code-simplifier` | 리팩토링 | All | Read, Grep, Edit |

**Restrictions:**
- 다른 에이전트가 락한 파일 수정 불가
- 전략적 결정 불가 (Layer 2 제한)
- 범위 변경 시 승인 필요

---

## 4. Resource Management

### 4.1 Working Directory Isolation

```
/Users/younghwankang/Work/Agent-System/
├── src/
│   ├── backend/          # Secondary Agent B (Backend Specialist)
│   │   ├── api/          # FastAPI 라우터
│   │   ├── orchestrator/ # LangGraph (Primary 조정)
│   │   ├── services/     # 서비스 레이어
│   │   └── models/       # 데이터 모델
│   └── dashboard/        # Secondary Agent A (UI Specialist)
│       └── src/
│           ├── components/
│           ├── pages/
│           ├── stores/   # Zustand
│           └── hooks/
├── tests/
│   ├── backend/          # Secondary Agent C (Test Specialist)
│   └── dashboard/
├── .temp/
│   ├── agent_a/          # UI 에이전트 작업 공간
│   ├── agent_b/          # Backend 에이전트 작업 공간
│   └── integration/      # Primary 통합 공간
└── dev/
    └── active/           # Dev Docs 작업 디렉토리
```

### 4.2 Tool Access Matrix

| Tool | Primary | Secondary | Notes |
|------|---------|-----------|-------|
| Bash | Full | Restricted | 시스템 변경 금지 |
| Edit | Full | Workspace only | 할당된 워크스페이스만 |
| Read | Full | Full | 읽기는 안전 |
| Write | Full | Workspace only | 락 필요 |
| Grep | Full | Full | 병렬 안전 |
| Task (agents) | Full | Restricted | Primary 승인 필요 |

### 4.3 File Lock Protocol

```json
{
  "operation": "file_lock_request",
  "agent": "web-ui-specialist",
  "file": "src/dashboard/src/stores/orchestration.ts",
  "operation_type": "write",
  "estimated_duration": "30s",
  "timestamp": "2025-01-26T14:30:00Z"
}
```

**Lock States:**
- `Available`: 리소스 사용 가능
- `Locked`: 에이전트가 독점 접근 중
- `Queued`: 여러 에이전트 대기 중 (FIFO)
- `Released`: 작업 완료, 락 해제

---

## 5. Skill Auto-Invocation Protocol

### 5.1 AOS Dashboard Skill Mapping

| File Operation | Required Skill | Timing |
|----------------|---------------|--------|
| React Web UI | `react-web-development` | 컴포넌트 생성 전 |
| Zustand Store | `react-web-development` | 스토어 수정 전 |
| FastAPI Endpoint | `backend-development` | API 추가 전 |
| LangGraph Node | `langgraph-patterns` | 노드 생성 전 |
| Vitest Test | `test-automation` | 테스트 작성 전 |
| Pytest Test | `test-automation` | 테스트 작성 전 |

### 5.2 Skill Selection Logic

```python
def select_skill(task_type: str) -> str:
    skill_map = {
        'ui_component': 'react-web-development',
        'page': 'react-web-development',
        'store': 'react-web-development',
        'api_endpoint': 'backend-development',
        'langgraph_node': 'langgraph-patterns',
        'test': 'test-automation',
        'performance': 'performance-optimization',
    }
    return skill_map.get(task_type, 'general')
```

---

## 6. Parallel Execution Patterns

### 6.1 Pattern: Fan-Out / Fan-In

```
Primary (Lead Orchestrator)
  ↓ [Fan-Out: 독립 서브태스크 분배]
┌─────────────────────────────────────┐
│ web-ui-specialist (UI 작업)          │
│ backend-integration-specialist (API) │
│ test-automation-specialist (테스트)  │
└─────────────────────────────────────┘
  ↓ [Fan-In: 결과 수집 및 통합]
Primary (통합 및 검증)
```

**효율 향상**: ~2-3x 속도 향상

### 6.2 Example: 새 기능 구현

**User Request:** "Claude Sessions 페이지에 필터 기능 추가"

**Layer 4 (Executive Function) - Task Decomposition:**

```json
{
  "primary_task": "Claude Sessions 필터 기능 구현",
  "subtasks": [
    {
      "agent": "backend-integration-specialist",
      "task": "API에 status/sort_by 쿼리 파라미터 추가",
      "skill": "backend-development",
      "output": "src/backend/api/claude_sessions.py"
    },
    {
      "agent": "web-ui-specialist",
      "task": "SessionList에 필터 UI 컴포넌트 추가",
      "skill": "react-web-development",
      "output": "src/dashboard/src/components/claude-sessions/SessionFilter.tsx"
    },
    {
      "agent": "test-automation-specialist",
      "task": "필터 기능 테스트 작성",
      "skill": "test-automation",
      "output": "tests/dashboard/SessionFilter.test.tsx"
    }
  ]
}
```

---

## 7. HITL (Human-in-the-Loop) Integration

### 7.1 Risk Classification

| Risk Level | Actions | Approval |
|------------|---------|----------|
| LOW | Read, Grep, Glob | 자동 |
| MEDIUM | Write, Edit (assigned workspace) | 자동 |
| HIGH | Bash (system), Delete, DB 수정 | 승인 필요 |
| CRITICAL | Deploy, 프로덕션 변경 | 반드시 승인 |

### 7.2 Approval Flow

```python
if tool_risk_level == "HIGH":
    approval_request = {
        "approval_id": str(uuid4()),
        "agent": current_agent,
        "action": tool_name,
        "parameters": tool_params,
        "justification": "이유 설명",
        "timestamp": datetime.now()
    }
    await wait_for_approval(approval_request)
```

---

## 8. Error Handling and Recovery

### 8.1 Checkpoint Strategy

```json
{
  "checkpoints": [
    {
      "id": "cp_001",
      "timestamp": "T0:00",
      "state": "Initial state",
      "files_snapshot": [],
      "validation": "passed"
    },
    {
      "id": "cp_002",
      "timestamp": "T5:00",
      "state": "Backend API complete",
      "files_snapshot": ["src/backend/api/claude_sessions.py"],
      "validation": "pytest passed"
    }
  ]
}
```

### 8.2 Rollback Procedure

1. **Emergency halt** - 모든 에이전트 정지
2. **Lock release** - 모든 파일 락 해제
3. **Checkpoint restore** - 마지막 유효 체크포인트로 복원
4. **User notification** - 인시던트 리포트 전송

---

## 9. Quality Gates

### 9.1 Pre-Execution Validation

- [ ] 태스크 분해 검토 완료
- [ ] 파일 충돌 없음 확인
- [ ] 모든 에이전트 자기 평가 완료
- [ ] 롤백 체크포인트 정의됨
- [ ] 윤리적 검토 통과

### 9.2 Post-Execution Validation

- [ ] 모든 서브태스크 완료
- [ ] 타입 체크 통과 (`npm run type-check`, `mypy`)
- [ ] 린트 통과 (`npm run lint`, `ruff`)
- [ ] 테스트 통과 (`npm test`, `pytest`)
- [ ] 커버리지 목표 달성 (75%+)

---

## 10. Quick Reference

### Agent Decision Matrix

| Situation | Primary | Secondary |
|-----------|---------|-----------|
| Ethical concern | Invoke veto | Escalate |
| Task exceeds capability | Reassign | Decline |
| File locked | Wait/abort | Wait |
| Tool failure | Retry | Report |

### Tool Call Cheat Sheet

```bash
# Skill invocation
Skill react-web-development    # UI 작업
Skill backend-development      # Backend 작업
Skill test-automation          # 테스트 작성

# Task agent invocation (parallel)
Task
  description: "Implement feature X"
  subagent_type: "web-ui-specialist"
  prompt: "Create SessionFilter component with Tailwind CSS"

# Verification
/verify-app                    # 전체 검증
/check-health                  # 헬스 체크
```

---

## Document Control

**Change Log:**

| Version | Date | Changes |
|---------|------|---------|
| 3.0 | 2025-01-03 | ACE Framework Integration |
| 3.0.1 | 2025-01-03 | LiveMetro Adaptation |
| 3.1.0 | 2025-01-26 | **AOS Dashboard Adaptation**: React Web + Python Backend, LangGraph, HITL Integration |

**Distribution:**
- AOS Dashboard Development Team
- Claude Code agents working on AOS
- Multi-agent orchestration projects
