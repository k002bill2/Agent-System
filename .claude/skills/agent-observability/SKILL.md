---
name: agent-observability
description: Production tracing and metrics for multi-agent workflows. Use when debugging agent behavior, analyzing performance/failure patterns, or setting up observability for new agent workflows.
---

# Agent Observability

## Purpose

Trace agent behavior for diagnosis and improvement.
Records structured events for every agent spawn and completion,
enabling performance analysis and failure pattern detection.

## Event Types

### `agent_spawned`

Recorded when a Task tool call is initiated (no `tool_response` yet).

```json
{
  "event": "agent_spawned",
  "timestamp": "2026-03-15T10:00:00.000Z",
  "session_id": "sess_1771345079447",
  "data": {
    "agent_type": "general-purpose",
    "description": "Tasks 7-10: frontend and final verification",
    "model": "default",
    "run_in_background": false
  }
}
```

### `agent_completed`

Recorded when a Task tool call returns with `tool_response`.

```json
{
  "event": "agent_completed",
  "timestamp": "2026-03-15T10:05:00.000Z",
  "session_id": "sess_1771345079447",
  "data": {
    "agent_type": "general-purpose",
    "description": "Tasks 7-10: frontend and final verification",
    "duration_ms": 300000,
    "success": true
  }
}
```

## JSONL Format

Events are stored as newline-delimited JSON (one JSON object per line).
Each line is independently parseable. Append-only writes ensure no data corruption
during concurrent agent execution.

## File Locations

```
.temp/traces/sessions/{sessionId}/
  ├── events.jsonl      # Append-only event log
  ├── metadata.json     # Session summary (agent_count, events_count, last_updated)
  └── metrics.json      # Aggregated metrics (when available)
```

- `sessionId` format: `sess_{timestamp}` (e.g., `sess_1771345079447`)
- Source: `CLAUDE_SESSION_ID` env var, or generated from `Date.now()`

## Privacy Rules

1. **Track behavior, not content** - Record event types, durations, and success/failure only
2. **No prompt logging** - Never record agent prompts or user instructions
3. **No response logging** - Agent output text is not stored in events
4. **Success detection only** - Response text is checked for error keywords in-memory,
   only the boolean `success` result is persisted
5. **No PII** - Session IDs are timestamp-based, no user identifiers

## KPIs

| Metric | Derivation | Target |
|--------|-----------|--------|
| Success Rate | `agent_completed` where `success=true` / total | > 90% |
| Avg Duration | Mean `duration_ms` across completions | Context-dependent |
| Failure Patterns | Group failures by `agent_type` + `description` keywords | Minimize repeats |
| Agent Utilization | `agent_spawned` count per session | Match complexity tier |
| Background Ratio | `run_in_background=true` / total spawns | Optimize for parallelism |

## How It Works

The `agentTracer.js` hook (registered as P2-005 in the ACE enforcement matrix)
intercepts `PostToolUse:Task` events. It reads tool input via stdin, determines
spawn vs completion by checking `tool_response` presence, and appends the
appropriate event to the session's `events.jsonl`.

Duration is calculated by cross-referencing `parallel-state.json` start times.

## Related

- Hook implementation: `.claude/hooks/agentTracer.js`
- ACE Framework: `.claude/skills/ace-framework/SKILL.md` (P4 Optimization pillar)
- Parallel state: `.claude/coordination/parallel-state.json`
- Failure diagnosis: `.claude/skills/agent-improvement/SKILL.md`
