---
name: test-automation
description: "Use when writing Vitest tests, improving test coverage below 75%, debugging failing tests, or doing TDD for AOS Dashboard React components, hooks, and stores."
---

# Test Automation

## Overview

AOS Dashboard의 React 컴포넌트, 훅, 스토어에 대한 Vitest 테스트를 작성하고 커버리지 목표를 달성하는 스킬. AAA 패턴과 사용자 행동 중심 테스트를 원칙으로 한다.

**REQUIRED BACKGROUND:** superpowers:test-driven-development (TDD 시)

## Coverage Requirements

| Metric | Minimum |
|--------|---------|
| Statements | 75% |
| Lines | 75% |
| Functions | 70% |
| Branches | 60% |

## Project Conventions

- **Location**: Co-located in `__tests__/` directories (e.g., `src/components/agents/__tests__/AgentCard.test.tsx`)
- **File naming**: `*.test.ts` or `*.test.tsx`
- **Suite naming**: `describe('ComponentName', () => {})`
- **Test naming**: `it('should do something', () => {})`
- **Setup file**: `src/dashboard/src/test/setup.ts`
- **Path aliases**: `@/components/...`, `@/lib/...`, `@/stores/...`

## Workflow

### Step 1: Analyze the Code
- Read the component/hook/service implementation
- Identify all functions, props, and edge cases
- Note external dependencies (API services, stores, router)

### Step 2: Identify Test Scenarios

| Category | Examples |
|----------|---------|
| Happy path | Valid inputs, expected outputs |
| Edge cases | Empty data, null, undefined, loading states, extreme values |
| Error cases | API failures, permission denials, network timeouts |

### Step 3: Create Test File
```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { ComponentName } from '../ComponentName';

describe('ComponentName', () => {
  // Tests here
});
```

### Step 4: Mock External Dependencies
See `references/vitest-patterns.md` for mock patterns (API, Zustand stores, React Router).

### Step 5: Write Tests
Cover all scenarios from Step 2. Follow AAA pattern (Arrange, Act, Assert).
See `references/vitest-patterns.md` for component, hook, service, and common pattern examples.

### Step 6: Verify Coverage
```bash
cd src/dashboard && npm test -- --coverage
```

Check coverage report and add tests for uncovered lines.

## Output Format

When generating tests, provide:
1. Complete test file with all imports
2. Mock setup for external dependencies
3. Coverage summary after running tests
4. Suggestions for additional test scenarios if coverage is below thresholds

## Key Rules

- Use `vi.fn()` / `vi.mock()` (not `jest.fn()` / `jest.mock()`)
- Use `vi.spyOn(console, 'error').mockImplementation(() => {})` to suppress expected errors
- Use `waitFor` for async assertions
- Clean up mocks in `afterEach` or `beforeEach`
- Test user behavior, not implementation details
- One primary assertion per test case

## Common Mistakes

| 실수 | 수정 |
|------|------|
| `jest.fn()` 사용 | `vi.fn()` / `vi.mock()` (Vitest 전용) |
| `act()` 경고 무시 | `waitFor` 또는 `findBy*`로 비동기 래핑 |
| 구현 세부사항 테스트 | 사용자 행동 중심 (`getByRole`, `getByText`) |
| mock cleanup 누락 | `afterEach(() => vi.restoreAllMocks())` |
| 커버리지 미달 방치 | Step 6에서 uncovered lines 확인 후 테스트 추가 |
| 상대경로 import | `@/components/...` path alias 사용 |

## References

Detailed test patterns, mock examples, complete test suites, and configuration:
`references/vitest-patterns.md`
