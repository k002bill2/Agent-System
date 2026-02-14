---
name: verify-barrel-exports
description: Dashboard 컴포넌트 디렉토리의 barrel export(index.ts) 동기화를 검증합니다. 새 컴포넌트 추가 후 사용.
---

# Barrel Export 검증

## Purpose

1. 컴포넌트 디렉토리의 `index.ts` barrel 파일이 모든 public 컴포넌트를 export하는지 검증
2. barrel 파일에서 삭제된 컴포넌트를 참조하지 않는지 검증
3. 페이지 파일이 barrel import를 통해 컴포넌트를 가져오는지 검증 (직접 파일 참조 방지)

## When to Run

- Dashboard 컴포넌트 디렉토리에 새 `.tsx` 파일 추가 후
- 컴포넌트 파일 삭제 또는 이름 변경 후
- 페이지 파일에서 import 구문 변경 후

## Related Files

| File | Purpose |
|------|---------|
| `src/dashboard/src/components/project-configs/index.ts` | project-configs barrel |
| `src/dashboard/src/components/organizations/index.ts` | organizations barrel |
| `src/dashboard/src/components/git/index.ts` | git barrel |
| `src/dashboard/src/components/feedback/index.ts` | feedback barrel |
| `src/dashboard/src/components/claude-sessions/index.ts` | claude-sessions barrel |
| `src/dashboard/src/components/skeletons/index.ts` | skeletons barrel |
| `src/dashboard/src/components/monitor/index.ts` | monitor barrel |
| `src/dashboard/src/components/analytics/index.ts` | analytics barrel |
| `src/dashboard/src/components/admin/index.ts` | admin barrel |
| `src/dashboard/src/components/llm-router/index.ts` | llm-router barrel |
| `src/dashboard/src/components/notifications/index.ts` | notifications barrel |
| `src/dashboard/src/components/permissions/index.ts` | permissions barrel |
| `src/dashboard/src/components/projects/index.ts` | projects barrel |
| `src/dashboard/src/components/usage/index.ts` | usage barrel |
| `src/dashboard/src/components/version-control/index.ts` | version-control barrel |
| `src/dashboard/src/components/rag/index.ts` | rag barrel |
| `src/dashboard/src/pages/*.tsx` | 페이지 파일 (barrel import 소비자) |

## Workflow

### Step 1: barrel 파일이 있는 디렉토리 목록 수집

```bash
find src/dashboard/src/components -name "index.ts" -type f
```

### Step 2: 각 디렉토리별 export 누락 검사

각 `index.ts`가 있는 디렉토리에 대해:

1. **디렉토리 내 모든 `.tsx` 파일 목록 수집** (테스트 파일 `__tests__/` 제외)

```bash
ls src/dashboard/src/components/<dir>/*.tsx 2>/dev/null
```

2. **`index.ts`에서 export 목록 추출**

```bash
grep "export.*from" src/dashboard/src/components/<dir>/index.ts
```

3. **비교**: 각 `.tsx` 파일 이름(확장자 제외)이 `index.ts`의 export `from` 절에 포함되어 있는지 확인

**PASS 기준**: 디렉토리 내 모든 `.tsx` 파일이 `index.ts`에서 export됨
**FAIL 기준**: 하나 이상의 `.tsx` 파일이 `index.ts`에 export되지 않음

**수정 방법**: 누락된 컴포넌트를 `index.ts`에 추가:
```typescript
export { ComponentName } from './ComponentName'
```

### Step 3: 존재하지 않는 파일 참조 검사

각 `index.ts`의 `from './XXX'` 구문에서 참조하는 파일이 실제로 존재하는지 확인:

```bash
# index.ts에서 참조하는 파일 목록 추출
grep -oP "from '\./(\w+)'" src/dashboard/src/components/<dir>/index.ts

# 각 참조에 대해 파일 존재 확인
ls src/dashboard/src/components/<dir>/<name>.tsx 2>/dev/null
```

**PASS 기준**: 모든 참조가 실제 파일에 매핑됨
**FAIL 기준**: 존재하지 않는 파일을 참조하는 export 존재

**수정 방법**: 삭제된 파일의 export 행을 `index.ts`에서 제거

### Step 4: 페이지 파일의 직접 파일 참조 검사

페이지 파일(`src/dashboard/src/pages/*.tsx`)에서 barrel이 있는 컴포넌트 디렉토리의 개별 파일을 직접 import하는지 검사:

```bash
# 페이지에서 barrel 디렉토리의 개별 파일을 직접 참조하는 패턴
grep -rn "from.*components/<dir>/[A-Z]" src/dashboard/src/pages/*.tsx
```

**PASS 기준**: 페이지 파일이 `from '../components/<dir>'` (barrel) 형태로 import
**FAIL 기준**: 페이지 파일이 `from '../components/<dir>/SpecificFile'` 형태로 직접 import

**수정 방법**: 직접 import를 barrel import로 변경하고, 필요하면 `index.ts`에 export 추가

## Output Format

```markdown
## Barrel Export 검증 결과

| 디렉토리 | 파일 수 | Export 수 | 누락 | 잔여참조 | 상태 |
|----------|---------|-----------|------|----------|------|
| project-configs | 14 | 7 | 0 | 0 | PASS |
| organizations | 8 | 8 | 0 | 0 | PASS |

### 발견된 이슈

| # | 디렉토리 | 유형 | 상세 |
|---|----------|------|------|
| 1 | project-configs | export 누락 | `CommandEditModal.tsx`가 index.ts에 없음 |
```

## Exceptions

1. **내부 전용 컴포넌트**: 같은 디렉토리 내에서만 사용되고 외부에서 import하지 않는 Modal 컴포넌트는 barrel export 불필요. 예: `ConfirmDeleteModal`이 `SkillsTab` 내부에서만 사용되는 경우.
2. **테스트 파일**: `__tests__/` 디렉토리 내의 `.test.tsx` 파일은 검사 대상이 아님.
3. **유틸리티 파일**: 컴포넌트가 아닌 순수 유틸리티 파일 (예: `utils.ts`, `helpers.ts`, `types.ts`)은 barrel export 대상이 아님.
