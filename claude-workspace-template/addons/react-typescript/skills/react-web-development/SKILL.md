---
name: react-web-development
description: React Web component development with TypeScript, Vite, and Tailwind CSS. Use when creating UI components, pages, or implementing routing flows.
type: skill
enforcement: require
priority: high
triggers:
  keywords:
    - react
    - component
    - tailwind
    - vite
    - tsx
  patterns:
    - "(create|add|make).*?(component|page|hook)"
    - "(react).*?(develop|implement|build)"
  files:
    - "src/**/*.tsx"
    - "src/**/*.ts"
---

# React Web Development Guidelines

## When to Use This Skill
- Creating new React components with Tailwind CSS
- Building pages with React Router
- Implementing custom hooks
- Working with Vite and modern tooling
- Styling with Tailwind CSS and cn() utility

## Core Principles

### 1. Component Structure
```tsx
import { memo } from 'react';
import { cn } from '@/lib/utils';

interface ComponentProps {
  // Props with JSDoc comments
  title: string;
  className?: string;
  onClick?: () => void;
}

export const Component: React.FC<ComponentProps> = memo(({
  title,
  className,
  onClick
}) => {
  // 1. Hooks (useState, useEffect, custom hooks)
  // 2. Derived state
  // 3. Event handlers
  // 4. Return JSX

  return (
    <div className={cn('p-4 bg-white rounded-lg', className)}>
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
    </div>
  );
});

Component.displayName = 'Component';
```

### 2. File Organization
```
src/
├── components/        # Reusable UI components
│   └── ui/           # Base UI components (Button, Card, etc.)
├── pages/            # Page components
├── hooks/            # Custom React hooks
├── stores/           # State management stores
├── lib/              # Utility functions (cn, api, etc.)
└── types/            # TypeScript type definitions
```

### 3. TypeScript Standards
- Always use TypeScript strict mode
- Define interfaces for all component props
- Use type inference where possible
- Avoid `any` type - use `unknown` with type guards

### 4. Performance Best Practices
```tsx
// Use memo for expensive components
export const ExpensiveComponent = memo(({ data }) => {
  // Component logic
}, (prevProps, nextProps) => {
  // Custom comparison if needed
  return prevProps.data === nextProps.data;
});

// Use useMemo for expensive calculations
const processedData = useMemo(() => {
  return heavyComputation(data);
}, [data]);

// Use useCallback for stable callback references
const handleClick = useCallback(() => {
  // Handler logic
}, [dependencies]);
```

### 5. Routing Pattern (React Router)
```tsx
import { useNavigate, useParams } from 'react-router-dom';

interface PageProps {
  // Page-specific props
}

export const PageComponent: React.FC<PageProps> = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const handleNavigate = () => {
    navigate('/other-page', { state: { from: 'current' } });
  };

  // Page implementation
};
```

### 6. Error Handling
```tsx
const [error, setError] = useState<string | null>(null);

try {
  await someAsyncOperation();
} catch (err) {
  setError(err instanceof Error ? err.message : 'Unknown error');
  console.error('Operation failed:', err);
}

// Display error to user
{error && (
  <div className="text-red-500 text-sm mt-2" role="alert">
    {error}
  </div>
)}
```

## Styling Guidelines

### 1. Tailwind CSS with cn() Utility
```tsx
import { cn } from '@/lib/utils';

interface ButtonProps {
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  className,
  children,
}) => {
  return (
    <button
      className={cn(
        // Base styles
        'inline-flex items-center justify-center rounded-md font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        // Variant styles
        variant === 'primary' && 'bg-blue-600 text-white hover:bg-blue-700',
        variant === 'secondary' && 'bg-gray-100 text-gray-900 hover:bg-gray-200',
        // Size styles
        size === 'sm' && 'h-8 px-3 text-sm',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-12 px-6 text-base',
        // Custom className
        className
      )}
    >
      {children}
    </button>
  );
};
```

### 2. Responsive Design
```tsx
// Mobile-first responsive design
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

### 3. Dark Mode Support
```tsx
<div className="
  bg-white text-gray-900
  dark:bg-gray-800 dark:text-gray-100
">
  Dark mode aware content
</div>
```

## Common Patterns

### 1. Loading States
```tsx
const [loading, setLoading] = useState(true);
const [data, setData] = useState<DataType | null>(null);

useEffect(() => {
  fetchData()
    .then(setData)
    .finally(() => setLoading(false));
}, []);

if (loading) {
  return (
    <div className="flex items-center justify-center p-8">
      <Spinner className="h-8 w-8 text-blue-600" />
    </div>
  );
}
```

### 2. List Rendering
```tsx
// Simple list with map()
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

### 3. Form Input Handling
```tsx
const [value, setValue] = useState('');

<input
  type="text"
  value={value}
  onChange={(e) => setValue(e.target.value)}
  placeholder="Enter text"
  className="
    w-full px-3 py-2 border border-gray-300 rounded-md
    focus:outline-none focus:ring-2 focus:ring-blue-500
    dark:bg-gray-700 dark:border-gray-600
  "
/>
```

### 4. State Management Store Pattern
```tsx
import { create } from 'zustand';

interface StoreState {
  data: DataType[];
  loading: boolean;
  // Actions
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

## Testing Requirements
- Write unit tests for all components with Vitest
- Test user interactions with @testing-library/react
- Test error states
- Mock API calls and navigation

## Accessibility
- Add `aria-label` to interactive elements
- Use semantic HTML (`button`, `nav`, `main`, `section`)
- Use `role` attributes appropriately
- Ensure proper contrast ratios (WCAG 2.1 AA)
- Support keyboard navigation

## Important Notes
- Always use path aliases (@/) instead of relative imports
- Clean up subscriptions and timers in useEffect cleanup
- Use Tailwind's responsive prefixes (sm:, md:, lg:, xl:) for breakpoints
- Test across major browsers (Chrome, Firefox, Safari)
