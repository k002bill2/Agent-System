---
name: verify-shortlinks
description: URL 경로와 API 경로가 일관된 패턴을 따르고, 프론트-백엔드 간 경로가 동기화되어 있는지 검증합니다.
---

# URL/경로 패턴 검증

## Purpose

1. Frontend 네비게이션 경로와 Backend API 경로가 일관된 네이밍 컨벤션을 따르는지 검증
2. Frontend에서 사용하는 API URL이 Backend에 실제 존재하는지 검증
3. 하드코딩된 URL이 환경 변수 또는 상수로 관리되는지 검증

## When to Run

- 새 API 엔드포인트를 추가한 후
- Frontend에서 API 호출 경로를 변경한 후
- 네비게이션 경로를 수정한 후

## Related Files

| File | Purpose |
|------|---------|
| `src/backend/api/*.py` | Backend API 라우터 |
| `src/backend/api/app.py` | 라우터 등록 (prefix) |
| `src/dashboard/src/stores/*.ts` | API 호출 (fetch URL) |
| `src/dashboard/src/services/*.ts` | API 서비스 레이어 |
| `src/dashboard/src/App.tsx` | 뷰 경로 매핑 |

## Workflow

### Step 1: Backend API 경로 수집

모든 등록된 API 경로를 추출:

```bash
# app.py에서 라우터 prefix 추출
grep "include_router" src/backend/api/app.py

# 각 라우터의 엔드포인트 경로
grep -rn "@router\.\(get\|post\|put\|delete\|patch\)" src/backend/api/*.py
```

### Step 2: Frontend API 호출 경로 수집

Frontend에서 호출하는 API URL 추출:

```bash
# fetch/axios 호출에서 URL 추출
grep -rn "fetch(\|api\.\|axios\.\|/api/" src/dashboard/src/stores/*.ts src/dashboard/src/services/*.ts --include="*.ts"
```

### Step 3: 경로 매핑 동기화 검사

Frontend에서 호출하는 모든 API 경로가 Backend에 존재하는지:

**PASS 기준**: Frontend의 모든 API URL이 Backend 라우터에 매핑됨
**FAIL 기준**: Frontend에서 호출하는 URL이 Backend에 없음 (404 위험)

### Step 4: 하드코딩된 URL 검사

API base URL이 환경 변수로 관리되는지:

```bash
# 하드코딩된 URL 패턴
grep -rn "localhost\|127\.0\.0\.1\|http://\|https://" src/dashboard/src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules\|\.env\|comment\|//"
```

**PASS 기준**: API base URL이 `import.meta.env.VITE_API_URL` 등 환경 변수 사용
**FAIL 기준**: 하드코딩된 URL 직접 사용

### Step 5: 경로 네이밍 일관성 검사

API 경로가 kebab-case 또는 snake_case를 일관되게 사용하는지:

```bash
# camelCase 경로 탐지
grep -rn "@router\.\(get\|post\|put\|delete\)" src/backend/api/*.py | grep -E "/[a-z]+[A-Z]"
```

**PASS 기준**: 모든 경로가 동일한 케이스 컨벤션 사용
**FAIL 기준**: 혼용된 케이스 (일부 kebab, 일부 snake, 일부 camel)

### Step 6: 결과 종합

## Output Format

```markdown
## URL/경로 검증 결과

### 경로 동기화

| Frontend URL | Backend 매핑 | 상태 |
|-------------|-------------|------|
| /api/agents | GET agents.py | PASS |
| /api/tasks | GET tasks.py | PASS |
| /api/reports | - | FAIL (미존재) |

### 하드코딩된 URL

| 파일 | 라인 | URL | 상태 |
|------|------|-----|------|
| auth.ts:15 | 15 | http://localhost:8000 | FAIL |
```

## Exceptions

1. **테스트 파일**: 테스트에서 하드코딩된 URL은 허용
2. **환경 변수 fallback**: `import.meta.env.VITE_API_URL || '/api'` 형태의 fallback은 정상
3. **외부 서비스 URL**: OAuth 콜백 등 외부 서비스 URL은 하드코딩 허용
4. **주석 내 URL**: 주석에 포함된 URL은 검사 대상 아님
