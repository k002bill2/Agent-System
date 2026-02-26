---
name: test-coverage
description: Run tests with coverage report and identify areas needing more tests
---

# Test Coverage Analysis

Run the complete test suite with coverage reporting, analyze the results, and provide actionable recommendations for improving test coverage.

## Steps

1. **Run Tests with Coverage**
   ```bash
   npm test -- --coverage
   ```

2. **Analyze Coverage Report**
   - Identify files with < 75% statement coverage
   - Identify files with < 70% function coverage
   - Identify files with < 60% branch coverage
   - List completely untested files

3. **Prioritize Coverage Gaps**
   - **High Priority**: Core services (API clients, data managers, auth)
   - **Medium Priority**: Custom hooks (data fetching, state management, side effects)
   - **Low Priority**: UI components (already have some tests)

4. **Generate Test Recommendations**
   For each file with insufficient coverage:
   - List specific functions/branches missing tests
   - Suggest test scenarios (happy path, edge cases, errors)
   - Estimate number of tests needed

5. **Create Test Stubs** (Optional)
   Offer to create test file skeletons for completely untested files

## Output Format

```markdown
# Test Coverage Report

## Summary
- Overall Coverage: X%
- Statements: X% (target: 75%)
- Branches: X% (target: 60%)
- Functions: X% (target: 70%)
- Lines: X% (target: 75%)

## Files Below Coverage Threshold

### High Priority
1. **src/services/dataManager.ts** (45% coverage)
   - Missing tests: fallback logic
   - Missing tests: cache expiration handling
   - Missing tests: error scenarios
   - Suggested tests: 8 new tests

2. **src/services/api/apiClient.ts** (60% coverage)
   - Missing tests: timeout handling
   - Missing tests: malformed API responses
   - Suggested tests: 5 new tests

### Medium Priority
1. **src/hooks/useDataFetch.ts** (55% coverage)
   - Missing tests: stale data detection
   - Missing tests: subscription cleanup
   - Suggested tests: 4 new tests

### Low Priority
(Components with visual/interaction testing needs)

## Untested Files
1. src/utils/performanceUtils.ts (0% coverage)
2. src/services/monitoring/healthCheck.ts (0% coverage)

## Recommended Next Steps
1. Focus on core services (most gaps, highest impact)
2. Add error scenario tests to API clients
3. Test subscription cleanup in hooks (prevents memory leaks)

## Quick Wins (Easy to Test)
- src/utils/helpers.ts: Pure functions, easy to test
- src/models/types.ts: Type definitions, minimal testing needed
```

## Follow-up Actions

After running this command, Claude should:

1. **Offer to Create Tests**: "Should I create tests for the high-priority gaps?"
2. **Use test-automation Skill**: Automatically use the test-automation skill to generate tests
3. **Verify Coverage Improvement**: Re-run coverage after adding tests

---

*Use this command to systematically improve test coverage in your React TypeScript project.*
