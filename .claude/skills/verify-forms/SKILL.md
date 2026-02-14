---
name: verify-forms
description: 폼 컴포넌트가 유효성 검증, 에러 표시, 제출 처리, 접근성 패턴을 올바르게 구현하는지 검증합니다.
---

# 폼 컴포넌트 검증

## Purpose

1. 폼에 클라이언트 사이드 유효성 검증이 구현되어 있는지 검증
2. 유효성 검증 에러가 사용자에게 표시되는지 검증
3. 폼 제출 시 로딩/성공/에러 상태가 처리되는지 검증
4. 폼 요소에 접근성 속성(label, aria)이 있는지 검증

## When to Run

- 새 폼 컴포넌트를 추가한 후
- 폼 유효성 검증 로직을 변경한 후
- 폼 제출 처리 로직을 수정한 후

## Related Files

| File | Purpose |
|------|---------|
| `src/dashboard/src/components/**/*Modal*.tsx` | 모달 폼 컴포넌트 |
| `src/dashboard/src/components/**/*Form*.tsx` | 폼 컴포넌트 |
| `src/dashboard/src/pages/LoginPage.tsx` | 로그인 폼 |
| `src/dashboard/src/pages/RegisterPage.tsx` | 회원가입 폼 |
| `src/dashboard/src/components/ProjectFormModal.tsx` | 프로젝트 폼 |

## Workflow

### Step 1: 폼 컴포넌트 식별

프로젝트 내 폼 관련 컴포넌트 수집:

```bash
# form 태그 사용 컴포넌트
grep -rln "<form\|onSubmit\|handleSubmit" src/dashboard/src/ --include="*.tsx"

# Modal 폼 컴포넌트
grep -rln "Modal.*form\|form.*Modal\|onSubmit" src/dashboard/src/components/ --include="*.tsx"
```

### Step 2: 유효성 검증 구현 검사

각 폼 컴포넌트에서 유효성 검증 패턴 확인:

```bash
# 유효성 검증 로직 존재 확인
grep -rn "required\|validate\|error\|invalid\|pattern\|minLength\|maxLength" src/dashboard/src/components/ --include="*.tsx" | grep -i "form\|modal\|input"
```

**PASS 기준**: 사용자 입력이 있는 모든 폼에 최소 필수 필드 검증 존재
**FAIL 기준**: 유효성 검증 없이 서버에 직접 제출하는 폼 존재

### Step 3: 에러 메시지 표시 검사

유효성 검증 실패 시 사용자에게 에러 메시지 표시 확인:

```bash
grep -rn "error.*message\|errorMessage\|helperText\|text-red\|text-error" src/dashboard/src/components/ --include="*.tsx" | grep -i "form\|modal\|input"
```

**PASS 기준**: 각 입력 필드 근처에 에러 메시지 표시 영역 존재
**FAIL 기준**: 에러 시 alert만 사용하거나 에러 표시 없음

### Step 4: 제출 상태 처리 검사

폼 제출 시 로딩/성공/에러 상태 처리:

```bash
# 제출 중 로딩 상태
grep -rn "isSubmitting\|isLoading\|submitting\|loading" src/dashboard/src/components/ --include="*.tsx" | grep -i "form\|modal\|submit"

# 제출 버튼 비활성화
grep -rn "disabled.*submit\|disabled.*loading\|disabled.*saving" src/dashboard/src/components/ --include="*.tsx"
```

**PASS 기준**: 제출 중 버튼 비활성화 + 로딩 인디케이터
**FAIL 기준**: 중복 제출 방지 없음

### Step 5: 접근성 검사

폼 요소에 label 또는 aria 속성 확인:

```bash
# label 연결
grep -rn "<label\|htmlFor\|aria-label\|aria-labelledby" src/dashboard/src/components/ --include="*.tsx" | grep -i "form\|modal"

# placeholder만 사용 (label 없이)
grep -rn "placeholder=" src/dashboard/src/components/ --include="*.tsx" | grep -v "label\|aria"
```

**PASS 기준**: 모든 입력 요소에 label 또는 aria-label 존재
**FAIL 기준**: placeholder만 있고 label이 없는 입력 요소 존재

### Step 6: 결과 종합

## Output Format

```markdown
## 폼 컴포넌트 검증 결과

| 컴포넌트 | 유효성 검증 | 에러 표시 | 제출 처리 | 접근성 | 상태 |
|----------|-------------|-----------|-----------|--------|------|
| LoginPage | PASS | PASS | PASS | PASS | PASS |
| ProjectFormModal | PASS | FAIL | PASS | WARN | FAIL |
```

## Exceptions

1. **검색 폼**: 검색 입력은 별도의 유효성 검증 불필요
2. **필터 컴포넌트**: 드롭다운 필터는 폼이 아닌 UI 컨트롤
3. **ChatInput**: 채팅 입력은 일반 폼과 다른 UX 패턴 허용
4. **설정 토글**: 단순 on/off 설정은 제출 처리 불필요 (즉시 반영)
