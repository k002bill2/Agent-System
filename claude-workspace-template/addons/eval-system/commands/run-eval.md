---
description: Run AI agent evaluation tasks and calculate pass@k metrics
allowed-tools: Read, Grep, Glob, Bash
---

# AI Agent Evaluation Runner

Systematically evaluate AI agent performance and calculate pass@k metrics.

## Usage

```bash
# Single task evaluation
/run-eval task_001

# Evaluate by category
/run-eval --category ui_component
/run-eval --category service
/run-eval --category bug_fix

# Evaluate all tasks
/run-eval --all

# Run k times (for pass@k calculation)
/run-eval task_001 --k=3
/run-eval --all --k=3

# Use a specific agent
/run-eval task_001 --agent=general-purpose
```

## Execution Steps

### 1. Parse Arguments
Parse task ID or options from `$ARGUMENTS`:

```markdown
## Argument Parsing

Input: $ARGUMENTS

- task_id: Specific task ID (e.g., task_001)
- --category: Category filter (ui_component, service, bug_fix, refactor)
- --all: Run all tasks
- --k: Number of repetitions (default: 1)
- --agent: Specific agent to use (optional)
```

### 2. Load Task Definitions
Read YAML files from `.claude/evals/tasks/`:

```bash
# Single task
cat .claude/evals/tasks/task_001.yaml

# By category
grep -l "category: ui_component" .claude/evals/tasks/*.yaml

# All tasks
ls .claude/evals/tasks/*.yaml | grep -v schema | grep -v _templates
```

### 3. Execute Evaluation
Invoke the eval-task-runner agent:

```markdown
Task(eval-task-runner):
  task_id: task_001
  k: 3
  agent: general-purpose (optional)
```

### 4. Save Results
Store results in `.claude/evals/results/{date}/`.

### 5. Output Summary

```markdown
# Evaluation Result: task_001

## Run Summary
| Run | Score | Result | Duration |
|-----|-------|--------|----------|
| Run 1 | 0.85 | PASS | 8m 12s |
| Run 2 | 0.72 | PASS | 11m 45s |
| Run 3 | 0.65 | FAIL | 15m 00s |

## Metrics
- **pass@1**: 1.00 (first attempt succeeded)
- **pass@3**: 1.00 (at least one of 3 succeeded)
- **pass^3**: 0.67 (all 3 succeed probability)
- **Avg Score**: 0.74
- **Success Rate**: 66.7%

## Detailed Feedback
### Code Checks (40%)
- File exists: PASS
- Test exists: PASS
- No forbidden patterns: PASS

### LLM Evaluation (60%)
- Readability: 4/5
- Architecture: 5/5
- Maintainability: 4/5
- Performance: 3/5
- Security: 5/5

## Improvement Suggestions
1. Address performance concerns
2. Improve edge case handling
```

## Batch Evaluation Output

```markdown
# Batch Evaluation Result: ui_component

## Summary
| Task | pass@1 | pass@3 | Avg Score |
|------|--------|--------|-----------|
| task_001 | 1.00 | 1.00 | 0.85 |
| task_002 | 0.67 | 1.00 | 0.78 |
| task_003 | 1.00 | 1.00 | 0.92 |

## Overall Metrics
- Total tasks: 3
- Total runs: 9
- Avg pass@1: 0.89
- Avg pass@3: 1.00
- Overall avg score: 0.85

## Low Performers
1. task_002 - pass@1: 0.67
   - Issue: Failed on first attempt
```

## Result File Location

```
.claude/evals/results/
├── {date}/
│   ├── task_001.json
│   ├── task_002.json
│   └── summary.json
```

## Error Handling

- **Task not found**: "Cannot find task: {task_id}"
- **Timeout**: Record run as FAIL, continue to next run
- **Agent error**: Record error, include in results

## Related Resources

- [eval-task-runner agent](../agents/eval-task-runner.md)
- [eval-grader agent](../agents/eval-grader.md)
- [Task schema](../evals/tasks/schema.yaml)
- [Rubrics](../evals/rubrics/)
