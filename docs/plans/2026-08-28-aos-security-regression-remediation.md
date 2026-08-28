# AOS Security Regression Remediation Implementation Plan

> **For Hermes:** Execute task-by-task with the subagent-driven-development workflow. Use a fresh isolated worktree and require independent Security review before any live restart.

**Goal:** Restore authenticated AOS SSE and DB-mode monitoring behavior without weakening the fail-closed authorization introduced by #318/#328/#351.

**Architecture:** Keep backend authentication and RBAC authoritative. Replace URL-only browser `EventSource` calls on protected streams with one authenticated streaming transport that can attach the existing Bearer access token and participate in the existing refresh/re-auth policy. Keep DB mode fail-closed: either provide a DB-backed monitoring read/execute path or explicitly suppress legacy filesystem calls in the Dashboard; never re-enable an unauthorized filesystem fallback.

**Tech Stack:** FastAPI/Starlette, SQLAlchemy async dependencies, React/TypeScript, Zustand, Vitest, pytest, Vite proxy.

**Workspace:** `/Users/younghwankang/orca/workspaces/Agent-System/aos-security-fix`

**Baseline:** `main@4dcd179` (detached isolated worktree). The previous live worktree was removed externally and the running uvicorn process still points into `.orca-worktree-trash`; do not edit or restart that process from this plan.

---

## Scope and acceptance criteria

### In scope

1. Protected SSE transport for the incident routes:
   - `/api/project-configs/stream`
   - `/api/claude-sessions/{session_id}/activity/stream`
   - `/api/claude-sessions/{session_id}/stream` if the same transport contract applies
2. Audit and classify the other protected Dashboard SSE consumers before changing them:
   - project checks
   - workflow logs
   - agent monitor
3. DB-mode monitoring compatibility for `health-config`, `health`, and check execution.
4. Role and error behavior: `401/403` must not create an infinite reconnect loop; authorized access must remain authorized.
5. Regression tests, static checks, full test gates, and post-restart probes.

### Out of scope

- Removing or weakening `get_current_user`, project ACL, or admin/manager authorization.
- Putting access tokens into query strings or loggable URLs.
- Database migrations, credential changes, infrastructure volume changes, or public deployment.
- Restarting the currently running service before the user approves the verified build.

### Done means

- Authenticated protected SSE connections receive `200` and expected events.
- Unauthenticated requests still receive `401`; unauthorized roles still receive `403`.
- No repeated `Config stream error` or `SSE connection error` for valid authenticated sessions.
- DB-mode Monitor either returns DB-backed results or is visibly/behaviorally disabled without calling legacy filesystem handlers.
- Backend security suite, Dashboard tests, type-check, lint/build, and targeted integration tests pass.
- A fresh service instance from this worktree passes readiness, auth, SSE, and Monitor probes.

---

## Task 0: Freeze baseline and create a red reproduction

**Objective:** Capture the current source/runtime boundary and encode the incident symptoms before implementation.

**Files:**
- Test: `tests/backend/test_security_hardening.py` or a focused new backend route test
- Test: `src/dashboard/src/stores/__tests__/projectConfigs.test.ts`
- Test: `src/dashboard/src/stores/__tests__/claudeCodeActivity.test.ts`
- Test: `src/dashboard/src/stores/__tests__/monitoring.test.ts`

**Steps:**

1. Record `git status`, `git rev-parse HEAD`, and the existing live process cwd. Treat the deleted worktree as external state, not as an implementation target.
2. Run the existing focused security suite and Dashboard tests to establish the clean baseline.
3. Add the smallest test that demonstrates the missing authenticated SSE transport contract. The test must fail before the implementation for the expected reason, not because of a fixture typo.
4. Run the new test alone and preserve the RED output.
5. Do not call mutating API endpoints. Use dependency overrides, fixture tokens, or a local ASGI test client for route behavior.

**Verification:** Baseline command output and the intentional RED test are recorded in the task session.

---

## Task 1: Design one authenticated SSE client

**Objective:** Provide a single Dashboard transport that can send the existing access token without exposing it in the URL.

**Files:**
- Create or modify: `src/dashboard/src/services/` authenticated SSE client module
- Modify: `src/dashboard/src/services/apiClient.ts` only if shared token-refresh behavior is extracted safely
- Test: `src/dashboard/src/services/__tests__/` authenticated SSE transport tests

**Steps:**

1. Re-read the existing auth store, token refresh behavior, API error types, and cancellation conventions.
2. Define the smallest API needed by stores: URL, event handlers, abort/close, and terminal status callback.
3. Attach `Authorization: Bearer <access token>` to the request using the same auth source as `apiClient`.
4. On `401`, perform at most one existing token-refresh attempt; on refresh failure, emit an authentication terminal state instead of retrying forever.
5. On `403`, emit a permission terminal state and do not reconnect automatically.
6. Parse SSE framing (`event`, `data`, blank-line dispatch) and preserve the existing event names/payloads.
7. Add tests for header presence, refresh retry, `401`, `403`, cancellation, malformed event data, and clean close.
8. Run the focused tests and confirm GREEN.

**Security constraints:** No token query parameter, no token logging, no raw exception payload sent to the user.

---

## Task 2: Migrate the incident SSE consumers

**Objective:** Remove the URL-only `EventSource` contract from the two failing streams while preserving store behavior.

**Files:**
- Modify: `src/dashboard/src/stores/projectConfigs/projects.ts:108-150`
- Modify: `src/dashboard/src/stores/claudeCodeActivity.ts:165-223`
- Review: `src/dashboard/src/stores/claudeSessions/index.ts:497-569`
- Tests: corresponding store test files

**Steps:**

