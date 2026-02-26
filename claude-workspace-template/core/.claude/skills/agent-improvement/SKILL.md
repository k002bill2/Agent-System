---
name: agent-improvement
description: Self-improvement loop for multi-agent workflows. Diagnose failures, improve tool descriptions, and learn from success/failure patterns.
type: meta
priority: low
triggers:
  keywords:
    - improvement
    - failure
    - diagnose
    - optimize
    - benchmark
  patterns:
    - "(improve|optimize).*?(agent|workflow)"
    - "(diagnose|analyze).*?(failure|error)"
---

# Agent Self-Improvement

## Purpose

Enable continuous improvement of multi-agent workflows through:
- Failure pattern analysis
- Tool description optimization
- Success pattern recognition
- Performance benchmarking

**Reference**: Anthropic achieved 40% faster task completion through LLM-based tool description improvements.

## Improvement Cycle

```
┌─────────────────────────────────────────────────┐
│                                                 │
│   1. COLLECT                                    │
│   └── Gather traces from completed sessions     │
│                                                 │
│   2. ANALYZE                                    │
│   └── Identify failure patterns & bottlenecks  │
│                                                 │
│   3. DIAGNOSE                                   │
│   └── Use LLM to understand root causes        │
│                                                 │
│   4. IMPROVE                                    │
│   └── Update tool descriptions & agent prompts │
│                                                 │
│   5. VALIDATE                                   │
│   └── Test improvements on similar tasks       │
│                                                 │
│   6. DEPLOY                                     │
│   └── Roll out to all agents                   │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Data Collection

### Success/Failure Patterns

Store in `.temp/improvement/patterns/`:

```json
{
  "pattern_id": "pat_001",
  "type": "failure|success",
  "frequency": 5,
  "context": {
    "task_type": "ui_component_creation",
    "agent": "frontend-specialist",
    "phase": "implementation"
  },
  "description": "Agent often misses accessibility labels",
  "examples": [
    {
      "session_id": "sess_abc",
      "file": "ProductCard.tsx",
      "issue": "Missing accessibilityLabel on TouchableOpacity"
    }
  ],
  "proposed_fix": "Add explicit reminder in agent prompt",
  "status": "identified|proposed|implemented|validated"
}
```

### Tool Usage Patterns

```json
{
  "tool": "read",
  "usage_count": 1523,
  "success_rate": 0.98,
  "avg_duration_ms": 45,
  "common_errors": [
    {
      "error": "File not found",
      "frequency": 23,
      "cause": "Path alias not resolved"
    }
  ],
  "improvement_opportunities": [
    "Add path alias resolution hint to tool description"
  ]
}
```

## Analysis Operations

### 1. Failure Analysis

**Input**: Session traces with failures
**Output**: Categorized failure patterns

```markdown
## Failure Analysis Report

### Category 1: Agent Boundary Violations
- Frequency: 12 occurrences
- Pattern: UI agent attempting to modify services
- Root Cause: Task boundaries not clear in delegation
- Fix: Add explicit "DO NOT" list to delegation template

### Category 2: Missing Dependencies
- Frequency: 8 occurrences
- Pattern: UI agent starts before types available
- Root Cause: Dependency order not enforced
- Fix: Add dependency check before spawning

### Category 3: Tool Misuse
- Frequency: 5 occurrences
- Pattern: Using grep instead of read for known files
- Root Cause: Tool descriptions don't clarify when to use each
- Fix: Update tool descriptions with decision criteria
```

### 2. Bottleneck Analysis

**Input**: Session metrics
**Output**: Performance bottlenecks

```markdown
## Bottleneck Analysis

### Bottleneck 1: Sequential Agent Spawning
- Impact: 40% time overhead
- Pattern: Agents spawned one at a time
- Fix: Spawn independent agents in parallel

### Bottleneck 2: Excessive Iterations
- Impact: 2x token usage
- Pattern: Average 3.2 iterations per task
- Fix: Improve initial task decomposition

### Bottleneck 3: Quality Gate Failures
- Impact: 25% rework
- Pattern: TypeScript errors on first integration
- Fix: Add pre-integration type check
```

## Improvement Actions

### Tool Description Updates

**Before:**
```
Read: Reads a file from the filesystem
```

**After:**
```
Read: Reads a file from the filesystem.
- Use when you know the exact file path
- Prefer over grep for reading specific known files
- Use path aliases (@components, @services)
- Returns line-numbered content
```

### Agent Prompt Updates

**Before:**
```
You are a frontend specialist...
```

**After:**
```
You are a frontend specialist...

