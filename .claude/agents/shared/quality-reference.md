---
name: quality-reference
description: Shared quality gates for all specialist agents
---

# Quality Reference

All agents MUST pass these quality gates before marking work as complete.

## Automated Checks

```bash
# Quick validation
npm run lint && npm run type-check

# Full validation (before PR)
npm run lint && npm run type-check && npm test -- --coverage
```

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
| Metric | Minimum |
|--------|---------|
| Statements | 75% |
| Functions | 70% |
| Branches | 60% |
| Lines | 75% |

### 4. Security
- No hardcoded API keys or secrets
- Sensitive data uses environment variables
- No console.log with sensitive information

### 5. React Web Specific
- `React.memo()` on expensive components
- `useCallback`/`useMemo` for stable references
- `aria-label` on interactive elements
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
| performance-optimizer | Core Web Vitals metrics, no memory leaks |
| test-automation-specialist | Coverage meets thresholds, no flaky tests |
| quality-validator | All gates verified, integration checked |
