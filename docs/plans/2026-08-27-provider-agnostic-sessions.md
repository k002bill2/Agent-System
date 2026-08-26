# Provider-Agnostic Agent Sessions Implementation Plan

> **For Hermes:** Use the project’s Orca-managed Claude Code terminal to implement this plan task-by-task.

**Goal:** Extend AOS external session monitoring from Claude-only to Claude and Codex, and remove Claude-only labels/contracts from shared session views.

**Architecture:** Keep the existing HTTP surface backward-compatible while moving the session domain to provider-aware records. The monitor will use provider-specific filesystem parsers (Claude JSONL and Codex rollout JSONL) behind one discovery/detail/activity interface. The dashboard will consume the same normalized shape, show provider badges/filtering, and use provider-neutral labels; genuinely Claude-only process controls remain explicitly labeled rather than pretending to support Codex.

**Tech Stack:** FastAPI, Pydantic, Python pathlib/JSONL parsing, React 19, TypeScript, Zustand, Vitest, pytest.

---

## Scope and acceptance criteria

### In scope

- Discover local Claude Code sessions from `~/.claude/projects/**/<uuid>.jsonl` as today.
- Discover Codex sessions from `~/.codex/sessions/**/rollout-*.jsonl`.
- Normalize both formats into one provider-aware session shape with `provider: "claude" | "codex"`.
- Parse Codex metadata, timestamps, user/assistant/tool activity, model, cwd/project, file size, and token usage when present.
- Support list, detail, transcript, activity, filtering, sorting, pagination, selection, and provider display for both providers.
- Preserve existing `/api/claude-sessions` behavior for existing clients/tests where practical; add a provider-neutral `/api/agent-sessions` route or equivalent without colliding with orchestration `/api/sessions`.
- Update dashboard/shared labels from Claude-only wording to Agent/External Sessions, and show provider badges in cards/details/activity.
- Add provider-focused backend/frontend tests, including Codex fixtures and legacy Claude compatibility.

### Explicitly out of scope

- Writing, deleting, or mutating Codex session files unless the existing operation is safe and semantics are clear. Read-only Codex support is sufficient for this increment.
- Making the Claude-specific OS process kill/cleanup API claim to manage Codex processes. Keep it visible only with an explicit Claude label or isolate it as Claude-only.
- Changing the unrelated uncommitted changes currently present in the main worktree.
- Git push, PR creation, deployment, database destructive operations, or external messages.

### Acceptance criteria

- A clean checkout can list at least one synthetic Claude and one synthetic Codex session through the provider-neutral API.
- A Codex rollout fixture with `session_meta`, `response_item` user/assistant messages, and tool events produces correct provider, session ID, model, timestamps, counts, project/cwd, and transcript/activity data.
- Existing Claude monitor tests and API route-table contracts remain green or are updated only where the intentional provider-neutral surface requires it.
- Dashboard cards/details render both providers, identify the provider, and no longer instruct users to start only a Claude Code session.
- Provider filtering and pagination do not mix or drop records; Codex child/subagent rollout records do not crash parsing.
- `uv run pytest ../../tests/backend -v --tb=short` (from `src/backend`) and `npm run type-check && npm run lint && npm run test:run` (from `src/dashboard`) pass, or any pre-existing/environment-only failure is recorded exactly.
- `git diff --check` is clean and the worktree contains only this feature’s changes.

---

## Task 1: Add provider-aware normalized session models and test fixtures

**Files:**
- Modify: `src/backend/models/claude_session.py` (or create a provider-neutral model module with compatibility aliases)
- Modify: `src/dashboard/src/types/claudeSession.ts` (or create provider-neutral types with compatibility aliases)
- Test: `tests/backend/test_codex_session_monitor.py`
- Test: `src/dashboard/src/components/claude-sessions/__tests__/SessionCard.test.tsx`

1. Add a required serialized provider field with a backward-compatible Claude default at the model boundary. Use a constrained enum/literal, not arbitrary UI strings.
2. Keep existing field names and API response envelope unless a provider-neutral alias is needed; avoid a repository-wide rename solely for naming.
3. Add deterministic fixture builders for Claude and Codex JSONL records in tests. Codex fixtures must cover root and subagent metadata, user/assistant response items, tool calls, malformed/unknown events, and missing optional fields.
4. Run the focused new tests first and confirm they fail for the missing Codex/provider behavior before production implementation.

## Task 2: Implement Codex discovery and normalization behind the existing monitor contract

**Files:**
- Modify: `src/backend/services/claude_session_monitor.py`, or extract shared logic into `src/backend/services/session_monitor.py` and leave a compatibility facade
- Test: `tests/backend/test_codex_session_monitor.py`
- Test: `tests/backend/test_claude_session_monitor.py`

