---
name: ace-framework
description: ACE (Autonomous Cognitive Entity) Framework - 4-Pillar governance model for safe, coordinated multi-agent execution. Defines soft constraints (prompts), hard constraints (hooks), boundaries (workspace isolation), and optimization (analytics).
disable-model-invocation: true
---

# ACE Framework

## Purpose

Governance layer for multi-agent orchestration in Agent System.
Ensures safe, predictable, and observable agent behavior through a 4-Pillar model
and a 6-Layer execution lifecycle.

## 4-Pillar Model

| Pillar | Name | Mechanism | Examples |
|--------|------|-----------|----------|
| P1 | Soft Constraints | Prompts, SKILL.md, agent .md files | Role definitions, quality standards, delegation rules |
| P2 | Hard Constraints | hooks.json hooks (pre/post) | Security path blocking, file locking, matrix sync |
| P3 | Boundary | Workspace isolation, file locks | parallel-state.json, worktree separation |
| P4 | Optimization | Analytics, tracing, feedback | events.jsonl, metrics, agent-improvement loop |

### Pillar Details

**P1 - Soft Constraints (Prompts)**
- Agent definitions in `.claude/agents/*.md`
- Skill definitions in `.claude/skills/*/SKILL.md`
- Quality reference in `.claude/agents/shared/quality-reference.md`
- Rules in `.claude/rules/*.md`

**P2 - Hard Constraints (Hooks)**
- Enforced via `hooks.json` entries
- Cannot be bypassed by agents
- Full matrix: `references/enforcement-matrix.md`

**P3 - Boundary (Workspace Isolation)**
- Worktree isolation for complex parallel work
- File-level coordination for parallel agents

**P4 - Optimization (Analytics)**
- Session data in `.temp/traces/sessions/`
- Failure analysis via `agent-improvement` skill

## 6-Layer Execution Lifecycle

| Layer | Name | Responsibility |
|-------|------|---------------|
| L1 | Ethics | Golden principles, security rules, content boundaries |
| L2 | Strategy | Task decomposition, complexity assessment, agent selection |
| L3 | Planning | Delegation templates, file assignment, dependency ordering |
| L4 | Execution | Agent spawning, tool usage, parallel coordination |
| L5 | Verification | Type checks, lint, tests, build validation |
| L6 | Observation | Tracing, metrics collection, drift detection |

### Layer Flow

```
L1 Ethics (always-on constraints)
  └─> L2 Strategy (assess complexity, choose agents)
        └─> L3 Planning (create delegation plan)
              └─> L4 Execution (spawn agents, coordinate)
                    └─> L5 Verification (validate output)
                          └─> L6 Observation (record metrics)
```

## Skill Delegation Map

ACE delegates to specialized skills for each concern:

| Concern | Delegated Skill | Pillar |
|---------|----------------|--------|
| Output verification | `verification-loop` | P1, L5 |
| Quality standards | `quality-reference.md` (shared) | P1 |
| Failure diagnosis | `agent-improvement` | P4 |

## Adding New Constraints

When adding a new governance rule, determine:

1. **Which Pillar?**
   - Can agents ignore it? -> P1 (soft, add to prompts/skills)
   - Must be enforced? -> P2 (hard, add hook to hooks.json)
   - About isolation? -> P3 (boundary, update coordination)
   - About learning? -> P4 (optimization, update tracing/metrics)

2. **Which Layer?**
   - Ethical/safety -> L1 (add to golden-principles or security rules)
   - Task selection -> L2 (update complexity criteria)
   - Delegation logic -> L3 (update delegation templates)
   - Runtime behavior -> L4 (update agent prompts or hooks)
   - Validation -> L5 (add to verification-loop)
   - Monitoring -> L6 (update tracing or metrics)

3. **Where to Implement?**
   - P1: Edit relevant `.md` file (agent, skill, or rule)
   - P2: Add entry to `hooks.json` + update `references/enforcement-matrix.md`
   - P3: Update coordination scripts or parallel-state schema
   - P4: Update tracing or create new metric collector

4. **Verify Consistency**
   - Ensure enforcement-matrix.md row count matches hooks.json entries
   - Test new constraint with a trial agent run

## Reference

- Enforcement Matrix: `references/enforcement-matrix.md`
- Hooks Configuration: `.claude/hooks.json`
- Agent Definitions: `.claude/agents/`
- Quality Standards: `.claude/agents/shared/quality-reference.md`
