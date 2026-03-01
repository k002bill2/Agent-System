---
name: ace-framework
description: ACE (Autonomous Cognitive Entity) Framework - 4-Pillar governance model for safe, coordinated multi-agent execution. Defines soft constraints (prompts), hard constraints (hooks), boundaries (workspace isolation), and optimization (analytics).
type: governance
priority: critical
version: 1.0
triggers:
  keywords:
    - ACE
    - governance
    - constraint
    - safety
    - boundary
  patterns:
    - "(ACE|governance).*?(framework|model|pillar)"
    - "(soft|hard).*?constraint"
    - "(boundary|isolation).*?(agent|workspace)"
---

# ACE Framework - 4-Pillar Governance Model

## Purpose

ACE Framework is the **governance layer** for AOS multi-agent orchestration. It ensures all agent activity is safe, coordinated, and observable through four complementary enforcement pillars.

This skill is the **single source of truth** for governance policy. Other skills handle execution details:
- **parallel-coordinator**: Layer 4-5 execution (task decomposition, workspace isolation)
- **agent-observability**: Layer 6 tracing (metrics, events, diagnostics)
- **verification-loop**: Quality gate enforcement (type check, lint, test, build)

## 4-Pillar Architecture

```
+------------------------------------------------------------------+
|                    ACE GOVERNANCE MODEL                           |
+------------------------------------------------------------------+
|                                                                    |
|  P1: SOFT CONSTRAINTS        P2: HARD CONSTRAINTS                 |
|  (Prompt-based)              (Hook-enforced)                      |
|  +-----------------------+   +--------------------------+         |
|  | Agent system prompts  |   | PreToolUse hooks         |        |
|  | SKILL.md guidelines   |   | - Path protection        |        |
|  | Delegation templates  |   | - Ethical validator       |        |
|  | Quality references    |   | - Parallel coordinator   |        |
|  +-----------------------+   +--------------------------+         |
|                                                                    |
|  P3: BOUNDARY ENFORCEMENT    P4: OPTIMIZATION                     |
|  (Workspace isolation)       (Analytics & feedback)               |
|  +-----------------------+   +--------------------------+         |
|  | Agent workspace dirs  |   | PostToolUse hooks        |        |
|  | File lock manager     |   | - Gemini cross-review    |        |
|  | Read-only src/ rule   |   | - Agent tracing          |        |
|  | Conflict resolution   |   | Stop event metrics       |        |
|  +-----------------------+   +--------------------------+         |
|                                                                    |
+------------------------------------------------------------------+
```

## Layer Architecture

### Layer 1: Ethical Clearance

**Purpose**: Prevent harmful, unsafe, or policy-violating actions before execution begins.

| Pillar | Enforcement | File |
|--------|------------|------|
| P1 Soft | Agent prompts include ethical guidelines | Agent `.md` files |
| P2 Hard | `ethicalValidator.js` blocks dangerous Bash commands | `.claude/hooks/ethicalValidator.js` |
| P2 Hard | Path protection blocks `.env`, `secrets`, `.git/`, `/prod/` | `.claude/settings.json` (PreToolUse) |

**Checklist**:
- [ ] No operations on protected paths (`.env`, `secrets`, `.git/`, `/prod/`)
- [ ] No destructive shell commands without user approval
- [ ] API rate limits respected
- [ ] User privacy preserved (no indefinite tracking)

### Layer 2: Global Strategy

**Purpose**: Align all agent activity with the user's stated goal, success criteria, and constraints.

| Pillar | Enforcement | File |
|--------|------------|------|
| P1 Soft | CLAUDE.md project constraints | `CLAUDE.md` |
| P1 Soft | Quality gate requirements | `.claude/agents/shared/quality-reference.md` |
| P1 Soft | Effort scaling matrix | Skill: `parallel-coordinator` |

**Checklist**:
- [ ] User goal clearly defined
- [ ] Success criteria measurable (coverage >75%, <300ms response)
- [ ] Constraints documented (rate limits, no breaking changes)
- [ ] Complexity correctly assessed (Trivial/Simple/Moderate/Complex)

### Layer 3: Agent Capability Matching

**Purpose**: Assign tasks only to agents with demonstrated competence.

| Pillar | Enforcement | File |
|--------|------------|------|
| P1 Soft | Agent confidence scores in skill descriptions | Skill: `parallel-coordinator` (Layer 3 table) |
| P1 Soft | Agent-specific quality gates | `.claude/agents/shared/quality-reference.md` |
| P4 Optimization | Historical success rates in session metrics | `.temp/traces/sessions/*/metrics.json` |

**Checklist**:
- [ ] Agent type matches task domain (UI -> web-ui, API -> backend-integration)
- [ ] Confidence score >0.70 for assigned task
- [ ] Agent has required tool access (Edit, Write, Bash, etc.)

### Layer 4: Task Decomposition

**Purpose**: Break work into independent, non-overlapping subtasks with clear boundaries.

| Pillar | Enforcement | File |
|--------|------------|------|
| P1 Soft | Delegation template (4-part format) | Skill: `parallel-coordinator` |
| P2 Hard | `parallelCoordinator.js` pre-hook validates task | `.claude/hooks/parallelCoordinator.js` |
| P3 Boundary | Target file extraction prevents overlap | `.claude/hooks/parallelCoordinator.js` |

