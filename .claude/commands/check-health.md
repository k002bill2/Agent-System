---
name: check-health
description: Comprehensive project health check including tests, types, linting, and build verification.
disable-model-invocation: true
---

# Project Health Check

Perform a comprehensive health check of the AOS Dashboard project, running all quality gates and reporting any issues with actionable fixes.

> **게이트 SSOT**: 빌드/타입/린트/테스트 게이트 명령의 유일한 정의는 `verification-loop` 스킬이다 (BE/FE 트랙·CWD·통과 기준 포함). 이 커맨드는 그 게이트 위에 **의존성 audit·프로젝트 구조 검증·헬스 스코어 리포트**를 얹은 대시보드 중심 뷰다. 게이트 명령이 바뀌면 verification-loop만 갱신하고, 백엔드 변경 검증은 verification-loop의 백엔드 트랙을 따른다.

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
# 원샷 테스트 (루트 스크립트 → src/dashboard `vitest run` 위임 — 커버리지 미포함)
npm test

# 커버리지 검증 — 커버리지 임계치를 주장하려면 반드시 이 명령을 실행해야 한다
cd src/dashboard && npm run test:coverage
```

**What it checks**:
- All unit tests pass (`npm test`)
- No broken tests
- Coverage thresholds — **`npm run test:coverage`만 검증한다** (임계치 SSOT: `src/dashboard/vitest.config.ts`의 `coverage.thresholds`). 일반 `npm test`는 커버리지를 산출하지 않으므로 그 출력으로 커버리지 충족을 주장하지 않는다

**Common Issues & Fixes**:
- `Test suite failed to run` → Check for syntax errors in test files
- `Expected X but received Y` → Update test expectations or fix implementation
- `Coverage for X does not meet threshold` (임계치 수치는 vitest.config.ts 참조) → Add more tests

### 4. Build Verification
```bash
npm run build
```

**What it checks**:
- App bundles correctly
- No build-time errors
- Asset loading works
- Environment variables are accessible

**Common Issues & Fixes**:
- `Module not found` → Check imports and dependencies
- `VITE_ prefix required` → Rename env variables for client-side access
- `Asset 'x' not found` → Check asset paths in vite.config.ts

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
- Required files exist (CLAUDE.md, .claude/settings.json, docs/ 등)
- Skills and Agents are properly configured
- Git status is clean (no uncommitted sensitive files)

## Output Format

```markdown
# AOS Dashboard Project Health Check
*Run at: 2025-12-28 09:30:00*

## ✅ Passed Checks (4/6)

1. ✅ **TypeScript**: No type errors
2. ✅ **ESLint**: No linting issues
3. ✅ **Tests**: All 85 tests passed
4. ✅ **Build**: Development build successful

## ❌ Failed Checks (2/6)

5. ❌ **Test Coverage**: Below threshold
   - Current: 72% statements (vitest.config.ts `coverage.thresholds` 미달)
   - Files below threshold: 8
   - Recommendation: Run `/test-coverage` command

6. ⚠️ **Dependencies**: 2 moderate vulnerabilities
   - axios: Moderate (CVE-2024-XXXX)
   - Recommendation: Run `npm audit fix`

## Summary

**Overall Health**: 🟡 **Good** (4/6 passing)

**Action Items**:
1. Add tests to meet the `vitest.config.ts` coverage thresholds
2. Update axios to patch security vulnerability
3. Commit changes before proceeding with new features

## Quick Fixes

```bash
# Fix dependencies
npm audit fix

# Check updated coverage
cd src/dashboard && npm run test:coverage

# Verify build still works
npm run build
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

실제 CI 정의는 `.github/workflows/ci.yml`이 유일한 진실원이다 — 예시 YAML을 이 문서에 복제하지 않는다. CI의 7개 job(backend-lint/typecheck/test, frontend-lint/typecheck/test/build)이 이 헬스 체크의 게이트와 대응한다.

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
- Vitest 원샷 실행 — 루트 스크립트가 `src/dashboard`의 `vitest run`으로 위임한다 (커버리지 미포함)
- 커버리지 검증은 별도 명령: `cd src/dashboard && npm run test:coverage`
- Verifies business logic correctness
- Checks UI component rendering

### Build Verification
- Ensures app can be built for deployment
- Validates Vite configuration (vite.config.ts)
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
