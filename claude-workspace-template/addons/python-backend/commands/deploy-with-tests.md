---
description: Run tests and verification before deploying the Python backend
---

# Deploy with Tests

Verify the Python backend passes all checks before building/deploying.
**Never skip a step. If any step fails, stop and fix before continuing.**

Refer to `claude-workspace.yaml` for project-specific paths and commands.

## Execution Steps

### 1. Python Backend Verification

Run the test suite with your project's configured test framework:

```bash
# pytest (default)
pytest --tb=short -q

# Or unittest if configured
python -m unittest discover -s tests -p "test_*.py"
```

If the project uses `claude-workspace.yaml`, check for custom test commands there first.

### 2. Type Checking (if configured)

```bash
# mypy
mypy src/ --ignore-missing-imports

# Or pyright
pyright src/
```

### 3. Linting

```bash
# ruff (preferred)
ruff check .

# Or flake8
flake8 src/
```

### 4. Coverage Check (optional)

If coverage thresholds are configured:

```bash
pytest --cov=src --cov-report=term-missing
```

Coverage thresholds (configurable):
- Statements: 75%+
- Functions: 70%+
- Branches: 60%+

**If thresholds are not met, block deployment.**

### 5. Frontend Verification (if applicable)

Only run this step if the project has a frontend component:

```bash
# TypeScript type check
npx tsc --noEmit

# Lint
npm run lint

# Tests
npm test
```

### 6. Build

```bash
# Docker build (if applicable)
docker build -t myapp .

# Or Python package build
python -m build
```

### 7. Post-Build Verification

Confirm build artifacts exist and are valid.

## Output Format

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEPLOY WITH TESTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[1/N] Python Tests
  All tests passed

[2/N] Type Check
  No type errors

[3/N] Lint Check
  No lint errors

[4/N] Coverage (optional)
  Statements: 78.5% (>= 75%)
  Functions: 72.1% (>= 70%)
  Branches: 65.3% (>= 60%)

[5/N] Build
  Building...
  Build output: dist/

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## On Failure

```
DEPLOY BLOCKED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step Failed: {step}
Reason: {reason}

Fix all errors then retry: /deploy-with-tests
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
