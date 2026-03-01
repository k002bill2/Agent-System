# ACE Framework - Enforcement Matrix

Complete mapping of all governance rules across the 4-Pillar model and 6-Layer architecture.

## Matrix Legend

- **P1**: Soft Constraint (prompt/documentation-based, advisory)
- **P2**: Hard Constraint (hook-enforced, automatic)
- **P3**: Boundary Enforcement (workspace/file isolation)
- **P4**: Optimization (analytics, feedback, cross-review)

---

## P1: Soft Constraints (Prompt-Based)

Soft constraints guide agent behavior through instructions. They are not automatically enforced but are expected to be followed.

| ID | Rule | Layer | Source File | Description |
|----|------|-------|-------------|-------------|
| P1-01 | Ethical guidelines | L1 | Agent `.md` files | Each agent includes ethical/safety preamble |
| P1-02 | Project constraints | L2 | `CLAUDE.md` | Tech stack, coding guidelines, debugging rules |
| P1-03 | Quality gates | L2 | `.claude/agents/shared/quality-reference.md` | Coverage thresholds, TypeScript strict, security |
| P1-04 | Effort scaling | L2 | Skill: `parallel-coordinator` | Complexity matrix (Trivial -> Complex) |
| P1-05 | Agent confidence scores | L3 | Skill: `parallel-coordinator` (Layer 3) | Capability matching table |
| P1-06 | Agent-specific gates | L3 | `.claude/agents/shared/quality-reference.md` | Per-agent additional requirements |
| P1-07 | Delegation template | L4 | Skill: `parallel-coordinator` | 4-part format: Objective, Output, Tools, Boundaries |
| P1-08 | Workspace write rules | L5 | Skill: `parallel-coordinator` (Layer 5) | Agent -> workspace directory mapping |
| P1-09 | Privacy rules | L6 | Skill: `agent-observability` | Track behavior not content |
| P1-10 | Iteration protocol | L4 | Skill: `parallel-coordinator` | Gap detection and follow-up tasks |

---

## P2: Hard Constraints (Hook-Enforced)

Hard constraints are automatically enforced by hooks in `.claude/settings.json`. They block or modify tool calls.

| ID | Rule | Layer | Hook Event | Matcher | File | Action |
|----|------|-------|------------|---------|------|--------|
| P2-01 | Path protection | L1 | PreToolUse | `Edit\|Write` | Inline (settings.json) | Block writes to `.env`, `secrets`, `.git/`, `/prod/` |
| P2-02 | Ethical validator | L1 | PreToolUse | `Bash` | `.claude/hooks/ethicalValidator.js` | Block dangerous shell commands |
| P2-03 | Parallel pre-check | L4 | PreToolUse | `Task` | `.claude/hooks/parallelCoordinator.js` | Extract target files, acquire locks, inject context |
| P2-04 | File lock enforcement | L5 | PreToolUse | `Task` | `.claude/hooks/parallelCoordinator.js` | Block task if file lock conflict detected |
| P2-05 | Stale agent cleanup | L5 | PreToolUse | `Task` | `.claude/hooks/parallelCoordinator.js` | Remove agents idle >10 minutes, release their locks |
| P2-06 | Parallel post-cleanup | L5 | PostToolUse | `Task` | `.claude/hooks/parallelCoordinator.js` | Release locks, move to completedAgents history |
| P2-07 | Context activation | L2 | UserPromptSubmit | `*` | `.claude/hooks/userPromptSubmit.js` | Activate relevant context on prompt submit |
| P2-08 | Workspace guard | L5 | PostToolUse | `Edit\|Write` | `.claude/hooks/workspaceGuard.js` | Warn when src/ written during parallel execution |
| P2-09 | ACE matrix sync | L6 | PostToolUse | `Edit\|Write` | `.claude/hooks/aceMatrixSync.js` | Detect drift between settings.json and enforcement-matrix |
| P2-10 | Link validator | L6 | PostToolUse | `Edit\|Write` | `.claude/hooks/linkValidator.js` | Detect broken relative links in .claude/ markdown files |

---

## P3: Boundary Enforcement (Workspace Isolation)

Boundary constraints restrict where agents can read/write during parallel execution.

| ID | Rule | Layer | Mechanism | Location |
|----|------|-------|-----------|----------|
| P3-01 | Agent workspace isolation | L5 | Directory structure | `.temp/agent_workspaces/{agent-type}/` |
| P3-02 | Primary agent full access | L5 | Convention | Primary writes to `src/**`, `.temp/**` |
| P3-03 | Secondary read-only src/ | L5 | Convention + P1-08 | Secondary agents read `src/`, write workspace only |
| P3-04 | File lock manager | L5 | Lock files | `.temp/coordination/locks/` |
| P3-05 | Conflict resolution | L5 | Manual review | `.temp/integration/conflicts/` |
| P3-06 | Session state isolation | L5 | State file | `.claude/coordination/parallel-state.json` |

### Workspace Directory Map

