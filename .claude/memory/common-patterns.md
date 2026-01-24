# Common Patterns - AOS Dashboard

자주 사용되는 React Web/Vite/Tailwind 패턴 모음

## 1. 컴포넌트 패턴

### 기본 함수형 컴포넌트
```typescript
import { memo } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  title: string;
  subtitle?: string;
  className?: string;
}

export const MyComponent: React.FC<Props> = memo(({ title, subtitle, className }) => {
  return (
    <div className={cn('p-4', className)}>
      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h2>
      {subtitle && <p className="text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>}
    </div>
  );
});

MyComponent.displayName = 'MyComponent';
```

### 메모이제이션된 컴포넌트
```typescript
export const OptimizedComponent = memo<Props>(({ data }) => {
  // 렌더링 로직
}, (prevProps, nextProps) => {
  return prevProps.data === nextProps.data;
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
import { db } from '@/services/firebase/config';

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

## 4. 라우팅 패턴

### 타입 정의
```typescript
// React Router 타입
export type AppRoutes = {
  '/': undefined;
  '/sessions/:id': { id: string };
  '/settings': { section?: string };
};
```

### 타입 안전 네비게이션
```typescript
import { useNavigate, useParams } from 'react-router-dom';

const MyPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const goToSession = (sessionId: string) => {
    navigate(`/sessions/${sessionId}`);
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
    console.error('Error caught:', error, errorInfo);
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

### cn() 유틸리티와 조건부 클래스
```typescript
import { cn } from '@/lib/utils';

const MyComponent: React.FC<{ variant?: 'primary' | 'secondary' }> = ({ variant = 'primary' }) => {
  return (
    <div className={cn(
      'p-4 rounded-lg transition-colors',
      variant === 'primary' && 'bg-blue-600 text-white hover:bg-blue-700',
      variant === 'secondary' && 'bg-gray-100 text-gray-900 hover:bg-gray-200'
    )}>
      Content
    </div>
  );
};
```

### 반응형 스타일
```typescript
// 모바일 우선 반응형 디자인
<div className="
  w-full px-4
  md:max-w-2xl md:px-6
  lg:max-w-4xl lg:px-8
">
  <h1 className="text-xl md:text-2xl lg:text-3xl font-bold">
    Responsive Title
  </h1>
</div>
```

### 다크 모드 지원
```typescript
<div className="
  bg-white text-gray-900
  dark:bg-gray-800 dark:text-gray-100
">
  Dark mode aware content
</div>
```

## 7. Zustand 스토어 패턴

```typescript
import { create } from 'zustand';

interface StoreState {
  data: DataType[];
  loading: boolean;
  fetchData: () => Promise<void>;
  addItem: (item: DataType) => void;
}

export const useStore = create<StoreState>((set, get) => ({
  data: [],
  loading: false,

  fetchData: async () => {
    set({ loading: true });
    try {
      const response = await api.get('/data');
      set({ data: response.data });
    } finally {
      set({ loading: false });
    }
  },

  addItem: (item) => {
    set((state) => ({ data: [...state.data, item] }));
  },
}));
```
