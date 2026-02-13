---
name: test-automation
description: Generate comprehensive Vitest tests for React Web components, hooks, and stores. Use when writing tests, improving coverage, or test-driven development.
type: skill
enforcement: suggest
priority: high
triggers:
  keywords:
    - test
    - vitest
    - coverage
    - tdd
    - testing library
  patterns:
    - "(write|add|create).*?test"
    - "(run|check).*?coverage"
    - "test.*?(component|hook|store)"
  files:
    - "**/__tests__/**"
    - "**/*.test.ts"
    - "**/*.test.tsx"
---

# Test Automation Skill

## Purpose
Create comprehensive unit and integration tests for AOS Dashboard components, hooks, and stores using Vitest and React Testing Library.

## When to Use
- Writing tests for new components or features
- Improving test coverage (target: 75% statements, 70% functions)
- Implementing test-driven development (TDD)
- Debugging failing tests
- Creating mock data and fixtures

## Testing Standards

### Coverage Requirements
- **Statements**: 75% minimum
- **Lines**: 75% minimum
- **Functions**: 70% minimum
- **Branches**: 60% minimum

### Test Location
- Co-located with source files in `__tests__/` directories
- Example: `src/components/agents/__tests__/AgentCard.test.tsx`

### Naming Conventions
- Test files: `*.test.ts` or `*.test.tsx`
- Test suites: `describe('ComponentName', () => {})`
- Test cases: `it('should do something', () => {})`

## Instructions

### 1. Analyze the Code
- Read the component/hook/service implementation
- Identify all functions, props, and edge cases
- Note external dependencies (Firebase, API)

### 2. Identify Test Scenarios
**Happy Path**:
- Normal usage with valid inputs
- Expected outputs and behaviors

**Edge Cases**:
- Empty data, null values, undefined
- Loading states
- Extreme values (very long strings, large numbers)

**Error Cases**:
- API failures
- Firebase errors
- Permission denials
- Network timeouts

### 3. Create Test File
```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { ComponentName } from '../ComponentName';

describe('ComponentName', () => {
  // Tests here
});
```

### 4. Mock External Dependencies

**API Services**:
```typescript
vi.mock('@/lib/api', () => ({
  api: {
    getSessions: vi.fn(),
    getAgents: vi.fn()
  }
}));
```

**Zustand Stores**:
```typescript
vi.mock('@/stores/orchestration', () => ({
  useOrchestration: vi.fn(() => ({
    sessions: [],
    loading: false,
    fetchSessions: vi.fn(),
  })),
}));
```

**React Router**:
```typescript
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});
```

### 5. Write Tests

**Component Tests**:
```typescript
describe('AgentCard', () => {
  const mockAgent = {
    id: 'agent1',
    name: 'web-ui-specialist',
    status: 'available',
    tools: ['read', 'edit', 'bash']
  };

  it('renders agent name correctly', () => {
    const { getByText } = render(<AgentCard agent={mockAgent} />);
    expect(getByText('web-ui-specialist')).toBeTruthy();
  });

  it('handles press event', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <AgentCard agent={mockAgent} onPress={onPress} />
    );

    fireEvent.press(getByTestId('agent-card'));
    expect(onPress).toHaveBeenCalledWith(mockAgent);
  });

  it('shows loading state', () => {
    const { getByTestId } = render(
      <AgentCard agent={mockAgent} loading={true} />
    );
    expect(getByTestId('loading-indicator')).toBeTruthy();
  });
});
```

**Hook Tests**:
```typescript
import { renderHook, act } from '@testing-library/react-hooks';
import { useRealtimeAgents } from '../useRealtimeAgents';

describe('useRealtimeAgents', () => {
  it('fetches train data on mount', async () => {
    const { result, waitForNextUpdate } = renderHook(() =>
      useRealtimeAgents('agent1')
    );

    expect(result.current.loading).toBe(true);

    await waitForNextUpdate();

    expect(result.current.loading).toBe(false);
    expect(result.current.trains).toBeDefined();
  });

  it('handles errors gracefully', async () => {
    // Mock API to throw error
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result, waitForNextUpdate } = renderHook(() =>
      useRealtimeAgents('invalid-agent')
    );

    await waitForNextUpdate();

    expect(result.current.error).toBeTruthy();
    expect(result.current.trains).toEqual([]);
  });
});
```