```
.temp/
├── agent_workspaces/
│   ├── web-ui/                  # web-ui-specialist writes here
│   │   ├── drafts/
│   │   ├── proposals/
│   │   └── metadata.json
│   ├── backend-integration/     # backend-integration-specialist
│   ├── performance-optimizer/   # performance-optimizer
│   └── test-automation/         # test-automation-specialist
├── coordination/
│   ├── locks/                   # File lock files
│   ├── tasks/                   # Task state
│   └── status/                  # Agent status
└── integration/
    ├── checkpoints/             # Merge checkpoints
    └── conflicts/               # Conflict resolution staging
```

---

## P4: Optimization (Analytics & Feedback)

Optimization constraints collect data for improvement without blocking execution.

| ID | Rule | Layer | Hook Event | Matcher | File | Output |
|----|------|-------|------------|---------|------|--------|
| P4-01 | Agent tracing | L6 | PostToolUse | `Task` | `.claude/hooks/agentTracer.js` | `.temp/traces/sessions/*/events.jsonl` |
| P4-02 | Session metrics | L6 | Stop | `*` | `.claude/hooks/stopEvent.js` | Console summary + metrics.json |
| P4-03 | Gemini cross-review | L6 | PostToolUse | `Edit\|Write` | `.claude/hooks/geminiAutoTrigger.js` | `.claude/gemini-bridge/reviews/` |
| P4-04 | Code change analysis | L6 | Stop | `*` | `.claude/hooks/stopEvent.js` | Console self-check questions |
| P4-05 | Verify skill matching | L6 | Stop | `*` | `.claude/hooks/stopEvent.js` | Console suggested verify skills |
| P4-06 | Context monitoring | L6 | Stop | `*` | `.claude/hooks/contextMonitor.js` | Context usage tracking |
| P4-07 | Session checkpoint | L6 | Stop | `*` | `.claude/hooks/stopEvent.js` | Checkpoint via checkpoint-manager |
| P4-08 | OS notification | L6 | Notification | `*` | Inline (settings.json) | macOS notification via osascript |

---

## Layer x Pillar Cross-Reference

| Layer | P1 Soft | P2 Hard | P3 Boundary | P4 Optimization |
|-------|---------|---------|-------------|-----------------|
| L1: Ethical | P1-01 | P2-01, P2-02 | - | - |
| L2: Strategy | P1-02, P1-03, P1-04 | P2-07 | - | - |
| L3: Capability | P1-05, P1-06 | - | - | - |
| L4: Decomposition | P1-07, P1-10 | P2-03 | - | - |
| L5: Execution | P1-08 | P2-04, P2-05, P2-06, P2-08 | P3-01~06 | - |
| L6: Observation | P1-09 | P2-09, P2-10 | - | P4-01~08 |

---

## Adding a New Constraint

### Step 1: Identify Pillar

| If the rule... | Then it's... | Implementation |
|----------------|-------------|----------------|
| Guides behavior through instructions | P1 Soft | Add to agent `.md` or SKILL.md |
| Must be enforced automatically | P2 Hard | Add hook in `settings.json` |
| Restricts file/resource access | P3 Boundary | Update lock manager or workspace rules |
| Collects/analyzes data | P4 Optimization | Add PostToolUse or Stop hook |

### Step 2: Identify Layer

| If it applies to... | Then it's... |
|---------------------|-------------|
| Safety/ethics | L1: Ethical Clearance |
| Project goals/constraints | L2: Global Strategy |
| Agent selection | L3: Capability Matching |
| Task breakdown | L4: Task Decomposition |
| Runtime isolation | L5: Execution & Isolation |
| Metrics/feedback | L6: Observation & Feedback |

### Step 3: Implement

- **P1**: Edit the relevant `.md` file
- **P2**: Create/update hook JS file + register in `.claude/settings.json`
- **P3**: Update workspace rules or lock manager
- **P4**: Add PostToolUse/Stop hook

### Step 4: Register

Add a row to the appropriate pillar table above with:
- **ID**: `P{pillar}-{next_number}` (e.g., P2-08)
- **Rule**: Short name
- **Layer**: L1-L6
- **Source/Hook**: File path or hook event
- **Description/Action**: What it does

---

## Hook Registration Summary

Current hooks in `.claude/settings.json`:

### PreToolUse (3 rules)
1. `Edit|Write` -> Path protection (inline Python)
2. `Bash` -> Ethical validator (`ethicalValidator.js`)
3. `Task` -> Parallel coordinator pre (`parallelCoordinator.js`)

### PostToolUse (2 rules)
1. `Edit|Write` -> Gemini auto review + Workspace guard + ACE matrix sync + Link validator
2. `Task` -> Agent tracer + Parallel coordinator post

### UserPromptSubmit (1 rule)
1. `*` -> Context activation (`userPromptSubmit.js`)

### Stop (1 rule)
1. `*` -> Context monitor + Session metrics (`contextMonitor.js`, `stopEvent.js`)

### Notification (1 rule)
1. `*` -> OS notification (inline osascript)

---

**Version**: 1.0 | **Last Updated**: 2026-03-01
