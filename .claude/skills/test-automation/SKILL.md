---
name: test-automation
description: Generate comprehensive Jest tests for React Native components, hooks, and services. Use when writing tests, improving coverage, or test-driven development.
---

# Test Automation Skill

## Purpose
Create comprehensive unit and integration tests for LiveMetro components, hooks, and services using Jest and React Native Testing Library.

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
- Example: `src/components/train/__tests__/StationCard.test.tsx`

### Naming Conventions
- Test files: `*.test.ts` or `*.test.tsx`
- Test suites: `describe('ComponentName', () => {})`
- Test cases: `it('should do something', () => {})`

## Instructions

### 1. Analyze the Code
- Read the component/hook/service implementation
- Identify all functions, props, and edge cases
- Note external dependencies (Firebase, API, Expo modules)

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
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ComponentName } from '../ComponentName';

describe('ComponentName', () => {
  // Tests here
});
```

### 4. Mock External Dependencies

**Firebase**:
```typescript
jest.mock('@/services/train/trainService', () => ({
  trainService: {
    subscribeToTrainUpdates: jest.fn(),
    getTrainArrivals: jest.fn()
  }
}));
```

**Seoul API**:
```typescript
jest.mock('@/services/api/seoulSubwayApi', () => ({
  getRealtimeArrival: jest.fn(),
  getStationTimetable: jest.fn()
}));
```

**Expo Modules**:
```typescript
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn()
}));
```

### 5. Write Tests

**Component Tests**:
```typescript
describe('StationCard', () => {
  const mockStation = {
    id: 'station1',
    name: '강남역',
    lineId: 'line2',
    coordinates: { latitude: 37.498, longitude: 127.028 }
  };

  it('renders station name correctly', () => {
    const { getByText } = render(<StationCard station={mockStation} />);
    expect(getByText('강남역')).toBeTruthy();
  });

  it('handles press event', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <StationCard station={mockStation} onPress={onPress} />
    );

    fireEvent.press(getByTestId('station-card'));
    expect(onPress).toHaveBeenCalledWith(mockStation);
  });

  it('shows loading state', () => {
    const { getByTestId } = render(
      <StationCard station={mockStation} loading={true} />
    );
    expect(getByTestId('loading-indicator')).toBeTruthy();
  });
});
```

**Hook Tests**:
```typescript
import { renderHook, act } from '@testing-library/react-hooks';
import { useRealtimeTrains } from '../useRealtimeTrains';

