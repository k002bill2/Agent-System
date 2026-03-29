---
name: agent-improvement
description: Self-improvement loop for multi-agent workflows. Use after eval runs (/run-eval), after failed agent tasks, during periodic trace reviews, or when agent success rate drops below 90%.
---

# Agent Improvement

## Purpose

Diagnose agent failures and propose targeted improvements.
Closes the feedback loop between observation (tracing) and action (prompt/skill refinement).

## Diagnosis Workflow

```
1. Read events.jsonl
   └─> Filter agent_completed events where success=false

2. Identify failures
   └─> Group by agent_type, description keywords, duration

3. Analyze patterns
   └─> Common failure modes:
       - Tool API misuse (XML tags instead of tool calls)
       - Scope creep (agent exceeds assigned files)
       - Timeout (duration_ms exceeds threshold)
       - Missing context (insufficient prompt detail)

4. Propose fixes
   └─> Generate specific, actionable improvement proposals
```

## Improvement Targets

| Target | File Location | Common Changes |
|--------|--------------|----------------|
| Agent prompts | `.claude/agents/*.md` | Add CRITICAL Tool Usage Rules, clarify scope |
| Skill content | `.claude/skills/*/SKILL.md` | Refine instructions, add examples |
| Delegation templates | Orchestrator prompts | Adjust task descriptions, file assignments |
| Effort scaling | Complexity criteria | Recalibrate agent count thresholds |
| Hook behavior | `.claude/hooks/*.js` | Fix tracing accuracy, adjust timeouts |

## Feedback Loop

```
Diagnosis ──> Proposal ──> Apply ──> Re-evaluate
    ^                                     │
    └─────────────────────────────────────┘
```

1. **Diagnosis**: Parse `.temp/traces/sessions/*/events.jsonl` for failure events
2. **Proposal**: Draft specific changes (file path, old content, new content)
3. **Apply**: Edit the identified files with surgical changes
4. **Re-evaluate**: Run eval tasks or trigger test agents to verify improvement

## Known Failure Patterns

| Pattern | Symptom | Fix |
|---------|---------|-----|
| XML tool output | Agent prints `<tool_call>` text instead of calling tools | Use `general-purpose` subagent_type only |
| Scope violation | Agent edits files outside its assignment | Add explicit file boundaries in delegation |
| Silent failure | Agent reports success but output is incomplete | Add verification step in agent prompt |
| Context starvation | Agent lacks project knowledge | Include relevant SKILL.md or docs in prompt |

## Related Files

- Trace data: `.temp/traces/sessions/*/events.jsonl`
- Eval results: `.claude/evals/results/`
- Agent definitions: `.claude/agents/*.md`
- Quality reference: `.claude/agents/shared/quality-reference.md`
- Observability skill: `.claude/skills/agent-observability/SKILL.md`
