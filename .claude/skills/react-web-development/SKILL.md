---
name: react-web-development
description: "Use when creating React UI components, pages, custom hooks, or working with TypeScript/Tailwind CSS/Zustand in AOS Dashboard. Also triggers for styling, responsive design, dark mode, accessibility, or path alias questions."
---

# React Web Development

## Overview

AOS Dashboard의 React 컴포넌트를 TypeScript, Tailwind CSS, Zustand 기반으로 개발하는 스킬. `memo()` + `displayName`, 다크모드, 접근성을 기본으로 보장한다.

**REQUIRED BACKGROUND:** superpowers:brainstorming (새 컴포넌트 설계 시)

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

## Common Mistakes

| 실수 | 수정 |
|------|------|
| `memo()` 없이 export | `export const X = memo(...)` + `X.displayName = 'X'` |
| `dark:` 누락 | `bg-white` 사용 시 반드시 `dark:bg-gray-800` 대응 |
| 인라인 `style={{}}` | Tailwind 클래스로 변환, 동적 값만 예외 |
| 상대경로 import `../../../` | `@/components/...` path alias 사용 |
| `any` 타입 사용 | `unknown` + type guard 또는 구체 타입 정의 |
| `useEffect` cleanup 누락 | 구독/타이머는 반드시 cleanup 반환 |

## References

- **Routing, Error Handling, Common Patterns**: See [references/react-patterns.md](references/react-patterns.md)