1. Add configurable Codex sessions root, defaulting to `Path.home() / ".codex" / "sessions"`; allow tests to inject both roots without reading real user data.
2. Scan only bounded expected rollout JSONL files. Do not follow symlinks or accept arbitrary user-provided paths through the session ID.
3. Parse the first `session_meta` payload. Prefer the rollout thread `payload.id` as the record ID when present, fall back to `payload.session_id`, then a validated filename-derived ID. Preserve `parent_thread_id` as optional metadata if the normalized shape supports it.
4. Parse Codex `response_item` messages and relevant `event_msg`/tool events into the existing normalized message/activity shape. Unknown event types must be skipped, not fatal.
5. Calculate status from last activity with the same aware-UTC rules used by Claude. Calculate cost only when a known usage/cost signal exists; otherwise return zero and do not invent provider pricing.
6. Make detail/transcript/activity lookup resolve both providers. Keep a safe bounded index/resolver rather than interpolating the caller’s ID into a path.
7. Preserve Claude parsing and behavior, including truncation flags, empty/ghost detection where applicable, cache invalidation, and source-user handling.
8. Run focused backend tests, then the existing Claude monitor tests.

## Task 3: Expose provider-neutral API while preserving compatibility

**Files:**
- Modify: `src/backend/api/claude_sessions/core.py`
- Modify: `src/backend/api/claude_sessions/sessions.py`
- Modify: `src/backend/api/claude_sessions/activity.py`
- Modify: `src/backend/api/claude_sessions/discovery.py`
- Modify: `src/backend/api/claude_sessions/__init__.py`
- Modify: `src/backend/api/routes.py` or `src/backend/api/app.py` only if required for the new alias
- Test: `tests/backend/api/test_agent_sessions_routes.py`
- Update: existing Claude session route tests only for intentional response/provider additions

1. Add a `provider` query filter (`all`, `claude`, `codex`) to list routes and propagate it through pagination, sorting, project/source filters, and counts.
2. Prefer a provider-neutral route name such as `/api/agent-sessions`; if adding it would duplicate handlers, implement a router alias that calls the same code. Do not collide with orchestration `/api/sessions`.
3. Ensure detail, transcript, activity, and SSE routes use the normalized provider resolver. If Codex streaming cannot be safely supported from its append-only rollout files, return the initial normalized state and a controlled unsupported response rather than a Claude-shaped false claim.
4. Keep `/api/claude-sessions` available for existing consumers during this change; it may become a compatibility alias and should return both providers by default only if that does not break the documented legacy contract. Otherwise make the dashboard use the new neutral route and document the compatibility behavior.
5. Do not weaken existing authentication/authorization or filesystem path safety. Do not log raw prompts, transcript contents, or secrets in new error paths.
6. Run route-table tests, focused API tests, and backend tests for session APIs.

## Task 4: Make the dashboard provider-neutral

**Files:**
- Modify: `src/dashboard/src/types/claudeSession.ts` and/or add `src/dashboard/src/types/agentSession.ts`
- Modify: `src/dashboard/src/stores/claudeSessions/types.ts`
- Modify: `src/dashboard/src/stores/claudeSessions/index.ts`
- Modify: `src/dashboard/src/components/claude-sessions/SessionList.tsx`
- Modify: `src/dashboard/src/components/claude-sessions/SessionCard.tsx`
- Modify: `src/dashboard/src/components/claude-sessions/SessionDetails.tsx`
- Modify: `src/dashboard/src/components/claude-sessions/TranscriptViewer.tsx`
- Modify: `src/dashboard/src/pages/ClaudeSessionsPage.tsx`
- Modify: `src/dashboard/src/pages/DashboardPage.tsx`
- Modify: `src/dashboard/src/components/ClaudeCodeActivity.tsx` and related activity types/store if they directly assume Claude
- Modify: `src/dashboard/src/components/admin/types.ts` and menu labels only where displayed wording is Claude-specific
- Tests: affected `*.test.tsx` and store tests

1. Add provider state/filter and pass it on every list/load-more/refresh request. Keep the existing store export as a compatibility alias if a full rename would cause unnecessary churn.
2. Render a clear provider badge/label (`Claude` / `Codex`) on cards and detail metadata, and use provider-neutral page headings, empty states, dashboard headings, and helper text.
3. Show model/provider values from the normalized record; do not hardcode Claude model assumptions in shared components.
4. Keep process cleanup explicitly scoped to Claude if Codex process control is not implemented; label the tab accordingly so the UI does not imply coverage.
5. Preserve loading, error, pagination, streaming, summary, filters, and accessibility behavior. Avoid nested interactive controls inside a button if touching the card structure; preserve existing interaction tests.
6. Add tests for provider badge rendering, provider filter request parameters, Codex detail/transcript rendering, and neutral empty-state copy.
7. Run the focused Vitest files and TypeScript type-check.

## Task 5: Integration verification and cleanup

**Files:**
- Modify: only files needed to fix verified failures
- Update: `docs/api/llm.md` or a focused session API doc only if the public route/shape changed

1. Run the full backend command from `AGENTS.md`.
2. Run dashboard `npm run type-check`, `npm run lint`, `npm run test:run`, and `npm run build` as applicable.
3. Run `git diff --check`, inspect `git status --short`, and verify no `.env`, credential, generated cache, or unrelated file changed.
4. Perform an independent review of the final diff for provider leakage, path traversal, unbounded JSONL scanning, false cost claims, and accidental Claude-only labels.
5. Report changed files, test output, known limitations (especially Codex live streaming or mutation), and the exact worktree path. Do not push or merge without explicit approval.
