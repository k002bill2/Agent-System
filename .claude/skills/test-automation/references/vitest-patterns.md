# Vitest Test Patterns Reference

## Mock External Dependencies

### API Services
```typescript
vi.mock('@/lib/api', () => ({
  api: {
    getSessions: vi.fn(),
    getAgents: vi.fn()
  }
}));
```

### Zustand Stores
```typescript
vi.mock('@/stores/orchestration', () => ({
  useOrchestration: vi.fn(() => ({
    sessions: [],
    loading: false,
    fetchSessions: vi.fn(),
  })),
}));
```

### React Router
```typescript
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});
```

## Component Test Example

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

  it('handles click event', () => {
    const onClick = vi.fn();
    render(<AgentCard agent={mockAgent} onClick={onClick} />);
    fireEvent.click(screen.getByTestId('agent-card'));
    expect(onClick).toHaveBeenCalledWith(mockAgent);
  });

  it('shows loading state', () => {
    render(<AgentCard agent={mockAgent} loading={true} />);
    expect(screen.getByTestId('loading-indicator')).toBeTruthy();
  });
});
```

## Hook Test Example

```typescript
import { renderHook, act } from '@testing-library/react';

describe('useRealtimeAgents', () => {
  it('fetches data on mount', async () => {
    const { result } = renderHook(() => useRealtimeAgents('agent1'));
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.data).toBeDefined();
    });
  });

  it('handles errors gracefully', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useRealtimeAgents('invalid'));

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
  });
});
```

## Service Test Example

```typescript
describe('dataManager', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('fetches from primary API', async () => {
    const data = await dataManager.getAgentTasks('agent1');
    expect(api.getAgentStatus).toHaveBeenCalledWith('agent1');
    expect(data).toBeDefined();
  });

  it('falls back on API failure', async () => {
    vi.mocked(api.getAgentStatus).mockRejectedValue(new Error('API Error'));
    const data = await dataManager.getAgentTasks('agent1');
    expect(fallbackService.getAgentTasks).toHaveBeenCalledWith('agent1');
  });

  it('uses cache when fresh', async () => {
    await cache.set('key', { data: mockData, timestamp: Date.now() });
    const data = await dataManager.getAgentTasks('agent1');
    expect(api.getAgentStatus).not.toHaveBeenCalled();
    expect(data).toEqual(mockData);
  });
});
```

## Common Patterns

### Async Operations
```typescript
it('fetches data asynchronously', async () => {
  render(<Component />);
  await waitFor(() => {
    expect(screen.getByText('Loaded Data')).toBeInTheDocument();
  });
});
```

### Navigation
```typescript
it('navigates to detail page', () => {
  const navigate = vi.fn();
  vi.mocked(useNavigate).mockReturnValue(navigate);
  render(<Component />);
  fireEvent.click(screen.getByTestId('detail-button'));
  expect(navigate).toHaveBeenCalledWith('/sessions/1');
});
```

### Subscription Cleanup
```typescript
it('subscribes and cleans up', () => {
  const unsubscribe = vi.fn();
  vi.mocked(api.subscribe).mockReturnValue(unsubscribe);
  const { unmount } = render(<Component sessionId="1" />);
  expect(api.subscribe).toHaveBeenCalled();
  unmount();
  expect(unsubscribe).toHaveBeenCalled();
});
```

### Error Boundaries
```typescript
it('handles errors with error boundary', () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const ThrowError = () => { throw new Error('Test error'); };
  render(<ErrorBoundary><ThrowError /></ErrorBoundary>);
  expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  spy.mockRestore();
});
```

## Complete Test Suite Example

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
    expect(screen.getByTestId('status-badge')).toHaveClass('bg-green-100');
  });

  it('shows idle status correctly', () => {
    const idleSession = { ...mockSession, status: 'idle' as const };
    render(<SessionCard session={idleSession} />);
    expect(screen.getByText('idle')).toBeInTheDocument();
    expect(screen.getByTestId('status-badge')).toHaveClass('bg-yellow-100');
  });
});
```

## Test Configuration

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

## Best Practices

1. **AAA Pattern**: Arrange, Act, Assert
2. **One Assertion per Test**: Keep tests focused
3. **Mock External Dependencies**: Don't test third-party code
4. **Test User Behavior**: Not implementation details
5. **Use testID**: For finding elements reliably
6. **Clean Up**: Clear mocks and timers in afterEach
7. **Descriptive Names**: Test names should explain what they verify

## Resources

- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Vitest Documentation](https://vitest.dev/guide/)
- [Testing Hooks](https://testing-library.com/docs/react-testing-library/api#renderhook)
- Project setup: `src/dashboard/src/test/setup.ts`
