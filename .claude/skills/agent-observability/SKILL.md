---
name: agent-observability
description: Production tracing and metrics for multi-agent workflows. Track agent decisions, tool calls, and performance without monitoring conversation content.
type: infrastructure
priority: medium
---

# Agent Observability

## Purpose

Enable systematic diagnosis of multi-agent workflow failures by tracking:
- Agent decision patterns
- Interaction structures
- Performance metrics
- Error patterns

**Important**: Track behavior, not content. Respect user privacy.

## Trace Events

### Event Types

| Event | Trigger | Data Captured |
|-------|---------|---------------|
| `agent_spawned` | Task tool called | agent_type, model, task_summary |
| `task_assigned` | Delegation created | task_id, agent, complexity |
| `tool_called` | Any tool invocation | tool_name, duration_ms |
| `result_received` | Agent completion | agent_id, status, findings_count |
| `decision_made` | Branching point | decision_type, choice, reasoning_length |
| `checkpoint_saved` | Memory save | checkpoint_type, location |
| `error_occurred` | Failure detected | error_type, agent, recoverable |
| `iteration_started` | Gap-filling loop | iteration_number, gaps_count |

### Event Format

```json
{
  "event": "agent_spawned",
  "timestamp": "2025-01-04T12:00:00.000Z",
  "session_id": "sess_abc123",
  "task_id": "task_xyz",
  "data": {
    "agent_type": "mobile-ui-specialist",
    "model": "sonnet",
    "task_summary": "Create StationCard component",
    "complexity": "simple",
    "parent_agent": "lead-orchestrator"
  }
}
```

## Trace Storage

### Directory Structure
```
.temp/traces/
├── sessions/
│   └── sess_{id}/
│       ├── events.jsonl      # Append-only event log
│       ├── metrics.json      # Aggregated metrics
│       └── summary.md        # Human-readable summary
└── archive/
    └── {date}/
        └── sess_{id}.tar.gz
```

### Event Log Format (JSONL)
```
{"event":"session_started","timestamp":"...","session_id":"sess_abc"}
{"event":"agent_spawned","timestamp":"...","session_id":"sess_abc","data":{...}}
{"event":"tool_called","timestamp":"...","session_id":"sess_abc","data":{...}}
```

## Metrics

### Per-Session Metrics

```json
{
  "session_id": "sess_abc123",
  "started_at": "2025-01-04T12:00:00Z",
  "ended_at": "2025-01-04T12:15:00Z",
  "duration_ms": 900000,

  "agents": {
    "spawned": 4,
    "succeeded": 3,
    "failed": 1,
    "by_type": {
      "mobile-ui-specialist": 1,
      "backend-integration-specialist": 1,
      "test-automation-specialist": 1,
      "quality-validator": 1
    }
  },

  "tools": {
    "total_calls": 47,
    "by_tool": {
      "read": 15,
      "edit": 12,
      "grep": 8,
      "bash": 7,
      "write": 5
    }
  },

  "tokens": {
    "estimated_input": 45000,
    "estimated_output": 12000,
    "total": 57000
  },

  "iterations": 2,
  "checkpoints": 3,
  "errors": 1
}
```

### Key Performance Indicators

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| Agent success rate | >90% | <80% | <60% |
| Avg tools per agent | 10-20 | >30 | >50 |
| Iteration count | 1-2 | 3 | >4 |
| Token efficiency | <100K | >150K | >200K |
| Time to completion | <15min | >30min | >60min |

## Tracing Operations

### Start Session
```markdown
Event: session_started
Data:
  - session_id: generated UUID
  - task_description: summary (no content)
  - complexity_assessment: trivial|simple|moderate|complex
  - planned_agents: count
```

### Track Agent Spawn
```markdown
Event: agent_spawned
Data:
  - agent_id: unique ID
  - agent_type: specialist name
  - model: sonnet|opus|haiku
  - task_summary: 10-20 words max
  - dependencies: list of agent_ids to wait for
```

### Track Tool Call
```markdown
Event: tool_called
Data:
  - tool_name: read|edit|grep|etc
  - duration_ms: execution time
  - success: boolean
  - file_count: for file operations
```

### Track Decision
```markdown
Event: decision_made
Data:
  - decision_type: effort_scaling|delegation|iteration|completion
  - choice: what was decided
  - alternatives_considered: count
  - confidence: high|medium|low
```

### Track Error
```markdown
Event: error_occurred
Data:
  - error_type: timeout|validation|integration|tool_failure
  - agent_id: where it occurred
  - recoverable: boolean
  - recovery_action: retry|skip|abort
```

### End Session
```markdown
Event: session_ended
Data:
  - status: completed|partial|failed|aborted
  - deliverables_count: files created/modified
  - quality_gates_passed: boolean
```

## Analysis Patterns

### Failure Diagnosis

When a session fails, analyze:

1. **Error Clustering**
   - Are errors concentrated in one agent?
   - Are they at specific phases?
   - What tool calls preceded failures?

2. **Decision Path**
   - Was complexity correctly assessed?
   - Were agent boundaries clear?
   - Were iterations excessive?

3. **Performance Anomalies**
   - Unusually high tool calls?
   - Long durations for simple tasks?
   - Token usage spikes?

### Success Patterns

Track what works:
- Optimal agent combinations for task types
- Effective delegation patterns
- Successful iteration counts

## Privacy Considerations

**NEVER LOG**:
- Actual file contents
- User messages (beyond classification)
- Code snippets
- Personal information
- API keys or secrets

**ALWAYS LOG**:
- Structural information (file counts, not files)
- Timing information
- Success/failure states
- Tool names (not arguments)
- Agent types (not outputs)

## Integration with Orchestrator

### During Execution
```
Lead Orchestrator responsibilities:
1. Generate session_id at start
2. Log agent_spawned for each Task call
3. Track decision points
4. Log errors with context
5. Save metrics at session end
```

### Post-Execution
```
Analysis workflow:
1. Read session metrics
2. Compare to KPIs
3. Identify anomalies
4. Feed to agent-improvement skill
```

## Example Trace Summary

```markdown
# Session Summary: sess_abc123

## Overview
- Task: Add station favorites feature
- Complexity: Moderate
- Duration: 12m 34s
- Status: COMPLETED

## Agent Activity
| Agent | Tools | Duration | Status |
|-------|-------|----------|--------|
| backend-integration | 15 | 4m 12s | Success |
| mobile-ui | 18 | 5m 45s | Success |
| test-automation | 12 | 2m 15s | Success |
| quality-validator | 4 | 22s | Success |

## Iterations
- Round 1: 3 agents, 2 gaps found
- Round 2: 1 follow-up agent, completed

## Metrics
- Total tool calls: 49
- Estimated tokens: 67,000
- Checkpoints saved: 2
- Errors: 0

## Performance
- Agent success rate: 100%
- Token efficiency: Good (<100K)
- Iteration count: Normal (2)
```

---

## Quick Commands

```bash
# View recent sessions
ls -lt .temp/traces/sessions/

# Read latest session events
tail -100 .temp/traces/sessions/sess_latest/events.jsonl

# View session metrics
cat .temp/traces/sessions/sess_latest/metrics.json

# Archive old sessions
./scripts/archive-traces.sh 7  # Archive sessions older than 7 days
```

---

**Version**: 1.0 | **Last Updated**: 2025-01-04
