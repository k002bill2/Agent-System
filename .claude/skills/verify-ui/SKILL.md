---
name: verify-ui
description: UI 일관성(Tailwind 클래스 패턴, 다크모드 지원, 반응형 레이아웃, 아이콘 사용)이 유지되는지 검증합니다.
---

# UI 일관성 검증

## Purpose

1. Tailwind CSS 클래스가 일관된 패턴을 사용하는지 검증
2. 모든 컴포넌트가 다크모드를 지원하는지 검증
3. 색상, 간격, 폰트 크기가 디자인 토큰을 따르는지 검증
4. 아이콘 라이브러리가 통일되어 있는지 검증

## When to Run

- 새 UI 컴포넌트를 추가한 후
- 스타일링을 변경한 후
- 다크모드 관련 작업 후
- 디자인 토큰을 수정한 후

## Related Files

| File | Purpose |
|------|---------|
| `src/dashboard/src/components/**/*.tsx` | UI 컴포넌트 |
| `src/dashboard/src/pages/*.tsx` | 페이지 레이아웃 |
| `src/dashboard/tailwind.config.js` | Tailwind 설정 |
| `src/dashboard/src/index.css` | 글로벌 스타일 |

## Workflow

### Step 1: 다크모드 지원 검사

배경색/텍스트색을 사용하는 컴포넌트에 `dark:` variant 존재 확인:

```bash
# bg-white 사용하면서 dark: 없는 패턴
grep -rn "bg-white\|bg-gray-50\|bg-gray-100" src/dashboard/src/ --include="*.tsx" | grep -v "dark:"

# text-gray-900 사용하면서 dark: 없는 패턴
grep -rn "text-gray-900\|text-gray-800\|text-black" src/dashboard/src/ --include="*.tsx" | grep -v "dark:"

# border 색상에 dark: 없는 패턴
grep -rn "border-gray-200\|border-gray-300" src/dashboard/src/ --include="*.tsx" | grep -v "dark:"
```

**PASS 기준**: 밝은 배경/텍스트/보더에 대응하는 `dark:` 클래스 존재
**FAIL 기준**: `dark:` variant 없이 밝은 색상만 사용하는 컴포넌트

### Step 2: 색상 일관성 검사

프로젝트 전체에서 사용하는 primary 색상 확인:

```bash
# primary 색상 패턴
grep -rn "primary-\|blue-\|indigo-" src/dashboard/src/ --include="*.tsx" | grep "bg-\|text-\|border-" | head -20

# 직접 hex/rgb 색상 사용
grep -rn "#[0-9a-fA-F]\{3,6\}\|rgb(" src/dashboard/src/ --include="*.tsx" | grep -v "node_modules"
```

**PASS 기준**: Tailwind 유틸리티 클래스만 사용, 직접 색상값 미사용
**FAIL 기준**: 인라인 hex/rgb 색상 사용

### Step 3: 간격(Spacing) 일관성 검사

일관되지 않은 간격 사용 패턴:

```bash
# 비표준 padding/margin 값
grep -rn "p-\[.*px\]\|m-\[.*px\]\|gap-\[.*px\]" src/dashboard/src/ --include="*.tsx"
```

**PASS 기준**: Tailwind 표준 간격 스케일 사용 (p-2, p-4, p-6 등)
**FAIL 기준**: 임의의 px 값으로 간격 지정 (p-[13px] 등)

### Step 4: 아이콘 라이브러리 통일성 검사

```bash
# 사용 중인 아이콘 라이브러리 확인
grep -rn "from 'lucide-react'\|from 'react-icons'\|from '@heroicons'" src/dashboard/src/ --include="*.tsx" | head -5

# 여러 라이브러리 혼용 확인
grep -rn "import.*from.*icons\|import.*Icon" src/dashboard/src/ --include="*.tsx" | grep -oP "from '[^']+'" | sort -u
```

**PASS 기준**: 단일 아이콘 라이브러리 사용 (lucide-react 등)
**FAIL 기준**: 여러 아이콘 라이브러리 혼용

### Step 5: 반응형 레이아웃 검사

주요 레이아웃에 반응형 클래스 존재 확인:

```bash
# 반응형 클래스 사용 패턴
grep -rn "sm:\|md:\|lg:\|xl:" src/dashboard/src/ --include="*.tsx" | head -20

# grid/flex 레이아웃에 반응형 적용
grep -rn "grid-cols-\|flex.*wrap" src/dashboard/src/ --include="*.tsx" | grep -v "sm:\|md:\|lg:"
```

**PASS 기준**: 주요 그리드 레이아웃에 반응형 breakpoint 적용
**FAIL 기준**: 고정 컬럼 수만 사용하는 그리드 (반응형 미지원)

### Step 6: 결과 종합

## Output Format

```markdown
## UI 일관성 검증 결과

| 검사 항목 | 위반 수 | 심각도 | 상태 |
|-----------|---------|--------|------|
| 다크모드 | N | Medium | PASS/FAIL |
| 색상 일관성 | N | Low | PASS/WARN |
| 간격 일관성 | N | Low | PASS/WARN |
| 아이콘 통일성 | N 라이브러리 | Medium | PASS/FAIL |
| 반응형 | N | Low | PASS/WARN |

### 다크모드 미지원 컴포넌트

| 파일:라인 | 클래스 | 누락된 dark: |
|-----------|--------|-------------|
| Card.tsx:15 | bg-white | dark:bg-gray-800 |
```

## Exceptions

1. **SVG/이미지 내 색상**: SVG 파일이나 이미지 내의 색상은 Tailwind 범위 외
2. **third-party 컴포넌트**: 외부 라이브러리 컴포넌트의 스타일은 제어 불가
3. **print 스타일**: 인쇄용 스타일은 다크모드 불필요
4. **관리 페이지**: admin 전용 페이지는 반응형 우선순위 낮음 (WARN)
5. **애니메이션 색상**: `animate-*` 클래스 내 색상은 토큰 검사 면제