describe('useRealtimeTrains', () => {
  it('fetches train data on mount', async () => {
    const { result, waitForNextUpdate } = renderHook(() =>
      useRealtimeTrains('station1')
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
      useRealtimeTrains('invalid-station')
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
    const data = await dataManager.getTrainArrivals('station1');

    expect(seoulSubwayApi.getRealtimeArrival).toHaveBeenCalledWith('station1');
    expect(data).toBeDefined();
  });

  it('falls back to Firebase on API failure', async () => {
    // Mock Seoul API failure
    seoulSubwayApi.getRealtimeArrival.mockRejectedValue(new Error('API Error'));

    const data = await dataManager.getTrainArrivals('station1');

    expect(trainService.getTrainArrivals).toHaveBeenCalledWith('station1');
  });

  it('uses cache when available and fresh', async () => {
    // Setup cache
    await AsyncStorage.setItem('cache_key', JSON.stringify({
      data: mockData,
      timestamp: Date.now()
    }));

    const data = await dataManager.getTrainArrivals('station1');

    // Should not call APIs
    expect(seoulSubwayApi.getRealtimeArrival).not.toHaveBeenCalled();
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
  const { getByText } = render(<Component />);

  await waitFor(() => {
    expect(getByText('Loaded Data')).toBeTruthy();
  });
});
```

### Testing Navigation
```typescript
import { useNavigation } from '@react-navigation/native';

jest.mock('@react-navigation/native');

it('navigates to detail screen', () => {
  const navigate = jest.fn();
  (useNavigation as jest.Mock).mockReturnValue({ navigate });

  const { getByTestId } = render(<Component />);
  fireEvent.press(getByTestId('detail-button'));

  expect(navigate).toHaveBeenCalledWith('StationDetail', { stationId: '1' });
});
```

### Testing Firebase Subscriptions
```typescript
it('subscribes to Firebase updates', () => {
  const unsubscribe = jest.fn();
  trainService.subscribeToTrainUpdates.mockReturnValue(unsubscribe);

  const { unmount } = render(<Component stationId="1" />);

  expect(trainService.subscribeToTrainUpdates).toHaveBeenCalled();

  unmount();
  expect(unsubscribe).toHaveBeenCalled(); // Verify cleanup
});
```

### Testing Error Boundaries
```typescript
it('handles errors with error boundary', () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

  const ThrowError = () => {
    throw new Error('Test error');
  };

  const { getByText } = render(
    <ErrorBoundary>
      <ThrowError />
    </ErrorBoundary>
  );

  expect(getByText('Something went wrong')).toBeTruthy();
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

LiveMetro uses Jest with React Native preset:

```javascript
// jest.config.js
module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  testEnvironment: 'node',
  coverageThreshold: {
    global: {
      statements: 75,
      branches: 60,
      functions: 70,
      lines: 75
    }
  }
};
```

## Resources
- [React Native Testing Library](https://callstack.github.io/react-native-testing-library/)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Hooks](https://react-hooks-testing-library.com/)
- Project setup: `src/__tests__/setup.ts`

## Example: Complete Test Suite

```typescript
// src/components/train/__tests__/TrainArrivalCard.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { TrainArrivalCard } from '../TrainArrivalCard';
import type { TrainArrival } from '@/models/train';

describe('TrainArrivalCard', () => {
  const mockTrain: TrainArrival = {
    trainNo: 'T1001',
    stationName: '강남역',
    direction: 'up',
    arrivalTime: 120, // seconds
    destinationName: '신도림',
    lineId: 'line2',
    status: 'NORMAL',
    updatedAt: new Date()
  };

  it('renders train information correctly', () => {
    const { getByText } = render(<TrainArrivalCard train={mockTrain} />);

    expect(getByText('강남역')).toBeTruthy();
    expect(getByText('신도림 방면')).toBeTruthy();
    expect(getByText('2분 후')).toBeTruthy();
  });

  it('shows delayed status with warning color', () => {
    const delayedTrain = { ...mockTrain, status: 'DELAYED' };
    const { getByTestId } = render(<TrainArrivalCard train={delayedTrain} />);

    const statusBadge = getByTestId('status-badge');
    expect(statusBadge.props.style).toContainEqual(
      expect.objectContaining({ backgroundColor: '#FFA500' })
    );
  });

  it('handles press event', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <TrainArrivalCard train={mockTrain} onPress={onPress} />
    );

    fireEvent.press(getByTestId('train-card'));
    expect(onPress).toHaveBeenCalledWith(mockTrain);
  });

  it('formats arrival time correctly', () => {
    const testCases = [
      { seconds: 30, expected: '곧 도착' },
      { seconds: 60, expected: '1분 후' },
      { seconds: 120, expected: '2분 후' },
      { seconds: 300, expected: '5분 후' }
    ];

    testCases.forEach(({ seconds, expected }) => {
      const train = { ...mockTrain, arrivalTime: seconds };
      const { getByText } = render(<TrainArrivalCard train={train} />);
      expect(getByText(expected)).toBeTruthy();
    });
  });

  it('shows error state when train data is invalid', () => {
    const invalidTrain = { ...mockTrain, trainNo: '' };
    const { getByText } = render(<TrainArrivalCard train={invalidTrain} />);

    expect(getByText('열차 정보 없음')).toBeTruthy();
  });
});
```

---

*Use this skill to maintain high test coverage and ensure code quality in LiveMetro.*
