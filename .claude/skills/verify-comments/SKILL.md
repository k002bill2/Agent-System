---
name: verify-comments
description: 주요 코드에 적절한 주석/문서화(JSDoc, Python docstring)가 있는지 검증합니다.
---

# 코드 문서화 검증

## Purpose

1. 공개 함수/컴포넌트에 JSDoc 또는 Python docstring이 있는지 검증
2. 복잡한 비즈니스 로직에 설명 주석이 있는지 검증
3. TODO/FIXME/HACK 주석이 추적 가능한지 검증

## When to Run

- 새 모듈이나 서비스를 추가한 후
- 복잡한 비즈니스 로직을 구현한 후
- PR 생성 전 문서화 완전성 확인 시

## Related Files

| File | Purpose |
|------|---------|
| `src/backend/services/*.py` | 비즈니스 로직 서비스 |
| `src/backend/agents/*.py` | 에이전트 클래스 |
| `src/backend/api/*.py` | API 핸들러 |
| `src/dashboard/src/stores/*.ts` | Zustand 스토어 |
| `src/dashboard/src/components/**/*.tsx` | React 컴포넌트 |

## Workflow

### Step 1: Python docstring 검사

서비스 및 에이전트 클래스의 public 메서드에 docstring 확인:

```bash
# docstring 없는 public 함수 탐지
grep -n "def [a-z]" src/backend/services/*.py | grep -v "def _\|def __"
```

```bash
# docstring 존재 확인
grep -A1 "def [a-z]" src/backend/services/*.py | grep '"""'
```

**PASS 기준**: 모든 public 메서드에 docstring 존재
**FAIL 기준**: docstring 없는 public 메서드 존재

### Step 2: TypeScript JSDoc 검사

스토어의 주요 함수와 export된 컴포넌트에 JSDoc 확인:

```bash
# export된 함수/컴포넌트 목록
grep -rn "export function\|export const.*=.*=>" src/dashboard/src/stores/*.ts
```

```bash
# JSDoc 존재 확인 (export 위 3줄 이내에 /** 존재)
grep -B3 "export function\|export const" src/dashboard/src/stores/*.ts | grep "/\*\*"
```

**PASS 기준**: 주요 export 함수에 JSDoc 존재
**FAIL 기준**: JSDoc 없는 주요 export 존재

### Step 3: TODO/FIXME/HACK 추적 검사

임시 주석이 이슈 번호나 설명을 포함하는지 확인:

```bash
grep -rn "TODO\|FIXME\|HACK\|XXX" src/ --include="*.py" --include="*.ts" --include="*.tsx"
```

**PASS 기준**: TODO/FIXME에 설명 또는 이슈 번호 포함 (예: `// TODO(#123): 개선 필요`)
**FAIL 기준**: 설명 없는 TODO/FIXME 존재 (예: `// TODO`)

### Step 4: 결과 종합

## Output Format

```markdown
## 코드 문서화 검증 결과

### Python Docstring

| 파일 | 총 함수 | docstring | 누락 | 상태 |
|------|---------|-----------|------|------|
| auth_service.py | 10 | 8 | 2 | FAIL |

### TypeScript JSDoc

| 파일 | 총 export | JSDoc | 누락 | 상태 |
|------|-----------|-------|------|------|
| auth.ts | 5 | 3 | 2 | FAIL |

### TODO/FIXME 추적

| 파일:라인 | 유형 | 설명 있음 | 상태 |
|-----------|------|-----------|------|
| service.py:42 | TODO | Yes | PASS |
```

## Exceptions

1. **private 메서드**: `_`로 시작하는 Python private 메서드는 docstring 선택사항
2. **간단한 getter/setter**: 자명한 getter/setter는 docstring 불필요
3. **테스트 파일**: 테스트 함수는 이 검증 대상이 아님
4. **타입 파일**: `types.ts`, `models.py` 등 타입 정의 파일은 인터페이스 주석으로 충분
5. **이벤트 핸들러**: `onClick`, `onChange` 등 자명한 이벤트 핸들러는 JSDoc 불필요
