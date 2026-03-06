# AOS Frontend Rules

## React Component Pattern
- `memo()` + `displayName` 필수
- Props interface 선언 (JSDoc 포함)
- `cn()` utility로 조건부 클래스

## Styling
- Tailwind CSS 전용 (인라인 스타일 금지)
- 다크모드 필수: `dark:` prefix
- 반응형: mobile-first (`sm:`, `md:`, `lg:`)

## State Management
- Zustand 스토어: `create<State>((set) => ({...}))`
- 전역 상태 최소화, 로컬 상태 우선

## Path Aliases
- `@/components/...`, `@/lib/...`, `@/pages/...`

## Accessibility
- `aria-label` 모든 인터랙티브 요소
- 시맨틱 HTML (`button`, `nav`, `main`, `section`)
- 키보드 네비게이션 지원 (`onKeyDown`)

## Performance
- `useMemo`, `useCallback` 적절히 사용
- 대용량 리스트: `@tanstack/react-virtual`
- 코드 스플리팅: `React.lazy` + `Suspense`
