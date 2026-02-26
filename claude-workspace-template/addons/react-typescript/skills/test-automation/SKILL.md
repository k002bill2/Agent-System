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
Create comprehensive unit and integration tests for React TypeScript components, hooks, and stores using Vitest and React Testing Library.

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
- Example: `src/components/items/__tests__/ItemCard.test.tsx`

### Naming Conventions
- Test files: `*.test.ts` or `*.test.tsx`
- Test suites: `describe('ComponentName', () => {})`
- Test cases: `it('should do something', () => {})`

## Instructions

### 1. Analyze the Code
- Read the component/hook/service implementation
- Identify all functions, props, and edge cases
- Note external dependencies (API, services)

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
- Service errors
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
    getData: vi.fn(),
    getItems: vi.fn()
  }
}));
```

**State Management Stores**:
```typescript
vi.mock('@/stores/dataStore', () => ({
  useDataStore: vi.fn(() => ({
    items: [],
    loading: false,
    fetchItems: vi.fn(),
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
describe('ItemCard', () => {
  const mockItem = {
    id: 'item1',
    name: 'Test Item',
    status: 'active',
    tools: ['read', 'edit', 'bash']
  };

  it('renders item name correctly', () => {
    const { getByText } = render(<ItemCard item={mockItem} />);
    expect(getByText('Test Item')).toBeTruthy();
  });

  it('handles click event', () => {
    const onClick = vi.fn();
    render(<ItemCard item={mockItem} onClick={onClick} />);

    fireEvent.click(screen.getByTestId('item-card'));
    expect(onClick).toHaveBeenCalledWith(mockItem);
  });

  it('shows loading state', () => {
    render(<ItemCard item={mockItem} loading={true} />);
    expect(screen.getByTestId('loading-indicator')).toBeTruthy();
  });
});
```

**Hook Tests**:
```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { useData } from '../useData';

describe('useData', () => {
  it('fetches data on mount', async () => {
    const { result } = renderHook(() => useData('item1'));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.data).toBeDefined();
    });
  });

  it('handles errors gracefully', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useData('invalid-id'));

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
      expect(result.current.data).toEqual([]);
    });
  });
});
```

**Service Tests**:
```typescript
import { dataManager } from '../dataManager';

describe('dataManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches data from primary API', async () => {
    const data = await dataManager.getData('item1');

    expect(api.getItems).toHaveBeenCalledWith('item1');
    expect(data).toBeDefined();
  });

  it('handles API failure gracefully', async () => {
    (api.getItems as vi.Mock).mockRejectedValue(new Error('API Error'));

    await expect(dataManager.getData('item1')).rejects.toThrow();
  });

  it('uses cache when available and fresh', async () => {
    // Setup cache
    localStorage.setItem('cache_key', JSON.stringify({
      data: mockData,
      timestamp: Date.now()
    }));

    const data = await dataManager.getData('item1');

    expect(api.getItems).not.toHaveBeenCalled();
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

  expect(navigate).toHaveBeenCalledWith('/items/1');
});
```

### Testing API Subscriptions
```typescript
it('subscribes to API updates and cleans up', () => {
  const unsubscribe = vi.fn();
  vi.mocked(api.subscribe).mockReturnValue(unsubscribe);

  const { unmount } = render(<Component itemId="1" />);

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

Recommended Vitest configuration with React Testing Library:

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

---

*Use this skill to maintain high test coverage and ensure code quality in your React TypeScript project.*
