---
description: Restore saved context from dev/active to resume work
---

# Resume

Restore the previous session's context after `/compact` or `/clear`.

## Instructions

Execute the following steps in order:

### Step 1: Scan Active Projects

```bash
ls -la dev/active/ 2>/dev/null || echo "No active projects found"
```

### Step 2: Display Project List

If active projects exist, display them:

```
---
ACTIVE PROJECTS
---

[#] [project-name]
    Status: [status]
    Updated: [last update]
    Progress: [progress]

---
```

### Step 3: Select Project

- If only 1 project: auto-select
- If 2 or more: ask the user to choose

### Step 4: Load Context

Read the selected project's files:
- `*-context.md`: Background, progress, session history
- `*-tasks.md`: Todo list, priorities

### Step 5: Output Context Summary

```
---
CONTEXT RESTORED: [project-name]
---

## Overview
[Project overview]

## Current State
- Progress: [progress]
- Last Session: [last session summary]
- Blockers: [blockers if any]

## Pending Tasks (Top 5)
1. [ ] [task 1]
2. [ ] [task 2]
...

## Ready to Continue
Ready to start the next task?

---
```

### Step 6: Restore Todos

Register incomplete items from `*-tasks.md` using the TodoWrite tool.

## Error Handling

If no projects found:

```
---
NO ACTIVE PROJECTS
---

No active projects found in dev/active/.

To start a new project:
1. Describe what you want to work on
2. Use /save-and-compact to save progress later

---
```

---
**Version**: 1.0.0
