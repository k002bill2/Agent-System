<purpose>
Create structured `.planning/HANDOFF.json` and `.continue-here.md` handoff files to preserve complete work state across sessions. The JSON provides machine-readable state for `/gsd:resume-work`; the markdown provides human-readable context.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="detect">
Find current phase directory from most recently modified files:

```bash
# Find most recent phase directory with work
# Plans are normally {phase}-{plan}-PLAN.md (e.g. 01-01-PLAN.md); '*PLAN.md' also keeps
# a bare PLAN.md discoverable. find/cut instead of glob+grep -P: a glob that matches
# nothing aborts the command in zsh, and -P/\K are GNU-only (absent from BSD grep).
# -mindepth 2 pins the match to .planning/phases/<phase>/: without it a stray
# .planning/phases/01-01-PLAN.md matches and cut returns the filename as the phase name.
# -exec … + rather than xargs: GNU xargs runs the command even on empty input, which
# would make `ls -t` list the cwd and cut return an arbitrary name.
find .planning/phases -mindepth 2 -maxdepth 2 -name '*PLAN.md' -exec ls -t {} + 2>/dev/null \
  | head -1 | cut -d/ -f3
```

If no active phase detected, ask user which phase they're pausing work on.
</step>

<step name="gather">
**Collect complete state for handoff:**

1. **Current position**: Which phase, which plan, which task
2. **Work completed**: What got done this session
3. **Work remaining**: What's left in current plan/phase
4. **Decisions made**: Key decisions and rationale
5. **Blockers/issues**: Anything stuck
6. **Human actions pending**: Things that need manual intervention (MCP setup, API keys, approvals, manual testing)
7. **Background processes**: Any running servers/watchers that were part of the workflow
8. **Files modified**: What's changed but not committed

Ask user for clarifications if needed via conversational questions.

**Also inspect SUMMARY.md files for false completions:**
```bash
# Check for placeholder content in existing summaries
find .planning/phases -maxdepth 2 -name '*.md' \
  -exec grep -l "To be filled\|placeholder\|TBD" {} + 2>/dev/null
```
Report any summaries with placeholder content as incomplete items.
</step>

<step name="write_structured">
**Write structured handoff to `.planning/HANDOFF.json`:**

```bash
timestamp=$(node "/Users/younghwankang/.claude/get-shit-done/bin/gsd-tools.cjs" current-timestamp full --raw)
```

```json
{
  "version": "1.0",
  "timestamp": "{timestamp}",
  "phase": "{phase_number}",
  "phase_name": "{phase_name}",
  "phase_dir": "{phase_dir}",
  "plan": {current_plan_number},
  "task": {current_task_number},
  "total_tasks": {total_task_count},
  "status": "paused",
  "completed_tasks": [
    {"id": 1, "name": "{task_name}", "status": "done", "commit": "{short_hash}"},
    {"id": 2, "name": "{task_name}", "status": "done", "commit": "{short_hash}"},
    {"id": 3, "name": "{task_name}", "status": "in_progress", "progress": "{what_done}"}
  ],
  "remaining_tasks": [
    {"id": 4, "name": "{task_name}", "status": "not_started"},
    {"id": 5, "name": "{task_name}", "status": "not_started"}
  ],
  "blockers": [
    {"description": "{blocker}", "type": "technical|human_action|external", "workaround": "{if any}"}
  ],
  "human_actions_pending": [
    {"action": "{what needs to be done}", "context": "{why}", "blocking": true}
  ],
  "decisions": [
    {"decision": "{what}", "rationale": "{why}", "phase": "{phase_number}"}
  ],
  "uncommitted_files": [],
  "next_action": "{specific first action when resuming}",
  "context_notes": "{mental state, approach, what you were thinking}"
}
```
</step>

<step name="write">
**Write handoff to `.planning/phases/XX-name/.continue-here.md`:**

```markdown
---
phase: XX-name
task: 3
total_tasks: 7
status: in_progress
last_updated: [timestamp from current-timestamp]
---

<current_state>
[Where exactly are we? Immediate context]
</current_state>

<completed_work>

- Task 1: [name] - Done
- Task 2: [name] - Done
- Task 3: [name] - In progress, [what's done]
</completed_work>

<remaining_work>

- Task 3: [what's left]
- Task 4: Not started
- Task 5: Not started
</remaining_work>

<decisions_made>

- Decided to use [X] because [reason]
- Chose [approach] over [alternative] because [reason]
</decisions_made>

<blockers>
- [Blocker 1]: [status/workaround]
</blockers>

<context>
[Mental state, what were you thinking, the plan]
</context>

<next_action>
Start with: [specific first action when resuming]
</next_action>
```

Be specific enough for a fresh Claude to understand immediately.

Use `current-timestamp` for last_updated field. You can use init todos (which provides timestamps) or call directly:
```bash
timestamp=$(node "/Users/younghwankang/.claude/get-shit-done/bin/gsd-tools.cjs" current-timestamp full --raw)
```
</step>

<step name="commit">
Collect the handoff files that actually exist, then commit those. Never pass a glob to
`--files`: if it matches nothing, zsh aborts the entire command (the trailing
`HANDOFF.json` dies with it) and the handoff silently stays uncommitted.

