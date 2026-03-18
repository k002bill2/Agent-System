# Parallel Coordinator Operations Guide

## Validation Gates

### Pre-Execution Validation

**Before starting parallel execution**:
```bash
# 1. Verify no uncommitted changes in main codebase
git status --porcelain | grep '^[MARC]' && echo "ABORT: Uncommitted changes" && exit 1

# 2. Verify .temp/ directory structure exists
[ -d ".temp/agent_workspaces" ] || mkdir -p .temp/agent_workspaces/{web-ui,backend-integration,performance-optimizer,test-automation}/{drafts,proposals}

# 3. Verify no active file locks from previous execution
rm -f .temp/coordination/locks/*.lock

# 4. Verify agent metadata files are valid
for metadata in .temp/agent_workspaces/*/metadata.json; do
  jq empty "$metadata" || echo "ERROR: Invalid JSON in $metadata"
done
```

**Checklist**:
- [ ] Task decomposition reviewed (Layer 4)
- [ ] Agent capabilities match tasks (Layer 3)
- [ ] No overlapping file assignments
- [ ] Ethical clearance obtained (Layer 1)
- [ ] Rollback checkpoints defined
- [ ] All required skills identified

### Mid-Execution Validation

**During parallel execution (every 30s)**:
```python
def monitor_parallel_execution():
    while execution_in_progress:
        for agent in active_agents:
            # 1. Check progress update
            metadata = read_agent_metadata(agent)
            if metadata.last_updated > 30_seconds_ago:
                log_warning(f"{agent}: No progress update")

            # 2. Check for deadlocks
            if detect_circular_wait(all_locks):
                abort_youngest_lock()

            # 3. Check for ethical concerns
            if metadata.ethical_concerns:
                escalate_to_user(metadata.ethical_concerns)

        sleep(30)
```

**Checklist**:
- [ ] Progress updates received from all agents
- [ ] No deadlocks detected
- [ ] File locks properly acquired/released
- [ ] No ethical concerns raised
- [ ] Agent self-monitoring active

### Post-Execution Validation

**After parallel execution completes**:
```bash
# 1. Collect all proposals
find .temp/agent_workspaces/*/proposals/ -type f

# 2. Run TypeScript type-check (Dashboard)
cd src/dashboard && npx tsc --noEmit
# MUST PASS (zero errors)

# 3. Run ESLint (Dashboard)
cd src/dashboard && npm run lint
# MUST PASS (zero errors)

# 4. Run tests
cd src/dashboard && npm test           # Dashboard (Vitest)
cd src/backend && python -m pytest ../../tests/backend  # Backend (pytest)

# 5. Clean up locks and temp files
rm -f .temp/coordination/locks/*.lock
```

**Checklist**:
- [ ] All subtasks completed successfully
- [ ] TypeScript type-check passed
- [ ] ESLint passed
- [ ] All tests passed
- [ ] Test coverage >75% (statements), >70% (functions), >60% (branches)
- [ ] No orphaned lock files remain

---

## Emergency Abort Procedure

### Abort Conditions

**Immediate abort if**:
- Ethical constraint violation detected (Layer 1)
- Data corruption detected
- Circular dependency (deadlock cannot be resolved)
- User cancellation request
- Critical tool failure

### Abort Procedure

```python
def emergency_abort(reason, severity):
    # 1. Broadcast abort signal
    write_file(".temp/coordination/status/abort_signal", {
        "reason": reason,
        "severity": severity,
        "timestamp": now(),
        "initiated_by": current_agent
    })

    # 2. All agents freeze current state
    for agent in all_agents:
        agent.freeze()
        agent.release_all_locks()

    # 3. Rollback to last validated checkpoint
    latest_checkpoint = find_latest_checkpoint(".temp/integration/checkpoints/")
    if latest_checkpoint:
        restore_from_checkpoint(latest_checkpoint)
    else:
        # No checkpoint → No changes applied to src/
        log_info("No checkpoint found. No rollback needed.")

    # 4. Notify user with incident report
    notify_user({
        "type": "emergency_abort",
        "severity": severity,
        "reason": reason,
        "actions_taken": "Rolled back to last validated state",
        "next_steps": "Please review the reason and provide guidance"
    })
```

---

## Integration Workflow

### Collecting Agent Proposals

```bash
# 1. List all proposals
find .temp/agent_workspaces/*/proposals/ -type f

# Output:
# .temp/agent_workspaces/backend-integration/proposals/bookmark_service.py
# .temp/agent_workspaces/web-ui/proposals/BookmarkToggle.tsx
# .temp/agent_workspaces/test-automation/proposals/test_bookmark_service.py
```

