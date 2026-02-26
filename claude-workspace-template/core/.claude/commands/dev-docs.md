---
description: Create Dev Docs 3-file system for large tasks
---

# Dev Docs Generation

Generate 3 development documents based on an approved plan.

## Steps

1. **Determine task name**: Confirm the current task name or ask the user
2. **Create directory**: `dev/active/[task-name]/`
3. **Create 3 documents**:
   - `[task-name]-plan.md` — Approved plan
   - `[task-name]-context.md` — Key decisions and context
   - `[task-name]-tasks.md` — Checklist

## Plan Document Template

```markdown
# [Task Name] Plan

## Executive Summary
[1-2 sentence summary of the task]

## Phase 1: [Phase Name]
### Tasks
- [ ] Task 1
- [ ] Task 2

### Technical Decisions
- Decision 1
- Decision 2

## Phase 2: [Phase Name]
### Tasks
- [ ] Task 1
- [ ] Task 2

## Success Metrics
- Metric 1
- Metric 2
```

## Context Document Template

```markdown
# [Task Name] - Context

## Last Updated: [YYYY-MM-DD HH:mm]

## Key Files
- `path/to/file1`
- `path/to/file2`

## Important Decisions
- **[YYYY-MM-DD]**: Decision description

## Current Issues
- [ ] Issue 1
- [x] ~~Resolved issue~~

## Dependencies
- Dependency 1
- Dependency 2

## Next Steps
1. Next step 1
2. Next step 2
```

## Tasks Document Template

```markdown
# [Task Name] - Tasks

## Category 1 (0/N complete)
- [ ] Task 1
- [ ] Task 2

## Category 2 (0/N complete)
- [ ] Task 1
- [ ] Task 2

## Testing (0/N complete)
- [ ] Task 1
- [ ] Task 2

## Documentation (0/N complete)
- [ ] Task 1
- [ ] Task 2
```

## Guidelines

- Add timestamps to all documents
- Use checkbox format for progress tracking
- Maintain per-section completion counts
- Make "Next Steps" clear so the next session can pick up easily

## When to Use

- After a plan is approved in Planning Mode
- Before starting large tasks (5+ subtasks)
- Before context drops below 20%
