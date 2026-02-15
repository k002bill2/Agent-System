---
name: verify-editable-components
description: 인라인 편집 가능한 컴포넌트가 일관된 패턴(편집 모드, 유효성 검증, 저장/취소)을 따르는지 검증합니다.
---

# 인라인 편집 컴포넌트 검증

## Purpose

1. 인라인 편집 컴포넌트가 일관된 편집 모드 전환 패턴을 사용하는지 검증
2. 편집 시 유효성 검증과 에러 표시가 구현되어 있는지 검증
3. 저장/취소 UX가 통일되어 있는지 검증
4. 편집 중 데이터 손실 방지가 구현되어 있는지 검증

## When to Run

- 인라인 편집 기능을 추가한 후
- 폼 컴포넌트를 편집 모드로 변경한 후
- 편집 관련 UX 패턴을 수정한 후

## Related Files

| File | Purpose |
|------|---------|
| `src/dashboard/src/components/**/*.tsx` | 편집 가능 컴포넌트 |
| `src/dashboard/src/stores/*.ts` | 편집 상태 관리 |

## Workflow

### Step 1: 인라인 편집 컴포넌트 식별

편집 모드 관련 패턴을 검색:

```bash
grep -rn "isEditing\|editMode\|editing\|setEditing\|editingId\|editingRuleId" src/dashboard/src/components/ --include="*.tsx"
```

```bash
grep -rn "contentEditable\|readOnly.*false\|disabled.*false" src/dashboard/src/components/ --include="*.tsx"
```

### Step 2: 편집 모드 전환 패턴 검사

각 인라인 편집 컴포넌트에서:

1. **편집 시작**: 클릭/더블클릭 핸들러 존재 확인
2. **편집 취소**: Escape 키 또는 취소 버튼 존재 확인
3. **저장**: Enter 키 또는 저장 버튼 존재 확인

```bash
# Escape 키 핸들러
grep -rn "Escape\|onKeyDown\|handleKeyDown" src/dashboard/src/components/ --include="*.tsx" | grep -i "edit"

# 저장/취소 버튼
grep -rn "onCancel\|onSave\|handleSave\|handleCancel" src/dashboard/src/components/ --include="*.tsx"
```

**PASS 기준**: 모든 인라인 편집 컴포넌트에 시작/저장/취소 패턴 존재
**FAIL 기준**: 취소 방법 없는 편집 모드, 또는 저장 방법 없는 편집 모드

### Step 3: 유효성 검증 패턴 검사

편집 컴포넌트에 입력 유효성 검증이 있는지 확인:

```bash
grep -rn "validate\|validation\|required\|minLength\|maxLength\|pattern" src/dashboard/src/components/ --include="*.tsx" | grep -i "edit"
```

**PASS 기준**: 텍스트 입력 편집에 기본 유효성 검증 존재 (빈 값 체크 등)
**FAIL 기준**: 유효성 검증 없이 빈 값이나 잘못된 값 저장 가능

### Step 4: 낙관적 업데이트 / 로딩 상태 검사

저장 시 로딩 상태 표시 확인:

```bash
grep -rn "saving\|isSaving\|isSubmitting\|loading" src/dashboard/src/components/ --include="*.tsx" | grep -i "edit"
```

**PASS 기준**: 저장 중 사용자에게 피드백 제공 (로딩 스피너, 비활성화 등)
**FAIL 기준**: 저장 중 아무 피드백 없음

### Step 5: 결과 종합

## Output Format

```markdown
## 인라인 편집 컴포넌트 검증 결과

| 컴포넌트 | 편집 시작 | 저장 | 취소 | 유효성 검증 | 로딩 상태 | 상태 |
|----------|-----------|------|------|-------------|-----------|------|
| NotificationRuleRow | click | save btn | Esc | PASS | PASS | PASS |
| ProjectConfigItem | dblclick | Enter | Esc | FAIL | PASS | FAIL |
```

## Exceptions

1. **모달 기반 편집**: 인라인이 아닌 모달 팝업 편집은 이 검증 대상 아님 (verify-forms에서 검증)
2. **토글/체크박스**: 단순 토글 컴포넌트는 편집 모드 전환 불필요
3. **드래그앤드롭**: 순서 변경 등 DnD 인터랙션은 별도 패턴