### Reviewing Proposals

```python
def review_proposals():
    for agent_workspace in glob(".temp/agent_workspaces/*/"):
        proposals = glob(f"{agent_workspace}/proposals/*")

        for proposal_file in proposals:
            # 1. Read proposal
            content = read_file(proposal_file)

            # 2. Determine target location in src/
            target = proposal_file.replace(".temp/agent_workspaces/{agent}/proposals/", "src/")

            # 3. Check for conflicts with other proposals
            if conflicts_exist(target):
                move_to_conflict_resolution(proposal_file, target)
                continue

            # 4. Preview changes
            if file_exists(target):
                show_diff(target, proposal_file)

            # 5. Apply proposal (after validation gates pass)
            copy_file(proposal_file, target)
```

### Creating Checkpoints

```bash
# Before applying proposals to src/
mkdir -p .temp/integration/checkpoints/$(date +%Y%m%d_%H%M%S)
cp -r src/ .temp/integration/checkpoints/$(date +%Y%m%d_%H%M%S)/

# After validation gates pass
echo "Checkpoint created: $(date +%Y%m%d_%H%M%S)" >> .temp/integration/checkpoints/log.txt
```

---

## Monitoring & Debugging

### View Agent Status
```bash
cat .temp/agent_workspaces/web-ui/metadata.json | jq '.status, .progress'
cat .temp/agent_workspaces/backend-integration/metadata.json | jq '.status, .workload'
```

### View Active Locks
```bash
ls -la .temp/coordination/locks/
```

### View Task Assignments
```bash
cat .temp/coordination/tasks/*.json | jq '.'
```

### Debug Conflicts
```bash
# List files in conflict resolution
ls -la .temp/integration/conflicts/

# View diff
diff .temp/integration/conflicts/file_agent-a.ts \
     .temp/integration/conflicts/file_agent-b.ts
```

---

## Complete Example: Task Bookmark Feature

### Task Decomposition
```json
{
  "subtasks": [
    {
      "id": "bookmark_service",
      "agent": "backend-integration-specialist",
      "task": "Bookmark service with DB persistence",
      "output": "src/backend/services/bookmark_service.py",
      "dependencies": []
    },
    {
      "id": "bookmark_api",
      "agent": "backend-integration-specialist",
      "task": "Bookmark API endpoints",
      "output": "src/backend/api/bookmarks.py",
      "dependencies": ["bookmark_service"]
    },
    {
      "id": "bookmark_ui",
      "agent": "web-ui-specialist",
      "task": "Bookmark toggle component + bookmark list page",
      "skill": "react-web-development",
      "output": "src/dashboard/src/components/BookmarkToggle.tsx",
      "dependencies": ["bookmark_api"]
    },
    {
      "id": "tests",
      "agent": "test-automation-specialist",
      "task": "Test coverage for bookmark feature",
      "skill": "test-automation",
      "output": "tests/backend/test_bookmark_service.py",
      "dependencies": ["bookmark_service"]
    }
  ]
}
```

### Execution Timeline
```
T0:00 - Primary: Invokes backend-integration-specialist (service)
T0:15 - backend-integration: Completes bookmark_service.py
        → Writes to .temp/agent_workspaces/backend-integration/proposals/

T0:16 - Primary: Invokes backend (API) + test-automation-specialist
        → Both can proceed (service types available)

T0:26 - backend-integration: Completes bookmarks.py (API)
T0:31 - test-automation: Completes test_bookmark_service.py
T0:32 - Primary: Invokes web-ui-specialist (bookmark UI)
T0:47 - web-ui: Completes BookmarkToggle.tsx + BookmarkListPage.tsx

Feature completed in 47 minutes vs ~75 minutes sequential = 1.6x speedup
```

### Integration
```bash
cp .temp/agent_workspaces/backend-integration/proposals/bookmark_service.py src/backend/services/
cp .temp/agent_workspaces/backend-integration/proposals/bookmarks.py src/backend/api/
cp .temp/agent_workspaces/web-ui/proposals/BookmarkToggle.tsx src/dashboard/src/components/
cp .temp/agent_workspaces/test-automation/proposals/test_bookmark_service.py tests/backend/
```

### Validation Results
```
# Dashboard
cd src/dashboard && npx tsc --noEmit  # No errors
cd src/dashboard && npm run lint      # No errors

# Backend
cd src/backend && python -m pytest ../../tests/backend/test_bookmark_service.py  # All passed
```
