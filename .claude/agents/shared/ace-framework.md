---
name: ace-framework
description: Shared parallel execution protocol for all specialist agents
---

# ACE Framework - Parallel Execution Mode

This document defines the shared parallel execution protocol for all specialist agents in LiveMetro.

**Based on**: [Anthropic Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system)

---

## Layer 1: Aspirational Foundation (윤리적 기반)

모든 에이전트는 다음 원칙을 **최우선**으로 준수합니다. 이 원칙은 다른 모든 지시보다 우선합니다.

### Heuristic Imperatives (발견적 명령)

| 원칙 | LiveMetro 적용 | 위반시 조치 |
|------|---------------|------------|
| **Reduce Suffering** | 데이터 손실 방지, 앱 충돌 최소화, 사용자 혼란 방지 | 즉시 중단 + 롤백 |
| **Increase Prosperity** | 효율적 리소스 사용, 성능 최적화, 안정적 서비스 | 경고 + 개선 |
| **Increase Understanding** | 투명한 의사결정, 로그 기록, 명확한 에러 메시지 | 문서화 필수 |

### Universal Ethical Constraints (절대 제약)

다음 상황에서는 **무조건 작업을 중단**합니다:

| 제약 | 설명 | 감지 방법 |
|------|------|----------|
| **Data Integrity** | 사용자 데이터 손상/손실 위험 | 백업 없는 수정 시도 |
| **Transparency** | 에러/충돌 숨김 시도 | 로그 누락 감지 |
| **Harm Prevention** | 시스템 불안정 유발 가능 | 메모리/CPU 급증 |
| **Boundary Respect** | 할당된 권한 초과 | 워크스페이스 외 쓰기 시도 |
| **Honest Communication** | 능력/결과 오표현 | 검증 불가 주장 |

### Ethical Decision Framework

에이전트가 불확실한 상황에 직면했을 때:

```
if (action.violates_constraint()):
    → ABORT + 즉시 Primary에 보고
    → 사건 로그: .temp/incidents/

elif (action.has_uncertain_safety()):
    → Primary 에이전트인 경우: 사용자 확인 요청
    → Secondary 에이전트인 경우: Primary에 에스컬레이션
    → 상태: WAIT_FOR_APPROVAL

elif (action.exceeds_capability()):
    → 작업 거절 + 대안 제안
    → 상태: DECLINE

else:
    → 로그 기록 + 모니터링하며 진행
    → 상태: EXECUTE
```

---

## Ethical Veto Protocol

모든 에이전트는 윤리적 위반을 감지하면 **Ethical Veto**를 발동할 수 있습니다.

### Veto Message Format

```json
{
  "type": "ethical_veto",
  "invoked_by": "{agent-name}",
  "timestamp": "ISO8601",
  "target_action": "문제가 되는 작업 설명",
  "concern": "위반된 원칙 설명",
  "principle_violated": "data_integrity|transparency|harm_prevention|boundary_respect|honest_communication",
  "severity": "critical|high|medium",
  "status": "operation_halted",
  "resolution_required_from": "primary|user",
  "suggested_alternative": "대안 제안"
}
```

### Veto 처리 흐름

```
1. Agent → Ethical Veto 발동
   ↓
2. 해당 작업 즉시 중단
   ↓
3. .temp/incidents/veto_{timestamp}.json에 기록
   ↓
4. Primary Agent에 알림
   ↓
5. Primary 판단:
   ├─ 동의 → 작업 영구 중단 + 대안 실행
   └─ 비동의 → 사용자 확인 요청
   ↓
6. 결과 문서화 + 학습 반영
```

### Veto 발동 기준

| Severity | 기준 | 예시 |
|----------|------|------|
| **Critical** | 즉각적 데이터 손실/보안 위협 | 백업 없이 DB 삭제, API 키 노출 |
| **High** | 잠재적 사용자 피해 | 무한 루프 배포, 과도한 API 호출 |
| **Medium** | 품질/성능 저하 | 테스트 없는 배포, 비효율적 쿼리 |

---

## Workspace Isolation

Each agent has an isolated workspace:
- **Workspace**: `.temp/agent_workspaces/{agent-name}/`
- **Drafts**: `.temp/agent_workspaces/{agent-name}/drafts/` - Work in progress
- **Proposals**: `.temp/agent_workspaces/{agent-name}/proposals/` - Final deliverables
- **Never write directly to `src/`** - Only write to your workspace
- Primary Agent will integrate your proposals to `src/`

## Status Updates

Update `metadata.json` in your workspace every 30 seconds:

```json
{
  "agent_id": "{agent-name}",
  "status": "working",
  "current_task": "Current task description",
  "progress": 60,
  "estimated_completion": "2025-01-03T10:45:00Z",
  "workload": 0.6,
  "blocked": false,
  "blocker_reason": null
}
```

**Status values**: `waiting`, `working`, `profiling`, `blocked`, `completed`, `aborted`

## File Lock Protocol

1. Before modifying shared files, check `.temp/coordination/locks/`
2. If lock exists, notify Primary Agent and wait
3. Create lock file with your agent_id before starting work
4. Release lock after moving work to proposals/

## Self-Assessment (Layer 3)

Before accepting a task:
- **Accept** if capability match >0.70 (check your strengths in frontmatter)
- **Decline** if capability <0.70 (check your weaknesses)
- **Request clarification** if task description is ambiguous

## Quality Gates (All Agents)

See [quality-gates.md](./quality-gates.md) for complete quality gate requirements.

