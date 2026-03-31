---
name: agent-improvement
description: "에이전트 실패 진단 및 개선 전문 스킬. 에이전트 성공률 하락, 특정 태스크 반복 실패, eval 후 저성능 원인 분석, 에이전트 프롬프트/도구 설명 개선이 필요할 때 사용. '에이전트 실패 원인 분석', '성공률 떨어졌어', '왜 실패하는지', '에이전트 개선해줘', '트레이스 분석', '프롬프트 개선' 등의 요청에 트리거. 성능 메트릭 수집(agent-observability)이나 평가 실행(run-eval)이 아닌, 실패 원인 진단과 구체적 개선안 제시에 특화."
---

# Agent Improvement

## Overview

Diagnose agent failures and propose targeted improvements. Closes the feedback loop between observation (tracing) and action (prompt/skill refinement).

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

**REQUIRED:** Use `superpowers:agent-observability` for reading trace data and understanding event formats.

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

## Common Mistakes

| Mistake | Correction |
|---------|-----------|
| Proposing vague improvements like "improve the prompt" | Always specify exact file path, old content, and new content for each change |
| Fixing symptoms instead of root causes (e.g., adding retries for XML tool output) | Trace back to why the failure happens — use `general-purpose` subagent_type, not retries |
| Skipping re-evaluation after applying fixes | Always run `/run-eval` or a trial agent task to verify the improvement works |
| Analyzing only the latest session when the pattern is intermittent | Check multiple sessions in `.temp/traces/sessions/` to confirm patterns |
| Changing agent prompts without updating quality-reference.md | Keep agent prompts and shared quality standards in sync |

## References

- Trace data: `.temp/traces/sessions/*/events.jsonl`
- Eval results: `.claude/evals/results/`
- Agent definitions: `.claude/agents/*.md`
- Quality reference: `.claude/agents/shared/quality-reference.md`
- Observability skill: `.claude/skills/agent-observability/SKILL.md`