**Service Tests**:
```typescript
import { dataManager } from '../dataManager';

describe('dataManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches from Seoul API first', async () => {
    const data = await dataManager.getAgentTasks('agent1');

    expect(agentRegistryApi.getAgentStatus).toHaveBeenCalledWith('agent1');
    expect(data).toBeDefined();
  });

  it('falls back to Firebase on API failure', async () => {
    // Mock Seoul API failure
    agentRegistryApi.getAgentStatus.mockRejectedValue(new Error('API Error'));

    const data = await dataManager.getAgentTasks('agent1');

    expect(trainService.getAgentTasks).toHaveBeenCalledWith('agent1');
  });

  it('uses cache when available and fresh', async () => {
    // Setup cache
    await AsyncStorage.setItem('cache_key', JSON.stringify({
      data: mockData,
      timestamp: Date.now()
    }));

    const data = await dataManager.getAgentTasks('agent1');

    // Should not call APIs
    expect(agentRegistryApi.getAgentStatus).not.toHaveBeenCalled();
    expect(data).toEqual(mockData);
  });
});
```

### 6. Verify Coverage
```bash
npm test -- --coverage
```

Check coverage report and add tests for uncovered lines.

## Common Patterns

### Testing Async Operations
```typescript
it('fetches data asynchronously', async () => {
  render(<Component />);

  await waitFor(() => {
    expect(screen.getByText('Loaded Data')).toBeInTheDocument();
  });
});
```

### Testing Navigation
```typescript
import { useNavigate } from 'react-router-dom';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

it('navigates to detail page', () => {
  const navigate = vi.fn();
  vi.mocked(useNavigate).mockReturnValue(navigate);

  render(<Component />);
  fireEvent.click(screen.getByTestId('detail-button'));

  expect(navigate).toHaveBeenCalledWith('/sessions/1');
});
```

### Testing API Subscriptions
```typescript
it('subscribes to API updates and cleans up', () => {
  const unsubscribe = vi.fn();
  vi.mocked(api.subscribe).mockReturnValue(unsubscribe);

  const { unmount } = render(<Component sessionId="1" />);

  expect(api.subscribe).toHaveBeenCalled();

  unmount();
  expect(unsubscribe).toHaveBeenCalled(); // Verify cleanup
});
```

### Testing Error Boundaries
```typescript
it('handles errors with error boundary', () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

  const ThrowError = () => {
    throw new Error('Test error');
  };

  render(
    <ErrorBoundary>
      <ThrowError />
    </ErrorBoundary>
  );

  expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  spy.mockRestore();
});
```

## Best Practices

1. **AAA Pattern**: Arrange, Act, Assert
2. **One Assertion per Test**: Keep tests focused
3. **Mock External Dependencies**: Don't test third-party code
4. **Test User Behavior**: Not implementation details
5. **Use testID**: For finding elements reliably
6. **Clean Up**: Clear mocks and timers in afterEach
7. **Descriptive Names**: Test names should explain what they verify

## Test Configuration

AOS Dashboard uses Vitest with React Testing Library:

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      thresholds: {
        statements: 75,
        branches: 60,
        functions: 70,
        lines: 75
      }
    }
  }
});
```

## Resources
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Vitest Documentation](https://vitest.dev/guide/)
- [Testing Hooks](https://testing-library.com/docs/react-testing-library/api#renderhook)
- Project setup: `src/dashboard/src/test/setup.ts`

## Example: Complete Test Suite

```typescript
// src/dashboard/src/components/__tests__/SessionCard.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { SessionCard } from '../claude-sessions/SessionCard';
import type { ClaudeSession } from '@/types/session';

describe('SessionCard', () => {
  const mockSession: ClaudeSession = {
    id: 'session-1',
    projectName: 'Test Project',
    status: 'active',
    messageCount: 42,
    estimatedCost: 0.15,
    createdAt: new Date().toISOString(),
    lastActivity: new Date().toISOString()
  };

  it('renders session information correctly', () => {
    render(<SessionCard session={mockSession} />);

    expect(screen.getByText('Test Project')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('42 messages')).toBeInTheDocument();
  });

  it('shows cost with correct formatting', () => {
    render(<SessionCard session={mockSession} />);

    expect(screen.getByText('$0.15')).toBeInTheDocument();
  });

  it('handles click event', () => {
    const onClick = vi.fn();
    render(<SessionCard session={mockSession} onClick={onClick} />);

    fireEvent.click(screen.getByTestId('session-card'));
    expect(onClick).toHaveBeenCalledWith(mockSession);
  });

  it('applies correct status color', () => {
    render(<SessionCard session={mockSession} />);

    const statusBadge = screen.getByTestId('status-badge');
    expect(statusBadge).toHaveClass('bg-green-100');
  });

  it('shows idle status correctly', () => {
    const idleSession = { ...mockSession, status: 'idle' as const };
    render(<SessionCard session={idleSession} />);

    expect(screen.getByText('idle')).toBeInTheDocument();
    expect(screen.getByTestId('status-badge')).toHaveClass('bg-yellow-100');
  });
});
```

---

*Use this skill to maintain high test coverage and ensure code quality in AOS Dashboard.*
