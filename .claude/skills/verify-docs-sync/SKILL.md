---
name: verify-docs-sync
description: 소스 코드와 docs/ 문서의 동기화를 검증합니다. 새 API, 컴포넌트, 스토어, 페이지 추가 후 사용.
---

# 문서 동기화 검증

## Purpose

CLAUDE.md의 "문서 자동 업데이트 규칙"에 따라:

1. 새 API 엔드포인트가 `docs/api-reference.md`에 등록되어 있는지 검증
2. 새 Dashboard 컴포넌트가 `docs/dashboard.md`에 등록되어 있는지 검증
3. 새 Dashboard 페이지가 `docs/dashboard.md` Pages 테이블에 등록되어 있는지 검증
4. 새 Zustand 스토어가 `docs/dashboard.md` Stores 테이블에 등록되어 있는지 검증
5. 새 기능/서비스가 `docs/features.md`에 설명되어 있는지 검증

## When to Run

- 새 API 엔드포인트(`src/backend/api/*.py`)를 추가한 후
- 새 Dashboard 컴포넌트(`src/dashboard/src/components/**/*.tsx`)를 추가한 후
- 새 페이지(`src/dashboard/src/pages/*.tsx`)를 추가한 후
- 새 Zustand 스토어(`src/dashboard/src/stores/*.ts`)를 추가한 후
- 새 기능/서비스(`src/backend/services/*.py`)를 추가한 후
- PR 생성 전 문서 완전성 확인 시

## Related Files

| File | Purpose |
|------|---------|
| `docs/api-reference.md` | API 엔드포인트 레퍼런스 |
| `docs/dashboard.md` | Dashboard 컴포넌트, 페이지, 스토어 문서 |
| `docs/features.md` | 핵심 기능 설명 |
| `CLAUDE.md` | 문서 업데이트 규칙 정의 (참조용) |
| `src/backend/api/*.py` | API 라우터 파일들 |
| `src/dashboard/src/components/**/*.tsx` | Dashboard 컴포넌트 파일들 |
| `src/dashboard/src/pages/*.tsx` | Dashboard 페이지 파일들 |
| `src/dashboard/src/stores/*.ts` | Zustand 스토어 파일들 |
| `src/backend/services/*.py` | 백엔드 서비스 파일들 |

## Workflow

### Step 1: 변경된 소스 파일에서 새 항목 탐지

현재 세션에서 변경/추가된 파일을 수집합니다:

```bash
# 변경된 파일 목록
git diff HEAD --name-only
git ls-files --others --exclude-standard
```

변경 파일을 카테고리별로 분류:
- **API 파일**: `src/backend/api/*.py` 내의 `@router.` 데코레이터
- **컴포넌트 파일**: `src/dashboard/src/components/**/*.tsx` 내의 `export function` 또는 `export const`
- **페이지 파일**: `src/dashboard/src/pages/*.tsx`
- **스토어 파일**: `src/dashboard/src/stores/*.ts` 내의 `create<`
- **서비스 파일**: `src/backend/services/*.py`

### Step 2: API 엔드포인트 문서 동기화 검사

**소스에서 엔드포인트 추출:**

```bash
grep -n "@router\.\(get\|post\|put\|delete\|patch\)" src/backend/api/<changed_file>.py
```

**docs에서 매칭 확인:**

```bash
grep "<endpoint_path>" docs/api-reference.md
```

**PASS 기준**: 소스의 모든 `@router.*` 엔드포인트가 `docs/api-reference.md`에 행으로 존재
**FAIL 기준**: 소스에 있지만 docs에 없는 엔드포인트 존재

**수정 방법**: `docs/api-reference.md`의 해당 섹션 테이블에 누락 엔드포인트 추가:
```markdown
| METHOD | `/api/path` | 설명 |
```

### Step 3: Dashboard 컴포넌트 문서 동기화 검사

**소스에서 컴포넌트 추출:**

```bash
# 새로 추가된 .tsx 파일에서 export된 컴포넌트 이름 추출
grep -n "export function\|export const" src/dashboard/src/components/<dir>/<new_file>.tsx
```

**docs에서 매칭 확인:**

```bash
grep "<ComponentName>" docs/dashboard.md
```

**PASS 기준**: 새 컴포넌트가 `docs/dashboard.md`의 적절한 Components 섹션에 존재
**FAIL 기준**: 소스에 있지만 docs에 없는 컴포넌트 존재

**수정 방법**: `docs/dashboard.md`의 해당 컴포넌트 섹션 테이블에 추가:
```markdown
| `ComponentName` | 설명 |
```

### Step 4: Dashboard 페이지 문서 동기화 검사

**소스에서 페이지 파일 확인:**

```bash
ls src/dashboard/src/pages/*.tsx
```

**docs에서 매칭 확인:**

```bash
grep "<PageName>" docs/dashboard.md
```

**PASS 기준**: 모든 페이지 파일이 `docs/dashboard.md`의 Pages 테이블에 존재
**FAIL 기준**: 새 페이지 파일이 docs에 없음

**수정 방법**: `docs/dashboard.md`의 Pages 테이블에 추가:
```markdown
| `PageName` | `/route` | 설명 |
```

### Step 5: Zustand 스토어 문서 동기화 검사

**소스에서 스토어 확인:**

```bash
grep -l "create<" src/dashboard/src/stores/*.ts
```

**docs에서 매칭 확인:**

```bash
grep "<storeName>" docs/dashboard.md
```

**PASS 기준**: 모든 스토어가 `docs/dashboard.md`의 Stores 테이블에 존재
**FAIL 기준**: 새 스토어가 docs에 없음

### Step 6: 결과 종합

변경된 파일만 대상으로 검사 결과를 종합합니다.

## Output Format

```markdown
## 문서 동기화 검증 결과

### API 엔드포인트 (docs/api-reference.md)

| 소스 파일 | 엔드포인트 | docs 등록 |
|-----------|-----------|-----------|
| project_configs.py | GET /commands | MISSING |
| project_configs.py | POST /commands | MISSING |

### Dashboard 컴포넌트 (docs/dashboard.md)

| 소스 파일 | 컴포넌트 | docs 등록 |
|-----------|----------|-----------|
| CommandsTab.tsx | CommandsTab | MISSING |
| CommandEditModal.tsx | CommandEditModal | MISSING |

### 요약

- API 엔드포인트: X개 중 Y개 누락
- 컴포넌트: X개 중 Y개 누락
- 페이지: 동기화됨
- 스토어: 동기화됨
```

## Exceptions

1. **테스트 파일**: `__tests__/` 디렉토리의 파일이나 `.test.tsx` 파일은 문서 대상이 아님
2. **내부 유틸리티**: `utils.ts`, `helpers.ts`, `types.ts` 등 유틸리티 파일은 컴포넌트 문서 대상이 아님
3. **deps.py, __init__.py**: API 디렉토리의 의존성 주입(`deps.py`)이나 초기화(`__init__.py`) 파일은 엔드포인트 문서 대상이 아님
4. **Skeleton 컴포넌트**: `skeletons/` 디렉토리의 로딩 스켈레톤은 개별 문서화 불필요
5. **기존 파일의 수정**: 이미 docs에 등록된 컴포넌트/엔드포인트의 내부 수정은 문서 업데이트 불필요 (새 항목 추가만 검사)