CRITICAL REMINDERS:
- Always add accessibilityLabel to interactive elements
- Use memo() for components with complex props
- Check design token constants for theme colors
```

### Delegation Template Updates

**Before:**
```
### Task Boundaries
- DO NOT modify services
```

**After:**
```
### Task Boundaries (EXPLICIT)
Files you CAN modify:
- src/components/**
- src/screens/**

Files you CANNOT modify:
- src/services/** (backend agent)
- src/models/** (shared types)
- **/__tests__/** (test agent)

STOP if you need to modify excluded files.
```

## Validation Protocol

### Before Deployment

1. **Identify test cases**
   - Find similar past tasks
   - Create synthetic test scenarios

2. **Run A/B comparison**
   - Original prompts vs improved prompts
   - Measure: success rate, iterations, tokens, time

3. **Quality threshold**
   - Must improve at least one metric
   - Must not regress any metric by >5%

### Validation Report

```markdown
## Improvement Validation

### Change: Added accessibility reminder to frontend-specialist

### Test Results
| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Accessibility issues | 12% | 2% | -83% |
| Success rate | 88% | 96% | +9% |
| Token usage | 45K | 47K | +4% |

### Verdict: APPROVE
Accessibility issues reduced significantly with minimal token overhead.
```

## Storage Structure

```
.temp/improvement/
├── patterns/
│   ├── failures/
│   │   └── pat_{id}.json
│   └── successes/
│       └── pat_{id}.json
├── proposals/
│   └── prop_{id}.md
├── validations/
│   └── val_{id}.json
└── history/
    └── {date}/
        └── changes.json
```

## Integration with Workflow

### Periodic Review (Weekly)

```markdown
1. Aggregate traces from past week
2. Run failure analysis
3. Generate improvement proposals
4. Prioritize by impact x frequency
5. Implement top 3 improvements
6. Validate before merge
```

### Continuous Learning (Per Session)

```markdown
1. After each session:
   - If failed: Add to failure patterns
   - If succeeded but slow: Add to bottleneck analysis
   - If succeeded optimally: Add to success patterns

2. Check pattern thresholds:
   - If failure pattern frequency > 5: Trigger improvement proposal
```

## Metrics to Track

### Agent Performance

| Metric | Target | Current | Trend |
|--------|--------|---------|-------|
| Success rate | >95% | 92% | up |
| Avg iterations | <2 | 2.3 | flat |
| Token efficiency | <80K | 75K | down |
| Time to complete | <10min | 12min | up |

### Improvement Impact

| Change | Implemented | Impact |
|--------|-------------|--------|
| Accessibility reminder | 2025-01-01 | -83% issues |
| Tool description update | 2025-01-02 | +5% success |
| Delegation template | 2025-01-03 | -20% iterations |

## Best Practices

### 1. Small, Targeted Changes
- One improvement at a time
- Clear before/after comparison
- Rollback plan ready

### 2. Data-Driven Decisions
- Require frequency > 5 before acting
- Validate with real tasks
- Measure actual impact

### 3. Preserve What Works
- Don't change successful patterns
- Document why changes were made
- Keep history for rollback

### 4. Human Review
- Major changes require approval
- Edge cases need human judgment
- Balance automation with oversight

---

## Quick Commands

```bash
# View failure patterns
cat .temp/improvement/patterns/failures/*.json | jq '.description'

# Count patterns by type
ls .temp/improvement/patterns/failures/ | wc -l

# View pending proposals
cat .temp/improvement/proposals/*.md

# Check improvement history
cat .temp/improvement/history/*/changes.json | jq '.'
```

---

## Eval System Integration

### Eval-Driven Improvement Cycle

Use evaluation results (if you have an eval system configured) to improve agents.

```
┌──────────────────────────────────────────────────────────┐
│  EVAL-DRIVEN IMPROVEMENT CYCLE                           │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  1. RUN EVALS                                            │
│  └── Execute eval tasks against agents                   │
│                                                          │
│  2. ANALYZE METRICS                                      │
│  └── Identify tasks with pass@k < 0.8                   │
│                                                          │
│  3. DIAGNOSE FAILURES                                    │
│  └── Review grader feedback & transcripts               │
│                                                          │
│  4. PROPOSE IMPROVEMENTS                                 │
│  └── Agent prompts, rubrics, task definitions           │
│                                                          │
│  5. VALIDATE CHANGES                                     │
│  └── Re-run evals on affected tasks                     │
│                                                          │
│  6. DEPLOY IF IMPROVED                                   │
│  └── Update agent definitions                           │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Low-Performance Task Analysis

Analyze tasks with pass@k < 0.8:

```markdown
## Low-Performance Task Analysis

### Task: task_ui_002 (pass@3: 0.67)

**Failure Patterns**:
- Run 1: Accessibility label missing (grader: has_accessibility_label FAIL)
- Run 3: TypeScript error (grader: typescript_compiles FAIL)

**Root Causes**:
- Agent prompt lacks explicit accessibility requirements
- No accessibility examples in reference files

**Improvement Proposals**:
1. Add accessibility checklist to agent prompt
2. Add accessibility implementation examples to reference files
3. Increase accessibility weight in code-quality rubric
```

### Grader Feedback Utilization

Extract repeating patterns from LLM grader feedback:

```json
{
  "pattern_id": "eval_pat_001",
  "source": "eval_grader",
  "task_category": "ui_component",
  "frequency": 5,
  "feedback_pattern": "Performance could be improved with memo()",
  "proposed_fix": {
    "target": "frontend-specialist",
    "change": "Add memo() reminder to CRITICAL REMINDERS section"
  }
}
```

### Rubric Calibration

Analyze discrepancies between LLM grading and code-based grading:

```markdown
## Rubric Calibration

### Issue: Performance Score Discrepancy
- Code check: PASS (no memo() check)
- LLM evaluation: 3/5 (deducted for missing memo())

### Resolution:
1. Add `has_memo` check to code grading
2. Or adjust LLM rubric to make memo() a recommendation, not requirement

### Apply:
Update rubric definition files accordingly
```

### Eval Integration Metrics

| Metric | Target | Current | Goal |
|--------|--------|---------|------|
| Average pass@1 | All tasks | 0.85 | 0.90 |
| Average pass@3 | All tasks | 0.92 | 0.95 |
| Low-performance tasks | pass@3 < 0.8 | 3 | 0 |
| LLM average score | All tasks | 0.78 | 0.85 |

---

**Version**: 1.1 | **Last Updated**: 2025-01-10 | **Eval Integration Added**
