# Evaluation System

A framework for systematically evaluating AI agent performance using pass@k metrics.

Based on: [Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) (Anthropic)

## Directory Structure

```
evals/
├── tasks/
│   ├── schema.yaml          # Task definition schema
│   └── *.yaml               # Individual task definitions
├── rubrics/
│   ├── example.yaml          # Example rubric template
│   └── *.yaml               # Custom rubrics
└── results/
    └── {date}/
        ├── task_001.json     # Per-task results
        └── summary.json      # Daily summary
```

## Quick Start

### 1. Define a Task

Create a YAML file in `evals/tasks/` following the schema:

```yaml
id: task_001
name: "Create a user profile component"
category: ui_component
difficulty: medium
description: |
  Create a UserProfile component that displays user info.
acceptance_criteria:
  - TypeScript with proper types
  - Includes test file
  - No `any` types
input:
  prompt: "Create a UserProfile component..."
expected_output:
  files:
    - src/components/UserProfile.tsx
    - src/components/UserProfile.test.tsx
evaluation:
  timeout_minutes: 15
  rubric: example.yaml
  weights:
    code_checks: 40
    llm_grading: 60
  passing_score: 0.7
```

### 2. Define a Rubric (Optional)

Create a YAML rubric in `evals/rubrics/`:

```yaml
name: code-quality
description: Evaluate code quality
criteria:
  - name: readability
    weight: 0.3
    description: Is the code easy to read?
    levels:
      - score: 1
        description: Clear and self-documenting
      - score: 0.5
        description: Acceptable
      - score: 0
        description: Hard to follow
```

### 3. Run Evaluations

```bash
# Single task
/run-eval task_001

# With multiple attempts for pass@k
/run-eval task_001 --k=3

# All tasks in a category
/run-eval --category ui_component

# Full suite
/run-eval --all --k=3
```

## Key Metrics

| Metric | Formula | Meaning |
|--------|---------|---------|
| pass@1 | First attempt success rate | How reliable on first try |
| pass@k | At least 1 success in k tries | Capability ceiling |
| pass^k | All k attempts succeed | Consistency measure |
| avg_score | Mean of all run scores | Overall quality |

## Agents

- **eval-task-runner**: Orchestrates evaluation runs, spawns agents, calculates metrics
- **eval-grader**: Scores agent outputs using code checks and LLM rubric evaluation

## Saturation Monitoring

When pass@k reaches 1.0 for a task, it is "saturated" -- the task no longer differentiates agent quality. Create harder variants or new tasks.

## Tips

- Start with easy tasks and increase difficulty
- Use both positive and negative test cases (bidirectional testing)
- Monitor for saturation -- replace tasks that reach 100% pass rate
- Compare agent versions using pairwise evaluation
- Track regressions across evaluation runs
