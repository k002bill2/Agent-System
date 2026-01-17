---
name: check-health
description: Comprehensive project health check including tests, types, linting, and build verification
---

# Project Health Check

Perform a comprehensive health check of the LiveMetro project, running all quality gates and reporting any issues with actionable fixes.

## Steps

### 1. TypeScript Type Check
```bash
npm run type-check
```

**What it checks**:
- TypeScript compilation errors
- Type mismatches
- Missing type definitions
- Strict mode violations

**Common Issues & Fixes**:
- `Property 'x' does not exist on type 'Y'` → Add property to interface or use type assertion
- `Type 'undefined' is not assignable to type 'X'` → Add null check or use optional chaining
- `Cannot find module '@/...'` → Check path aliases in tsconfig.json

### 2. ESLint Check
```bash
npm run lint
```

**What it checks**:
- Code style violations
- Unused variables
- Missing dependencies in useEffect
- Potential bugs (== vs ===, etc.)

**Common Issues & Fixes**:
- `React Hook useEffect has missing dependencies` → Add dependencies or use useCallback
- `'x' is assigned but never used` → Remove unused variable
- `Prefer const over let` → Change let to const

### 3. Test Suite
```bash
npm test
```

**What it checks**:
- All unit tests pass
- No broken tests
- Test coverage thresholds met

**Common Issues & Fixes**:
- `Test suite failed to run` → Check for syntax errors in test files
- `Expected X but received Y` → Update test expectations or fix implementation
- `Coverage for X (50%) does not meet threshold (75%)` → Add more tests

### 4. Build Verification
```bash
npm run build:development
```

**What it checks**:
- App bundles correctly for iOS/Android
- No build-time errors
- Asset loading works
- Environment variables are accessible

**Common Issues & Fixes**:
- `Module not found` → Check imports and dependencies
- `EXPO_PUBLIC_ prefix required` → Rename env variables
- `Asset 'x' not found` → Check asset paths in app.json

### 5. Dependency Audit
```bash
npm audit
```

**What it checks**:
- Security vulnerabilities in dependencies
- Outdated packages with known issues

**Common Issues & Fixes**:
- `High severity vulnerability` → Run `npm audit fix`
- `Breaking changes in update` → Check changelog before updating

### 6. Project Structure Validation

**What it checks**:
- Required files exist (CLAUDE.md, .claudecode.json, etc.)
- Skills and Agents are properly configured
- Git status is clean (no uncommitted sensitive files)

## Output Format

```markdown
# LiveMetro Project Health Check
*Run at: 2025-12-28 09:30:00*

## ✅ Passed Checks (4/6)

1. ✅ **TypeScript**: No type errors
2. ✅ **ESLint**: No linting issues
3. ✅ **Tests**: All 85 tests passed
4. ✅ **Build**: Development build successful

## ❌ Failed Checks (2/6)

5. ❌ **Test Coverage**: Below threshold
   - Current: 72% statements (target: 75%)
   - Files below threshold: 8
   - Recommendation: Run `/test-coverage` command

6. ⚠️ **Dependencies**: 2 moderate vulnerabilities
   - axios: Moderate (CVE-2024-XXXX)
   - Recommendation: Run `npm audit fix`

## Summary

**Overall Health**: 🟡 **Good** (4/6 passing)

**Action Items**:
1. Add tests to improve coverage to 75%
2. Update axios to patch security vulnerability
3. Commit changes before proceeding with new features

## Quick Fixes

```bash
# Fix dependencies
npm audit fix

# Check updated coverage
npm test -- --coverage

# Verify build still works
npm run build:development
```

## Next Steps

**Recommended Actions**:
1. High Priority: Fix security vulnerabilities (`npm audit fix`)
2. Medium Priority: Improve test coverage (use `/test-coverage`)
3. Low Priority: Update non-critical dependencies
```

## Health Score Calculation

```
Health Score = (Passed Checks / Total Checks) × 100

- 100%: 🟢 Excellent - Production ready
- 80-99%: 🟡 Good - Minor issues
- 60-79%: 🟠 Fair - Several issues need attention
- <60%: 🔴 Poor - Critical issues, do not deploy
```

## Integration Scenarios

### Pre-Deployment Check
```bash
# Before deploying to production
"Run check-health command to verify app is deployment-ready"

# If health score < 80%, block deployment
```

### Daily Development Routine
```bash
# Start of day
"Run check-health to see current project status"

# End of day
"Run check-health before committing today's work"
```

### CI/CD Integration
```yaml
# .github/workflows/health-check.yml
name: Project Health Check

on: [pull_request]

jobs:
  health:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Install dependencies
        run: npm install
      - name: TypeScript Check
        run: npm run type-check
      - name: Lint Check
        run: npm run lint
      - name: Test Suite
        run: npm test -- --coverage
      - name: Build Verification
        run: npm run build:development
```

## Detailed Check Descriptions

### TypeScript Check (`npm run type-check`)
- Runs `tsc --noEmit` to check types without building
- Fast feedback on type errors
- Catches issues before runtime

### ESLint Check (`npm run lint`)
- Enforces code style consistency
- Identifies potential bugs
- Ensures React best practices (hooks dependencies, etc.)

### Test Suite (`npm test`)
- Runs all Jest tests in `src/**/__tests__/`
- Verifies business logic correctness
- Checks UI component rendering

### Build Verification
- Ensures app can be built for deployment
- Validates Expo configuration (app.json)
- Checks environment variable setup
- Verifies asset bundling

### Dependency Audit
- Scans for known security vulnerabilities
- Checks for outdated packages with critical updates
- Recommends safe update paths

### Project Structure
- Validates configuration files exist
- Checks Skills/Agents are properly formatted
- Ensures no sensitive files (`.env`) in git

## Continuous Monitoring

For continuous health monitoring, consider:

```typescript
// src/services/monitoring/healthCheckService.ts
export const healthCheckService = {
  async runHealthCheck(): Promise<HealthReport> {
    // Automated health checks
    const typeCheck = await runTypeCheck();
    const lintCheck = await runLintCheck();
    const testCheck = await runTests();

    return {
      overall: calculateHealth([typeCheck, lintCheck, testCheck]),
      checks: { typeCheck, lintCheck, testCheck }
    };
  }
};
```

---

*Use this command as a comprehensive quality gate before deployments, commits, or starting new features.*
