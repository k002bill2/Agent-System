# React Patterns Reference

## Routing (React Router)

```tsx
import { useNavigate, useParams } from 'react-router-dom';

export const PageComponent: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const handleNavigate = () => {
    navigate('/other-page', { state: { from: 'current' } });
  };
};
```

## Error Handling

```tsx
const [error, setError] = useState<string | null>(null);

try {
  await someAsyncOperation();
} catch (err) {
  setError(err instanceof Error ? err.message : 'Unknown error');
}

{error && (
  <div className="text-red-500 text-sm mt-2" role="alert">{error}</div>
)}
```

## Loading States

```tsx
const [loading, setLoading] = useState(true);
const [data, setData] = useState<DataType | null>(null);

useEffect(() => {
  fetchData().then(setData).finally(() => setLoading(false));
}, []);

if (loading) {
  return (
    <div className="flex items-center justify-center p-8">
      <Spinner className="h-8 w-8 text-blue-600" />
    </div>
  );
}
```

## List Rendering

```tsx
// Simple list
<div className="space-y-4">
  {items.map((item) => (
    <ItemComponent key={item.id} item={item} />
  ))}
</div>

// Virtualized list for large datasets
import { useVirtualizer } from '@tanstack/react-virtual';

const virtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 80,
});
```

## Form Input

```tsx
const [value, setValue] = useState('');

<input
  type="text"
  value={value}
  onChange={(e) => setValue(e.target.value)}
  className="
    w-full px-3 py-2 border border-gray-300 rounded-md
    focus:outline-none focus:ring-2 focus:ring-blue-500
    dark:bg-gray-700 dark:border-gray-600
  "
/>
```

## Zustand Store

```tsx
import { create } from 'zustand';

interface StoreState {
  data: DataType[];
  loading: boolean;
  fetchData: () => Promise<void>;
  addItem: (item: DataType) => void;
}

export const useStore = create<StoreState>((set) => ({
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
