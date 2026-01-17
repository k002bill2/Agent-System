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
   - **High Priority**: Core services (dataManager, trainService, seoulSubwayApi)
   - **Medium Priority**: Custom hooks (useRealtimeTrains, useLocation, useNotifications)
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
1. **src/services/data/dataManager.ts** (45% coverage)
   - Missing tests: getTrainArrivals fallback logic
   - Missing tests: cache expiration handling
   - Missing tests: error scenarios
   - Suggested tests: 8 new tests

2. **src/services/api/seoulSubwayApi.ts** (60% coverage)
   - Missing tests: timeout handling
   - Missing tests: malformed API responses
   - Suggested tests: 5 new tests

### Medium Priority
1. **src/hooks/useRealtimeTrains.ts** (55% coverage)
   - Missing tests: stale data detection
   - Missing tests: subscription cleanup
   - Suggested tests: 4 new tests

### Low Priority
(Components with visual/interaction testing needs)

## Untested Files
1. src/utils/performanceUtils.ts (0% coverage)
2. src/services/monitoring/healthCheckService.ts (0% coverage)

## Recommended Next Steps
1. Focus on dataManager.ts (core service, many gaps)
2. Add error scenario tests to seoulSubwayApi.ts
3. Test useRealtimeTrains subscription cleanup (prevents memory leaks)

## Quick Wins (Easy to Test)
- src/utils/subwayMapData.ts: Pure functions, easy to test
- src/models/train.ts: Type definitions, minimal testing needed
```

## Example Usage

```bash
# In Claude Code session
"Run the test-coverage command"

# Or use custom command
/test-coverage
```

## Follow-up Actions

After running this command, Claude should:

1. **Offer to Create Tests**: "Should I create tests for the high-priority gaps?"
2. **Use test-automation Skill**: Automatically use the test-automation skill to generate tests
3. **Verify Coverage Improvement**: Re-run coverage after adding tests

## Integration with CI/CD

This command can be integrated into pre-commit hooks:

```json
// .claudecode.json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash(git commit *)",
        "hooks": [{
          "type": "command",
          "command": "npm test -- --coverage --silent"
        }]
      }
    ]
  }
}
```

---

*Use this command to systematically improve test coverage in LiveMetro.*