1. Replace project-config stream construction with the authenticated SSE client.
2. Replace Claude activity stream construction with the authenticated SSE client.
3. Preserve initial batches, incremental events, completion events, cleanup, and selected-session state updates.
4. Make `401/403` terminal for the affected store and clear only the relevant stream state.
5. Add store tests that assert the authenticated client receives the URL and auth context, and that no reconnect occurs after `401/403`.
6. Run the affected store tests and the new transport tests.

**Verification:** The tests must prove both sides of the contract: valid auth is sent and invalid/insufficient auth remains fail-closed.

---

## Task 3: Audit remaining Dashboard SSE surfaces

**Objective:** Prevent the same security regression from remaining in other protected streams.

**Files:**
- Review/modify only when the route is protected: `src/dashboard/src/stores/monitoring.ts`
- Review/modify only when protected: `src/dashboard/src/stores/workflows.ts`
- Review/modify only when protected: `src/dashboard/src/stores/agentMonitor.ts`
- Review: matching backend route modules under `src/backend/api/`
- Tests: matching store tests

**Steps:**

1. Enumerate each `new EventSource(...)` call and map it to its backend route dependency.
2. Classify each route as public, Bearer-protected, role-protected, or WebSocket-only.
3. Migrate every protected route to the authenticated client; leave explicitly public health streams unchanged.
4. Add a test for every migrated protected consumer and document any intentionally public consumer.
5. Run the affected tests.

**Stop condition:** If a route’s intended user/role policy is unclear, stop implementation for that route and record the policy decision required from the owner.

---

## Task 4: Resolve DB-mode Monitor compatibility without weakening security

**Objective:** Eliminate the user-visible `503`/warning caused by Dashboard calls into legacy filesystem monitoring routes.

**Files:**
- Backend: `src/backend/api/deps.py:44-50`
- Backend: `src/backend/api/monitoring.py:72-293`
- Dashboard: `src/dashboard/src/stores/monitoring.ts:125-198` and check execution paths
- Tests: `tests/backend/` monitoring route tests
- Tests: `src/dashboard/src/stores/__tests__/monitoring.test.ts`

**Steps:**

1. Confirm the DB-mode authority and current project/ACL data shape without reading secrets or changing data.
2. Choose exactly one implementation path in the plan review:
   - implement DB-backed health-config/health/check handlers, or
   - explicitly disable/hide legacy Monitor operations in DB mode and return a typed capability state.
3. Keep authorization before any filesystem operation.
4. Preserve `503` for genuinely unavailable DB-backed dependencies and preserve `403` for denied access.
5. Add route tests for authorized, denied, unavailable, and DB-mode cases.
6. Add Dashboard tests proving it does not repeatedly call an unsupported legacy route.
7. Run focused backend and Dashboard tests.

**Stop condition:** Do not replace the fail-closed guard with filesystem fallback merely to make the UI green.

---

## Task 5: Independent Security and quality review

**Objective:** Verify the final diff independently before any service restart.

**Steps:**

1. Capture `git diff`, `git status`, and changed-file scope.
2. Run added-line secret/injection scans without reading `.env` values.
3. Run backend security tests, affected backend tests, Dashboard tests, type-check, lint, and build using repository commands.
4. Dispatch an independent Security reviewer with the final diff and require structured JSON:

```json
{
  "passed": true,
  "security_concerns": [],
  "logic_errors": [],
  "suggestions": [],
  "summary": "..."
}
```

5. Treat any security concern or logic error as a blocking failure. Re-review after every fix.
6. Run the complete suite once after focused gates pass.

**Verification:** No merge/push and no live restart until Security returns `passed: true` and all required test gates are green.

---

## Task 6: Apply only after explicit restart approval

**Objective:** Verify that the tested code is the code serving AOS.

**Preconditions:**

- Fresh worktree diff is reviewed and committed only if the owner authorizes commit.
- Existing deleted-worktree process ownership is understood.
- User explicitly approves stopping/restarting the affected AOS backend and Dashboard processes.
- Shared-infra volumes remain untouched.

**Steps:**

1. Stop/restart only the affected AOS services using the repository-defined commands.
2. Verify `/health` and `/api/health` readiness.
3. Verify unauthenticated `GET` requests remain `401/403` where expected.
4. Verify authenticated SSE connections and event delivery with validation-only fixture credentials.
5. Verify DB-mode Monitor behavior.
6. Observe backend/dashboard logs over a bounded window for recurrence.
7. Report code commit, process cwd, probes, status codes, remaining warnings, and rollback point.

**Rollback:** Stop the new instance and restore the prior known-good service process only if the user approves; never delete shared volumes.

---

## Verification command set

Run from the new worktree after implementation:

```bash
cd src/backend && uv run pytest ../../tests/backend/test_security_hardening.py -q --tb=short
cd src/backend && uv run pytest ../../tests/backend -q --tb=short
cd src/dashboard && npm run type-check
cd src/dashboard && npm run test:run
cd src/dashboard && npm run lint
cd src/dashboard && npm run build
```

Use the exact repository command names. Do not add Jest-only flags to Vitest. Separate invocation errors, environment failures, test failures, and warnings in the final report.

---

## Estimated execution

- Baseline/worktree re-establishment: 1–2 hours
- Authenticated SSE client and incident consumers: 4–6 hours
- Remaining SSE audit: 1–3 hours
- DB-mode Monitor compatibility: 4–8 hours
- Tests, Security review, and release verification: 5–8 hours
- **Total:** 15–27 engineering hours before restart; add 1–2 hours for live re-baseline/restart verification when approved.

No code, restart, merge, push, credential change, or external message is authorized by this document alone.
