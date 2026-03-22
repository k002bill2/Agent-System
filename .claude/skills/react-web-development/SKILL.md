---
name: react-web-development
description: >
  React Web component development with TypeScript, Vite, Tailwind CSS, and Zustand.
  Use when: creating UI components, pages, implementing routing flows, custom hooks,
  or working with React/Tailwind/Zustand code.
---

# React Web Development Guidelines

## Component Structure

```tsx
import { memo } from 'react';
import { cn } from '@/lib/utils';

interface ComponentProps {
  title: string;
  className?: string;
}

export const Component = memo(({ title, className }: ComponentProps) => {
  return (
    <div className={cn('p-4 bg-white dark:bg-gray-800 rounded-lg', className)}>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
    </div>
  );
});

Component.displayName = 'Component';
```

## File Organization

```
src/dashboard/src/
├── components/        # Reusable UI components
│   └── ui/           # Base UI (Button, Card, etc.)
├── pages/            # Page components
├── hooks/            # Custom React hooks
├── stores/           # Zustand stores
├── lib/              # Utilities (cn, api, etc.)
└── types/            # TypeScript types
```

## Styling (Tailwind CSS)

- `cn()` utility로 조건부 클래스 결합
- Mobile-first 반응형: `sm:`, `md:`, `lg:`, `xl:`
- 다크모드 필수: `dark:` prefix
- 인라인 스타일 금지 (Tailwind 전용)

```tsx
<button
  className={cn(
    'inline-flex items-center rounded-md font-medium transition-colors',
    variant === 'primary' && 'bg-blue-600 text-white hover:bg-blue-700',
    size === 'sm' && 'h-8 px-3 text-sm',
    className
  )}
>
```

## Performance

- `memo()` + `displayName` 필수
- `useMemo` for expensive calculations
- `useCallback` for stable callback references
- Large lists: `@tanstack/react-virtual`

## Accessibility

- `aria-label` on all interactive elements
- Semantic HTML (`button`, `nav`, `main`, `section`)
- Keyboard navigation support
- WCAG 2.1 AA contrast

## Testing

- Vitest + @testing-library/react
- Test user interactions and error states
- Mock API calls and navigation

## Key Rules

- Path aliases: `@/components/...` (not relative imports)
- Clean up subscriptions/timers in useEffect cleanup
- TypeScript strict mode, no `any`

## References

- **Routing, Error Handling, Common Patterns**: See [references/react-patterns.md](references/react-patterns.md)
