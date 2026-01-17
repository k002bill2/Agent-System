# Parallel Coordinator Operations Guide

## Validation Gates

### Pre-Execution Validation

**Before starting parallel execution**:
```bash
# 1. Verify no uncommitted changes in main codebase
git status --porcelain | grep '^[MARC]' && echo "ABORT: Uncommitted changes" && exit 1

# 2. Verify .temp/ directory structure exists
[ -d ".temp/agent_workspaces" ] || mkdir -p .temp/agent_workspaces/{mobile-ui,backend-integration,performance-optimizer,test-automation}/{drafts,proposals}

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

# 2. Run TypeScript type-check
npm run type-check
# MUST PASS (zero errors)

# 3. Run ESLint
npm run lint
# MUST PASS (zero errors)

# 4. Run tests with coverage
npm test -- --coverage
# MUST PASS (all tests, coverage >75%)

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
find .temp/agent_workspaces/*/proposals/ -type f -name "*.ts" -o -name "*.tsx"

# Output:
# .temp/agent_workspaces/backend-integration/proposals/seoulSubwayApi.ts
# .temp/agent_workspaces/mobile-ui/proposals/StationDetailScreen.tsx
# .temp/agent_workspaces/test-automation/proposals/seoulSubwayApi.test.ts
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
cat .temp/agent_workspaces/mobile-ui/metadata.json | jq '.status, .progress'
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

## Complete Example: Favorite Stations Feature

### Task Decomposition
```json
{
  "subtasks": [
    {
      "id": "favorites_service",
      "agent": "backend-integration-specialist",
      "task": "Firebase favorites service with offline support",
      "skill": "firebase-integration",
      "output": "src/services/favorites/favoritesService.ts",
      "dependencies": []
    },
    {
      "id": "star_icon",
      "agent": "mobile-ui-specialist",
      "task": "Add star icon to StationCard",
      "skill": "react-native-development",
      "output": "src/components/train/StationCard.tsx",
      "dependencies": ["favorites_service"]
    },
    {
      "id": "favorites_screen",
      "agent": "mobile-ui-specialist",
      "task": "Create FavoritesScreen",
      "skill": "react-native-development",
      "output": "src/screens/FavoritesScreen.tsx",
      "dependencies": ["favorites_service"]
    },
    {
      "id": "tests",
      "agent": "test-automation-specialist",
      "task": "Test coverage for favorites feature",
      "skill": "test-automation",
      "output": "src/services/favorites/__tests__/favoritesService.test.ts",
      "dependencies": ["favorites_service"]
    }
  ]
}
```

### Execution Timeline
```
T0:00 - Primary: Invokes backend-integration-specialist
T0:15 - backend-integration: Completes favoritesService.ts
        → Writes to .temp/agent_workspaces/backend-integration/proposals/

T0:16 - Primary: Invokes mobile-ui-specialist + test-automation-specialist
        → Both can proceed (backend types available)

T0:26 - mobile-ui: Completes StationCard.tsx
T0:31 - test-automation: Completes favoritesService.test.ts
T0:32 - Primary: Invokes mobile-ui-specialist (favorites_screen)
T0:47 - mobile-ui: Completes FavoritesScreen.tsx

Feature completed in 47 minutes vs ~75 minutes sequential = 1.6x speedup
```

### Integration
```bash
cp .temp/agent_workspaces/backend-integration/proposals/favoritesService.ts src/services/favorites/
cp .temp/agent_workspaces/mobile-ui/proposals/StationCard.tsx src/components/train/
cp .temp/agent_workspaces/mobile-ui/proposals/FavoritesScreen.tsx src/screens/
cp .temp/agent_workspaces/test-automation/proposals/favoritesService.test.ts src/services/favorites/__tests__/
```

### Validation Results
```
npm run type-check  # No errors
npm run lint        # No errors
npm test --coverage # 78% coverage (target: 75%)
```