Two explicit `find` roots, no pattern matching at all. Not a shell glob (aborts the whole
command on nomatch in zsh) and not `-path` (its `*` also matches `/`, which would sweep in
`.planning/phases/<phase>/backup/.continue-here.md`). `-maxdepth` pins each artifact to its
exact level, and archived phases under `.planning/milestones/v*-phases/…` lie outside both
roots, so their handoffs are never staged.

```bash
json_count=$(find .planning -maxdepth 1 -name 'HANDOFF.json' 2>/dev/null | wc -l | tr -d ' ')
ch_count=$(find .planning/phases -mindepth 2 -maxdepth 2 -name '.continue-here.md' 2>/dev/null | wc -l | tr -d ' ')
echo "artifacts: HANDOFF.json=$json_count .continue-here.md=$ch_count"

if [ "$json_count" -eq 0 ] || [ "$ch_count" -eq 0 ]; then
  echo "COMMIT_SKIPPED: handoff incomplete — both artifacts are required"
else
  { find .planning -maxdepth 1 -name 'HANDOFF.json' -print0 2>/dev/null
    find .planning/phases -mindepth 2 -maxdepth 2 -name '.continue-here.md' -print0 2>/dev/null; } \
    | xargs -0 node "/Users/younghwankang/.claude/get-shit-done/bin/gsd-tools.cjs" \
        commit "wip: [phase-name] paused at task [X]/[Y]" --files
fi

# Ground truth — empty output means every collected handoff file is tracked and clean.
# -exec … + rather than xargs: GNU xargs would run `git status --porcelain --` with no
# paths on empty input, printing the whole tree's status as a false positive.
find .planning -maxdepth 1 -name 'HANDOFF.json' -exec git status --porcelain -- {} + 2>/dev/null
find .planning/phases -mindepth 2 -maxdepth 2 -name '.continue-here.md' -exec git status --porcelain -- {} + 2>/dev/null

# A .continue-here.md outside .planning/phases/<phase>/ is never collected — and resume
# only looks at .planning/phases/*/.continue-here*.md, so it would never be found either.
# maxdepth 2 catches both .planning/.continue-here.md and .planning/phases/.continue-here.md
# while leaving the correct depth-3 location alone. Any output here means the write step
# put it in the wrong place and it is NOT in the commit.
find .planning -maxdepth 2 -name '.continue-here.md' 2>/dev/null
```

**Read all four outputs before continuing.** The commit JSON alone is not sufficient:

| `artifacts:` counts | Commit output | `git status --porcelain` | Verdict |
|---|---|---|---|
| both ≥ 1 | `"committed": true` | empty | Committed (use the returned hash) |
| both ≥ 1 | `"committed": false`, `nothing_to_commit` | empty | **Already committed** — files unchanged since last commit. Success. |
| both ≥ 1 | any | non-empty | Not committed (git rejected it — see the `error` field) |
| both ≥ 1 | `"committed": false`, `skipped_commit_docs_false` / `skipped_gitignored` | — | Not committed by design (config / gitignore) |
| either = 0 | `COMMIT_SKIPPED: handoff incomplete` | — | **Incomplete** — go back and write the missing artifact |

Two independent overrides — either one makes the verdict **Not committed** regardless of
the table:

- The misplaced-file check printed a path → move it to
  `.planning/phases/<phase>/.continue-here.md` and re-run this step.
- `artifacts:` shows `HANDOFF.json=0` or `.continue-here.md=0` → one of the two required
  artifacts was never written. Never report a complete handoff on a single file.

Carry that verdict into the confirm step — do not assume success.
</step>

<step name="confirm">
Branch on the verdict from the commit step's table. Never report "Committed as WIP" without it.

**If the verdict is Committed or Already committed:**
(omit the hash when the files were already committed and unchanged)
```
✓ Handoff created:
  - .planning/HANDOFF.json (structured, machine-readable)
  - .planning/phases/[XX-name]/.continue-here.md (human-readable)

Current state:

- Phase: [XX-name]
- Task: [X] of [Y]
- Status: [in_progress/blocked]
- Blockers: [count] ({human_actions_pending count} need human action)
- Committed as WIP ([short-hash])

To resume: /gsd:resume-work

```

**If the verdict is Not committed:**
```
⚠ Handoff written but NOT committed — reason: [COMMIT_SKIPPED / {reason from JSON}]

Files (uncommitted):
  - .planning/HANDOFF.json
  - .planning/phases/[XX-name]/.continue-here.md

Current state:

- Phase: [XX-name]
- Task: [X] of [Y]
- Status: [in_progress/blocked]
- Blockers: [count] ({human_actions_pending count} need human action)

These files survive on disk but are not in git. Commit them manually before
switching branches or cleaning the working tree.

To resume: /gsd:resume-work

```
</step>

</process>

<success_criteria>
- [ ] .continue-here.md created in correct phase directory
- [ ] All sections filled with specific content
- [ ] Committed as WIP
- [ ] User knows location and how to resume
</success_criteria>
