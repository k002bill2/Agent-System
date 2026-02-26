---
description: Save context to Dev Docs and run /compact in one command
---

# Save & Compact

Save the current session's context to Dev Docs before compacting.

## Instructions

Execute the following steps in order:

### Step 1: Check Active Projects

```bash
ls dev/active/ 2>/dev/null || echo "No active projects"
```

### Step 2: Update Dev Docs

If an active project exists, update the Context document (`*-context.md`) and Tasks document (`*-tasks.md`):

**Context document updates:**
- Refresh Last Updated timestamp
- Record work completed this session
- Record discovered issues/blockers
- Specify priority work for next session

**Tasks document updates:**
- Mark completed items with `[x]`
- Add newly discovered tasks
- Adjust priorities

### Step 3: Output Summary

```
---
DEV DOCS SAVED
---

Updated: [project-name]
- Context: [timestamp]
- Tasks: [N completed / M new]

Next: /compact (compress context)

---
```

### Step 4: Compact Guidance

Instruct the user to run `/compact` to compress the context.
(Built-in commands cannot be invoked directly from slash commands.)

## Session Summary Template

```markdown
### [Date] [Time]
- **Completed**: [list of work done]
- **Blockers**: [record if any]
- **Next**: [priority work]
```

---
**Version**: 2.0.0
