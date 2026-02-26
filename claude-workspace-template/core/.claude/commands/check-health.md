---
name: check-health
description: Comprehensive project health check — reads commands from claude-workspace.yaml
---

# Project Health Check

Perform a comprehensive health check of the project, running all quality gates and reporting any issues with actionable fixes.

## Prerequisites

Read `claude-workspace.yaml` from the project root to determine the commands to run:

```yaml
commands:
  typecheck: "..."   # e.g. "npx tsc --noEmit", "mypy src/"
  lint: "..."        # e.g. "npx eslint .", "ruff check ."
  test: "..."        # e.g. "npm test", "pytest tests/"
  build: "..."       # e.g. "npm run build", "python -m build"
```

If `claude-workspace.yaml` does not exist, ask the user which commands to run.

## Steps

Run each non-empty command from the `commands` section in order. Skip any command whose value is empty (`""`).

### 1. Type Check

Run the `typecheck` command from `claude-workspace.yaml`.

**What it checks**:
- Type errors and mismatches
- Missing type definitions
- Strict mode violations

**Common Issues & Fixes**:
- Missing type definitions -> Add proper type annotations
- Type mismatches -> Fix type incompatibilities
- Missing module declarations -> Check path aliases or install type packages

### 2. Lint Check

Run the `lint` command from `claude-workspace.yaml`.

**What it checks**:
- Code style violations
- Unused variables
- Potential bugs and anti-patterns

**Common Issues & Fixes**:
- Style violations -> Run the `format` command if available
- Unused variables -> Remove or prefix with underscore
- Linting rule errors -> Fix manually or adjust rules

### 3. Test Suite

Run the `test` command from `claude-workspace.yaml`.

**What it checks**:
- All tests pass
- No broken tests
- Coverage thresholds met (if configured)

**Common Issues & Fixes**:
- Test failures -> Check expected vs actual values
- Import errors -> Verify module paths
- Coverage below threshold -> Add more tests

### 4. Build Verification

Run the `build` command from `claude-workspace.yaml`.

**What it checks**:
- Project builds correctly
- No build-time errors
- Asset/module resolution works

**Common Issues & Fixes**:
- Module not found -> Check imports and dependencies
- Build configuration errors -> Review build config files
- Missing environment variables -> Check required env vars

### 5. Dependency Audit (Optional)

If the project uses npm/yarn:
```bash
npm audit 2>/dev/null || yarn audit 2>/dev/null
```

If the project uses pip:
```bash
pip audit 2>/dev/null || echo "pip-audit not installed"
```

### 6. Project Structure Validation

**What it checks**:
- Required config files exist (CLAUDE.md, claude-workspace.yaml, etc.)
- Git status is clean (no uncommitted sensitive files like `.env`)

## Output Format

```markdown
# Project Health Check
*Run at: {timestamp}*

## Passed Checks (N/M)

1. **Type Check**: No errors
2. **Lint**: No issues
3. **Tests**: All N tests passed
4. **Build**: Build successful

## Failed Checks (N/M)

5. **[Check Name]**: [Error summary]
   - Details: [specific errors]
   - Recommendation: [fix suggestion]

## Summary

**Overall Health**: [Excellent|Good|Fair|Poor] (N/M passing)

**Action Items**:
1. [Priority action 1]
2. [Priority action 2]
```

## Health Score Calculation

```
Health Score = (Passed Checks / Total Checks) x 100

- 100%: Excellent - Production ready
- 80-99%: Good - Minor issues
- 60-79%: Fair - Several issues need attention
- <60%: Poor - Critical issues, do not deploy
```

---

*Use this command as a comprehensive quality gate before deployments, commits, or starting new features.*