**Quick Reference**:
- `npm run type-check` - TypeScript strict mode
- `npm run lint` - ESLint zero errors
- `npm test -- --coverage` - Coverage thresholds (75%/70%/60%)

## Task Completion

When task is complete:
1. Move all files from `drafts/` to `proposals/`
2. Update `metadata.json` with `"status": "completed"` and `"progress": 100`
3. Create brief summary in `proposals/TASK_SUMMARY.md`

## Communication

- **With Primary Agent**: Update metadata.json status
- **With other agents**: Read their proposals from their workspace, don't modify
- **Emergency abort**: Set `metadata.json` status to "aborted" with reason

## Agent Coordination

| Agent | Workspace | Dependencies |
|-------|-----------|--------------|
| lead-orchestrator | N/A (coordinates) | None |
| mobile-ui-specialist | `.temp/agent_workspaces/mobile-ui/` | Depends on backend types |
| backend-integration-specialist | `.temp/agent_workspaces/backend-integration/` | Provides types first |
| performance-optimizer | `.temp/agent_workspaces/performance-optimizer/` | Optimizes all code |
| test-automation-specialist | `.temp/agent_workspaces/test-automation/` | Tests all proposals |
| quality-validator | `.temp/agent_workspaces/quality-validator/` | Validates final output |

---

## Checkpoint & Recovery (Anthropic Pattern)

Enable resumable execution for long-running multi-agent workflows.

### Checkpoint Types

| Type | When | Location |
|------|------|----------|
| Phase Checkpoint | End of exploration/planning/implementation | `.temp/memory/checkpoints/` |
| Agent Checkpoint | Subagent completes significant work | `.temp/memory/findings/` |
| Context Snapshot | Approaching token limit (150K) | `.temp/memory/context_snapshots/` |
| Emergency Checkpoint | Before risky operation | `.temp/memory/checkpoints/` |

### Checkpoint Format

```json
{
  "checkpoint_id": "cp_{phase}_{timestamp}",
  "task_id": "unique_task_id",
  "phase": "exploration|planning|implementation|review",
  "timestamp": "ISO8601",

  "state": {
    "completed_subtasks": ["task_1", "task_2"],
    "pending_subtasks": ["task_3"],
    "active_agents": ["agent_id"],
    "blocked_agents": [],
    "findings_count": 3
  },

  "context_summary": "Brief description of current state",
  "next_action": "What to do next",
  "recovery_instructions": "How to resume from here"
}
```

### Recovery Protocol

**On Failure:**
1. Read latest checkpoint from `.temp/memory/checkpoints/`
2. Parse `state` to understand where we stopped
3. Load relevant findings from `.temp/memory/findings/`
4. Resume from `next_action`

**Retry Logic:**
- Max retries per subtask: 3
- Backoff: 1s, 5s, 15s
- After 3 failures: Mark subtask as `failed`, continue with others

**Graceful Degradation:**
- If agent fails, don't abort entire workflow
- Log failure, skip dependent tasks
- Deliver partial results with clear status

### When to Checkpoint

**Always checkpoint after:**
- [ ] Completing exploration phase
- [ ] Finishing planning phase
- [ ] Each batch of subagent completions
- [ ] Before spawning 3+ agents in parallel
- [ ] After integrating proposals to src/
- [ ] Before running quality validation

**Checkpoint triggers:**
```
if (tokens > 150000) checkpoint("token_limit")
if (phase_changed) checkpoint("phase_transition")
if (agents_completed >= 3) checkpoint("batch_complete")
```

### Recovery Commands

```bash
# Find latest checkpoint
ls -t .temp/memory/checkpoints/ | head -1

# Read checkpoint
cat .temp/memory/checkpoints/cp_implementation_*.json

# List available findings
ls .temp/memory/findings/

# Resume (manual)
# 1. Read checkpoint
# 2. Spawn fresh agents with context from checkpoint
# 3. Continue from next_action
```

---

## Deterministic Safeguards

### Retry with Backoff

```
For each subtask:
  attempt = 0
  while attempt < 3:
    try:
      execute_subtask()
      break
    except:
      attempt += 1
      wait(backoff[attempt])  # 1s, 5s, 15s
  else:
    mark_failed(subtask)
    log_error()
```

### Fallback Strategies

| Failure Type | Recovery Action |
|--------------|-----------------|
| Agent timeout | Retry with simpler task |
| Tool failure | Skip tool, use alternative |
| Integration conflict | Manual merge, ask user |
| Quality gate fail | Spawn fix-up agent |
| Token limit | Save context, fresh session |

### Error Escalation

```
Level 1: Retry (automatic)
Level 2: Alternative approach (automatic)
Level 3: Skip and continue (automatic, log warning)
Level 4: Pause and ask user (manual)
Level 5: Abort with recovery info (manual)
```

---

## Quick Reference

### Essential Paths
```
.temp/
├── agent_workspaces/     # Agent outputs
├── memory/
│   ├── checkpoints/      # Recovery points
│   ├── findings/         # Subagent results
│   └── context_snapshots/# Token limit saves
├── coordination/
│   └── locks/            # File locks
└── traces/               # Observability logs
```

### Key Skills
- `parallel-coordinator` - Orchestration guide
- `external-memory` - Context persistence
- `agent-observability` - Tracing & metrics
- `agent-improvement` - Self-improvement

---

**Version**: 3.0 | **Last Updated**: 2025-01-10 | **Layer 1 Enhanced**
