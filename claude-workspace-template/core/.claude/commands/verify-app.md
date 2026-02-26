---
description: Comprehensive app verification — typecheck, lint, test, build in one pass (Boris Cherny feedback loop)
---

# App Verification Workflow

This command implements the **verification feedback loop** emphasized by Boris Cherny.
Run this after every code change to ensure quality.

## Prerequisites

Read `claude-workspace.yaml` from the project root to determine the commands:

```yaml
commands:
  typecheck: "..."
  lint: "..."
  test: "..."
  build: "..."
```

If `claude-workspace.yaml` does not exist, ask the user which commands to run.

## Verification Steps

Run each non-empty command in order. Skip any command whose value is empty (`""`).

### 1. Type Check

Run the `typecheck` command from `claude-workspace.yaml`.

**Pass criteria**: Zero type errors

### 2. Lint Check

Run the `lint` command from `claude-workspace.yaml`.

**Pass criteria**: Zero lint errors (warnings are acceptable)

### 3. Test Suite

Run the `test` command from `claude-workspace.yaml`.

**Pass criteria**:
- All tests pass
- Coverage thresholds met (if configured in project)

### 4. Build Verification

Run the `build` command from `claude-workspace.yaml`.

**Pass criteria**: Build succeeds

## Result Report Format

After verification, summarize results in this format:

```
## Verification Results

| Check      | Status | Details           |
|------------|--------|-------------------|
| Type Check | pass/fail | N errors       |
| Lint       | pass/fail | N errors, M warnings |
| Tests      | pass/fail | N passed, M failed |
| Build      | pass/fail | success/failure |

**Overall Status**: PASS / FAIL
```

## On Failure

### Type Errors
1. Check error location
2. Fix type definitions or add missing types
3. Prefer `unknown` over `any`

### Lint Errors
1. Try auto-fix: run the `format` command from `claude-workspace.yaml`
2. Fix remaining issues manually

### Test Failures
1. Identify the failing tests
2. Compare expected vs actual values
3. Fix the code or update the tests

### Build Failures
1. Check build logs
2. Verify dependencies are installed
3. Clear build cache if needed

## Recommended Usage

### After Code Changes
Run this verification after every significant file edit.

### Before PR Creation
Always run `/verify-app` before creating a pull request.

### CI/CD Integration
Configure the same checks in your CI pipeline.

## Example Run

```
User: /verify-app

Claude:
App Verification Starting...

1. Type Check...
   PASS - 0 errors

2. Lint Check...
   PASS - 0 errors, 3 warnings

3. Test Suite...
   PASS - 85 tests passed
   Coverage: Stmt 91%, Fn 95%, Br 74%

4. Build Verification...
   PASS - Build successful

---
Overall: PASS - All checks passed. Ready for PR.
```
