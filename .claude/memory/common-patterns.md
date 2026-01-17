# Common Patterns - LiveMetro

자주 사용되는 React Native/Expo 패턴 모음

## 1. 컴포넌트 패턴

### 기본 함수형 컴포넌트
```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  title: string;
  subtitle?: string;
}

export const MyComponent: React.FC<Props> = ({ title, subtitle }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
});
```

### 메모이제이션된 컴포넌트
```typescript
export const OptimizedComponent = React.memo<Props>(({ data }) => {
  // 렌더링 로직
});
```

## 2. 훅 패턴

### 데이터 페칭 훅
```typescript
import { useState, useEffect, useCallback } from 'react';

interface UseDataResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useData<T>(fetchFn: () => Promise<T>): UseDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchFn();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [fetchFn]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
```

### 구독 훅 (Cleanup 포함)
```typescript
export function useSubscription<T>(
  subscribe: (callback: (data: T) => void) => () => void
): T | null {
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    const unsubscribe = subscribe(setData);
    return () => unsubscribe(); // Cleanup 필수!
  }, [subscribe]);

  return data;
}
```

### 폴링 훅
```typescript
export function usePolling<T>(
  fetchFn: () => Promise<T>,
  intervalMs: number = 30000
): T | null {
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    let mounted = true;

    const poll = async () => {
      try {
        const result = await fetchFn();
        if (mounted) setData(result);
      } catch (error) {
        console.error('Polling error:', error);
      }
    };

    poll(); // 즉시 실행
    const interval = setInterval(poll, intervalMs);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [fetchFn, intervalMs]);

  return data;
}
```

## 3. 서비스 패턴

### API 서비스
```typescript
class ApiService {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async get<T>(endpoint: string): Promise<T> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  }
}
```

### Firebase 서비스
```typescript
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@services/firebase/config';

export const userService = {
  async getUser(userId: string): Promise<User | null> {
    try {
      const docRef = doc(db, 'users', userId);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? (docSnap.data() as User) : null;
    } catch (error) {
      console.error('getUser error:', error);
      return null;
    }
  },

  subscribeToUser(userId: string, callback: (user: User | null) => void) {
    const docRef = doc(db, 'users', userId);
    return onSnapshot(docRef, (doc) => {
      callback(doc.exists() ? (doc.data() as User) : null);
    });
  }
};
```

## 4. 네비게이션 패턴

### 타입 정의
```typescript
export type RootStackParamList = {
  Home: undefined;
  StationDetail: { stationId: string };
  Settings: { section?: string };
};
```

### 타입 안전 네비게이션
```typescript
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

type NavigationProp = StackNavigationProp<RootStackParamList>;

const MyScreen = () => {
  const navigation = useNavigation<NavigationProp>();

  const goToStation = (stationId: string) => {
    navigation.navigate('StationDetail', { stationId });
  };
};
```

## 5. 에러 처리 패턴

### ErrorBoundary
```typescript
interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    Sentry.captureException(error, { extra: errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}
```

## 6. 스타일 패턴

### 테마 컬러 사용
```typescript
import { useTheme } from '@services/theme';

const MyComponent = () => {
  const { colors } = useTheme();

  return (
    <View style={{ backgroundColor: colors.background }}>
      <Text style={{ color: colors.text }}>Hello</Text>
    </View>
  );
};
```

### 반응형 스타일
```typescript
import { Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    padding: width > 400 ? 24 : 16,
  },
});
```