**Delegation is handled by**: Skill `parallel-coordinator` (Task Delegation Template section)

**Checklist**:
- [ ] Each subtask has: Objective, Output Format, Tools & Sources, Boundaries
- [ ] No two agents writing to the same file
- [ ] Dependencies explicitly declared (backend -> UI -> tests)
- [ ] Workspace directories assigned per agent

### Layer 5: Execution & Isolation

**Purpose**: Enforce workspace boundaries during parallel execution.

| Pillar | Enforcement | File |
|--------|------------|------|
| P2 Hard | File lock acquisition before Task execution | `.claude/hooks/parallelCoordinator.js` |
| P3 Boundary | Agent workspaces under `.temp/agent_workspaces/` | `.claude/coordination/` |
| P3 Boundary | Lock conflict -> task blocked | File lock manager |
| P2 Hard | Stale agent cleanup (10min timeout) | `.claude/hooks/parallelCoordinator.js` |

**Execution details handled by**: Skill `parallel-coordinator` (Layer 5 section)

**Checklist**:
- [ ] Each agent writes only to assigned workspace
- [ ] File locks acquired before write operations
- [ ] Lock conflicts trigger blocking (not silent override)
- [ ] Stale agents cleaned up after 10 minutes

### Layer 6: Observation & Feedback

**Purpose**: Collect metrics for diagnosis, improvement, and accountability.

| Pillar | Enforcement | File |
|--------|------------|------|
| P4 Optimization | `agentTracer.js` logs spawn/completion events | `.claude/hooks/agentTracer.js` |
| P4 Optimization | `stopEvent.js` aggregates session metrics | `.claude/hooks/stopEvent.js` |
| P4 Optimization | `geminiAutoTrigger.js` queues cross-review | `.claude/hooks/geminiAutoTrigger.js` |
| P1 Soft | Privacy rules (track behavior, not content) | Skill: `agent-observability` |

**Tracing details handled by**: Skill `agent-observability`

**Checklist**:
- [ ] Agent spawn/completion events logged
- [ ] Session metrics aggregated on Stop
- [ ] No content logged (only structural data)
- [ ] Metrics fed back to agent-improvement skill

---

## Skill Delegation Map

ACE Framework delegates execution details to specialized skills. **Do not duplicate their content here.**

| Concern | Delegated To | What They Own |
|---------|-------------|---------------|
| Task decomposition & delegation | `parallel-coordinator` | Effort scaling, delegation template, iteration loop, workspace structure |
| Tracing & metrics format | `agent-observability` | Event types, JSONL format, KPIs, privacy rules |
| Build verification | `verification-loop` | tsc, lint, test, build pipeline |
| Quality gates | `quality-reference.md` | Coverage thresholds, TypeScript strict, security checks |
| Agent self-improvement | `agent-improvement` | Failure diagnosis, improvement proposals |

---

## Adding New Constraints

When adding a new governance rule:

1. **Identify the Pillar**:
   - Is it advisory/guiding? -> **P1 Soft** (add to agent prompt or SKILL.md)
   - Must it be enforced automatically? -> **P2 Hard** (add hook in `settings.json`)
   - Does it restrict file/resource access? -> **P3 Boundary** (update lock manager or workspace rules)
   - Does it collect/analyze data? -> **P4 Optimization** (add PostToolUse or Stop hook)

2. **Identify the Layer** (L1-L6): Where in the execution lifecycle does it apply?

3. **Implement**: Create or update the appropriate file.

4. **Register**: Update `references/enforcement-matrix.md` with the new entry.

See [references/enforcement-matrix.md](references/enforcement-matrix.md) for the complete mapping.

---

## Quick Diagnostic

```bash
# 1. Verify no broken ACE references
grep -r "shared/ace-framework" .claude/agents/ | grep -v ".json"

# 2. Check hook registration status
cat .claude/settings.json | python3 -c "
import json, sys
h = json.load(sys.stdin)['hooks']
for event, rules in h.items():
    print(f'{event}: {len(rules)} rule(s)')
    for r in rules:
        print(f'  matcher={r[\"matcher\"]!r} -> {len(r[\"hooks\"])} hook(s)')
"

# 3. Check parallel coordination state
node .claude/hooks/parallelCoordinator.js status

# 4. Verify workspace isolation
ls -la .temp/agent_workspaces/ 2>/dev/null || echo "No active workspaces"

# 5. Check trace sessions
ls -lt .temp/traces/sessions/ 2>/dev/null | head -5 || echo "No trace sessions"
```

---

## Summary

ACE Framework provides **governance**, not execution. It answers:
- **What rules must agents follow?** (Layers 1-3)
- **How are rules enforced?** (4-Pillar model)
- **Where is enforcement implemented?** (Enforcement tables per layer)
- **How do we verify compliance?** (Checklists + Quick Diagnostic)

For **how to actually run parallel agents**, see: Skill `parallel-coordinator`
For **how to trace and diagnose**, see: Skill `agent-observability`
For **how to verify quality**, see: Skill `verification-loop`

---

**Version**: 1.0 | **Last Updated**: 2026-03-01
