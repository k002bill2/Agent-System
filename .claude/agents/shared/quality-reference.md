---
name: quality-reference
description: Shared quality gates for all specialist agents
---

# Quality Reference

All agents MUST pass these quality gates before marking work as complete.

## Automated Checks

```bash
# Frontend quick validation (CWD: src/dashboard)
npm run lint && npm run type-check

# Frontend full validation (CWD: src/dashboard, before PR)
npm run lint && npm run type-check && npm run test:coverage

# Backend validation (CWD: src/backend)
uv run ruff check . && uv run mypy . --ignore-missing-imports && uv run pytest ../../tests/backend --tb=short
```

Always run these from the directory noted above — never from the repo root (root scripts are thin delegation wrappers, not the gate).

## Quality Gate Requirements

### 1. TypeScript Strict Mode
- `npm run type-check` passes with zero errors
- No `any` types (use `unknown` if type is truly unknown)
- Explicit return types on exported functions
- Proper null/undefined handling with guards

### 2. ESLint Compliance
- `npm run lint` passes with zero errors
- No disabled ESLint rules without justification comment

### 3. Test Coverage Thresholds
- **SSOT: `src/dashboard/vitest.config.ts` — the `coverage.thresholds` block is the only place threshold numbers live.** Do not copy numbers into docs; Read the config when you need the values.
- Pass/fail is determined by running `npm run test:coverage` (CWD: `src/dashboard`) — it fails automatically when thresholds are not met.

### 4. Security
- No hardcoded API keys or secrets
- Sensitive data uses environment variables
- No console.log with sensitive information

### 5. React Web Specific
- `React.memo()` + `displayName` on ALL exported components (project convention, not just expensive ones)
- `useCallback`/`useMemo` for stable references
- `aria-label` on ALL interactive elements
- `dark:` prefix on all color-related Tailwind classes
- Proper cleanup in useEffect return functions

### 6. Python Backend
- Type hints on all function signatures
- No bare `except:` clauses
- `logging` module instead of `print()`
- `response_model` on FastAPI endpoints

## Agent-Specific Gates

| Agent | Additional Requirements |
|-------|------------------------|
| web-ui-specialist | ARIA attributes, responsive Tailwind design |
| backend-integration-specialist | API rate limits respected, cleanup functions |
| test-automation-specialist | Coverage meets thresholds, no flaky tests |
