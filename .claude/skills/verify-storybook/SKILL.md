---
name: verify-storybook
description: 주요 UI 컴포넌트에 시각적 문서화(Storybook stories 또는 컴포넌트 데모)가 존재하는지 검증합니다.
---

# 컴포넌트 시각적 문서화 검증

## Purpose

1. 재사용 가능한 공통 컴포넌트에 시각적 문서화(Storybook stories 또는 데모 페이지)가 있는지 검증
2. 컴포넌트의 다양한 상태(variants)가 문서화되어 있는지 검증
3. 디자인 시스템 컴포넌트의 props 문서화 확인

## When to Run

- 새 공통 컴포넌트를 추가한 후
- 기존 컴포넌트에 새 variant를 추가한 후
- 컴포넌트 라이브러리를 확장한 후

## Related Files

| File | Purpose |
|------|---------|
| `src/dashboard/src/components/common/*.tsx` | 공통 컴포넌트 |
| `src/dashboard/src/components/ui/*.tsx` | UI 기본 컴포넌트 |
| `src/dashboard/src/components/**/*.stories.tsx` | Storybook stories (있는 경우) |

## Workflow

### Step 1: Storybook 설정 확인

프로젝트에 Storybook이 설정되어 있는지 확인:

```bash
# Storybook 의존성 확인
grep -n "storybook\|@storybook" src/dashboard/package.json

# Storybook 설정 파일 확인
ls src/dashboard/.storybook/ 2>/dev/null
```

**Storybook 미설치인 경우**: 안내 메시지를 출력하고 대안 검증으로 전환

### Step 2: 공통 컴포넌트 목록 수집

재사용 가능한 컴포넌트 식별:

```bash
# common 디렉토리 컴포넌트
ls src/dashboard/src/components/common/*.tsx 2>/dev/null

# ui 디렉토리 컴포넌트
ls src/dashboard/src/components/ui/*.tsx 2>/dev/null
```

### Step 3: Story 파일 매칭 검사 (Storybook 있는 경우)

각 공통 컴포넌트에 대응하는 `.stories.tsx` 파일 존재 확인:

```bash
find src/dashboard/src/components -name "*.stories.tsx" -o -name "*.stories.ts"
```

**PASS 기준**: 모든 공통/UI 컴포넌트에 stories 파일 존재
**FAIL 기준**: stories 파일 없는 공통 컴포넌트 존재

### Step 4: 대안 문서화 검사 (Storybook 없는 경우)

컴포넌트에 Props 타입 정의와 JSDoc이 있는지:

```bash
# Props 인터페이스/타입 정의
grep -rn "interface.*Props\|type.*Props" src/dashboard/src/components/common/*.tsx src/dashboard/src/components/ui/*.tsx

# JSDoc 주석
grep -B3 "export function\|export const" src/dashboard/src/components/common/*.tsx | grep "/\*\*"
```

**PASS 기준**: Props 타입이 명확히 정의되고 주석으로 사용법 설명
**FAIL 기준**: Props 타입 미정의 또는 `any` 사용

### Step 5: Variant 문서화 검사

컴포넌트가 지원하는 variant/size/color가 문서화되어 있는지:

```bash
# variant 패턴
grep -rn "variant\|size\|color\|type" src/dashboard/src/components/common/*.tsx src/dashboard/src/components/ui/*.tsx | grep "Props\|interface\|type "
```

### Step 6: 결과 종합

## Output Format

```markdown
## 컴포넌트 시각적 문서화 검증 결과

### Storybook 상태: 미설치 / 설치됨

### 공통 컴포넌트 문서화

| 컴포넌트 | Story | Props 타입 | JSDoc | Variants | 상태 |
|----------|-------|------------|-------|----------|------|
| Pagination | - | PASS | PASS | N/A | PASS |
| VirtualizedDataTable | - | PASS | FAIL | N/A | WARN |
| Skeleton | - | PASS | PASS | N/A | PASS |
```

## Exceptions

1. **Storybook 미설치 프로젝트**: Story 파일 검사를 스킵하고 Props/JSDoc 검증으로 대체
2. **단순 래퍼 컴포넌트**: 외부 라이브러리를 얇게 감싸는 컴포넌트는 별도 stories 불필요
3. **레이아웃 컴포넌트**: Sidebar, Header 등 레이아웃 컴포넌트는 stories 대상 아님
4. **페이지 전용 컴포넌트**: 단일 페이지에서만 사용하는 컴포넌트는 공통 컴포넌트 문서화 대상 아님
