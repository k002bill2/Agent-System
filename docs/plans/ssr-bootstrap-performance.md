# SSR Bootstrap and Client Bundle Performance Implementation Plan

> **For Hermes:** Implement this plan in the dedicated Orca-managed worktree only. Do not merge, push, deploy, or modify unrelated worktree paths.

**Goal:** Reduce authenticated dashboard startup latency and unnecessary client JavaScript without attempting a risky full SSR migration.

**Architecture:** Add an authenticated FastAPI bootstrap endpoint that returns the minimum user-scoped startup data needed by the dashboard, while preserving the current browser-rendered React/WebSocket model. Consume that payload once after auth hydration, then remove redundant startup fetches. Independently remove ineffective public-page static imports so Vite can split those routes. Do not change token storage to HttpOnly in this slice; document it as a prerequisite for true protected SSR.

**Tech Stack:** FastAPI, Pydantic, React 19, TypeScript, Zustand, Vite, Vitest, pytest.

---

## Scope

### In scope

- `GET /api/bootstrap`, authenticated with the existing `get_current_user` dependency.
- Response fields needed for startup only: current user, accessible projects, available LLM models, and menu visibility/order if existing backend contracts expose them safely.
- Frontend bootstrap consumption after auth hydration, with explicit loading/error behavior and no duplicate project/model/menu requests.
- Route-level public page code splitting for Login/Register/InvitationAccept.
- Backend and frontend tests for response authorization, response shape, store seeding, request deduplication, and route loading.
- Build/lint/type/test verification and bundle-size comparison.

### Out of scope

- Full React SSR, React Server Components, Next.js migration, or replacing Nginx with a Node SSR runtime.
- HttpOnly cookie migration, refresh-token redesign, or auth protocol changes.
- WebSocket/SSE/Monitor/Playground/Git/Workflow rendering changes.
- Cache policy that could mix users, organizations, projects, or roles.
- Git commit, push, PR, merge, deployment, or infrastructure restart.

## Acceptance criteria

1. Unauthenticated `GET /api/bootstrap` returns the existing authentication failure contract; an authenticated user receives only data authorized for that user.
2. The dashboard obtains startup user-scoped data from one bootstrap request after auth hydration, without issuing redundant equivalent project/model/menu requests.
3. Existing realtime connection and page-specific fetch behavior remain unchanged outside the startup data path.
4. Login, Register, and InvitationAccept are not statically imported by `App.tsx`; the production build no longer emits the corresponding ineffective dynamic-import warnings.
5. Tests cover the endpoint, frontend bootstrap success/failure, and public route rendering/loading behavior.
6. `src/dashboard`: `npm run type-check`, `npm run lint`, `npm run test:run`, and `npm run build` pass.
7. Backend focused tests and the project-prescribed backend suite pass, or any unrelated baseline failure is reported with exact evidence.
8. No existing changes in the parent `main` worktree are touched.

## Implementation tasks

### Task 1: Establish endpoint contract with failing backend tests

**Files:**
- Create or modify the smallest existing backend API test module under `tests/backend/`.
- Modify the backend route registration/model module only after the test is red.

**Steps:**
1. Identify existing helpers for `UserResponse`, project listing, model listing, and menu visibility. Reuse them; do not duplicate authorization logic.
2. Add tests for authenticated response shape and unauthenticated rejection.
3. Run the focused tests and verify failure because `/api/bootstrap` is absent.

### Task 2: Implement the authenticated bootstrap endpoint

**Files:**
- Modify the existing auth/core API router and/or create a narrowly scoped bootstrap module under `src/backend/api/`.
- Add response models beside the owning API models.

**Rules:**
- Use `get_current_user` and existing project access filtering.
- Do not expose access/refresh tokens, secrets, filesystem paths not already exposed by `/api/projects`, or cross-organization data.
- Keep the response explicit and versionable; do not return arbitrary store-shaped dictionaries.
- Preserve existing endpoint contracts.

**Steps:**
1. Implement the minimum response model and handler.
2. Run focused backend tests and verify green.
3. Run the relevant backend API tests.

### Task 3: Add frontend bootstrap service/store integration with failing tests first

**Files:**
- Modify `src/dashboard/src/services/` for the request function if needed.
- Modify `src/dashboard/src/App.tsx` and the owning Zustand stores.
- Add/modify adjacent Vitest tests under `src/dashboard/src/**/__tests__/`.

**Rules:**
- Start bootstrap only after auth hydration and a usable access/refresh token exist.
- Coalesce one in-flight bootstrap request; do not create a request loop.
- Seed existing stores through their public state/actions without changing WebSocket semantics.
- On bootstrap failure, preserve the current fallback/error behavior and do not silently treat missing authorized data as an empty dataset.
- Keep `/api/auth/status` public check and current-user authentication behavior intact unless the tested bootstrap contract explicitly replaces a duplicate call.

**Steps:**
1. Write failing tests for one bootstrap request, store seeding, and failure state.
2. Run focused tests to confirm red.
3. Implement the smallest integration.
4. Run focused tests to confirm green.

### Task 4: Remove ineffective public-page static imports

**Files:**
- Modify `src/dashboard/src/App.tsx`.
- Modify `src/dashboard/src/routes.tsx` only if route lookup/types require it.
- Extend relevant page tests if behavior changes.

**Rules:**
- Remove static imports for LoginPage, RegisterPage, and InvitationAcceptPage from `App.tsx`.
- Render their existing lazy route components for the matching public views.
- Keep AuthCallbackPage eager only if its provider prop requires it; do not change OAuth behavior.
- Preserve public-route redirect and loading/error boundaries.

**Steps:**
1. Add or update a test proving public views still render.
2. Run the focused test.
3. Apply the import/render refactor.
4. Run the focused test and production build; confirm ineffective dynamic-import warnings are gone for those pages.

### Task 5: Full verification and artifact report

**Files:**
- No new production files unless required by the tested implementation.
- Optional local-only benchmark output must remain ignored and must not be committed.

**Commands:**
- Backend: `cd src/backend && uv run pytest ../../tests/backend -v --tb=short`
- Dashboard: `cd src/dashboard && npm run type-check`
- Dashboard: `cd src/dashboard && npm run lint`
- Dashboard: `cd src/dashboard && npm run test:run`
- Dashboard: `cd src/dashboard && npm run build`
- Worktree: `git diff --check`, `git status --short`, `git diff --stat`

**Verification:**
- Compare the build output before/after for initial and public-route chunks.
- Confirm no changes outside the approved scope.
- Report local test results separately from any live/deployment state.
- Stop before commit/push/merge/deploy.

## Risks and decisions requiring Jarvis review

- True protected SSR remains blocked until authentication is server-readable via a secure HttpOnly/session boundary.
- Bootstrap response caching must be private/user-scoped; shared caching is forbidden.
- If an existing menu/model endpoint cannot be safely reused without coupling unrelated behavior, omit it and report the remaining request rather than widening the endpoint.
- If the current branch has concurrent edits in an in-scope file, stop and report the collision instead of overwriting.
