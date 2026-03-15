---
name: verify-frontend
description: React/TypeScript/Tailwind 프론트엔드 패턴 검증. 컴포넌트 구현 후, PR 전 사용.
---

# 프론트엔드 패턴 검증

## Purpose

Dashboard 프론트엔드 코드가 프로젝트 규칙을 준수하는지 검증합니다:

1. **React 컴포넌트 패턴** — memo(), displayName, Props interface
2. **TypeScript 엄격성** — any 사용 금지, 타입 힌트 필수
3. **접근성** — aria-label, 시맨틱 HTML
4. **스타일링** — Tailwind 전용, 인라인 스타일 금지, 다크모드 지원

## When to Run

- React 컴포넌트를 새로 생성하거나 수정한 후
- Dashboard PR 생성 전
- 프론트엔드 코드 리뷰 시

## Related Files

| File | Purpose |
|------|---------|
| `src/dashboard/src/components/**/*.tsx` | React 컴포넌트 |
| `src/dashboard/src/pages/**/*.tsx` | 페이지 컴포넌트 |
| `src/dashboard/src/hooks/**/*.ts` | 커스텀 훅 |
| `src/dashboard/src/stores/**/*.ts` | Zustand 스토어 |
| `.claude/rules/aos-frontend.md` | 프론트엔드 규칙 원본 |

## Workflow

### Step 1: memo() 및 displayName 검사

**파일:** `src/dashboard/src/components/**/*.tsx`, `src/dashboard/src/pages/**/*.tsx`

**검사:** export하는 컴포넌트에 `memo()` 래핑과 `displayName` 설정이 있는지 확인.

```bash
# memo 없는 export default 컴포넌트 탐지
grep -rn "export default function\|export const.*= (" src/dashboard/src/components/ src/dashboard/src/pages/ --include="*.tsx" | grep -v "memo("
```

**PASS:** 모든 컴포넌트가 memo()로 래핑됨
**FAIL:** memo() 없는 export 컴포넌트 발견

### Step 2: TypeScript any 사용 검사

**파일:** `src/dashboard/src/**/*.ts`, `src/dashboard/src/**/*.tsx`

**검사:** `any` 타입 사용을 탐지합니다.

```bash
grep -rn ": any\b\|as any\b\|<any>" src/dashboard/src/ --include="*.ts" --include="*.tsx"
```

**PASS:** any 사용 없음
**FAIL:** any 타입 사용 발견 → 구체적 타입으로 교체 권장

### Step 3: 인라인 스타일 검사

**파일:** `src/dashboard/src/**/*.tsx`

**검사:** `style=` 속성으로 인라인 스타일 사용을 탐지합니다.

```bash
grep -rn "style={{" src/dashboard/src/ --include="*.tsx"
```

**PASS:** 인라인 스타일 없음 (Tailwind 전용)
**FAIL:** 인라인 스타일 발견 → Tailwind 클래스로 교체 권장

### Step 4: 접근성 (aria-label) 검사

**파일:** `src/dashboard/src/**/*.tsx`

**검사:** `<button>`, `<input>`, `<a>` 등 인터랙티브 요소에 `aria-label`이 있는지 확인.

```bash
# aria-label 없는 button 탐지
grep -rn "<button\b" src/dashboard/src/ --include="*.tsx" | grep -v "aria-label"
```

**PASS:** 모든 인터랙티브 요소에 aria-label 존재
**FAIL:** aria-label 누락 → 추가 권장

### Step 5: 다크모드 지원 검사

**파일:** `src/dashboard/src/**/*.tsx`

**검사:** Tailwind 배경/텍스트 색상 클래스에 `dark:` 대응이 있는지 확인.

```bash
# bg-white 등 라이트 전용 색상이 dark: 대응 없이 사용되는지 탐지
grep -rn "bg-white\|bg-gray-\|text-gray-" src/dashboard/src/ --include="*.tsx" | grep -v "dark:"
```

**PASS:** 라이트 색상에 dark: 대응 존재
**FAIL:** dark: 대응 없는 색상 클래스 발견

## Output Format

```markdown
## 프론트엔드 검증 결과

| # | 검사 항목 | 상태 | 이슈 수 | 상세 |
|---|-----------|------|---------|------|
| 1 | memo/displayName | PASS/FAIL | N | ... |
| 2 | TypeScript any | PASS/FAIL | N | ... |
| 3 | 인라인 스타일 | PASS/FAIL | N | ... |
| 4 | 접근성 (aria) | PASS/FAIL | N | ... |
| 5 | 다크모드 | PASS/FAIL | N | ... |
```

## Exceptions

다음은 **위반이 아닙니다**:

1. **테스트 파일** — `*.test.tsx`, `*.spec.tsx` 파일에서의 any 사용이나 memo 미적용은 허용
2. **타입 정의 파일** — `*.d.ts` 파일에서의 any 사용은 외부 라이브러리 호환을 위해 허용
3. **SVG/아이콘 컴포넌트** — 단순 SVG 래퍼 컴포넌트는 memo/displayName 면제
4. **동적 스타일** — 런타임 계산이 필요한 경우(예: transform, width 퍼센트) 인라인 스타일 허용
5. **서드파티 컴포넌트 래퍼** — 외부 라이브러리 컴포넌트 props 전달 시 any 허용
