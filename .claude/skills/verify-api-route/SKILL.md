---
name: verify-api-route
description: Backend API 라우트가 프로젝트 컨벤션(네이밍, 에러 처리, 인증, 응답 형식)을 따르는지 검증합니다.
---

# API Route 컨벤션 검증

## Purpose

1. API 라우트 네이밍이 RESTful 컨벤션을 따르는지 검증
2. 모든 API 핸들러에 적절한 에러 처리가 있는지 검증
3. 인증이 필요한 엔드포인트에 auth 의존성이 적용되어 있는지 검증
4. 응답 모델(response_model)이 명시되어 있는지 검증

## When to Run

- 새 API 엔드포인트를 추가한 후
- API 라우터 구조를 변경한 후
- 인증/권한 로직을 수정한 후

## Related Files

| File | Purpose |
|------|---------|
| `src/backend/api/*.py` | API 라우터 파일들 |
| `src/backend/api/deps.py` | 의존성 주입 (인증, DB 세션) |
| `src/backend/api/app.py` | 라우터 등록 |
| `src/backend/models/*.py` | Pydantic 응답 모델 |

## Workflow

### Step 1: 라우트 네이밍 컨벤션 검사

모든 API 라우터에서 엔드포인트 경로를 추출:

```bash
grep -rn "@router\.\(get\|post\|put\|delete\|patch\)" src/backend/api/*.py
```

**PASS 기준**:
- 경로가 `kebab-case` 또는 `snake_case` 사용
- 복수형 리소스명 (예: `/agents`, `/tasks`)
- RESTful 패턴: `GET /resources`, `POST /resources`, `GET /resources/{id}`

**FAIL 기준**:
- camelCase 경로 (예: `/getAgent`)
- 동사 포함 경로 (예: `/deleteAgent`) — DELETE 메서드 대신 경로에 동사 사용

### Step 2: 에러 처리 검사

API 핸들러 함수에 try/except 또는 HTTPException 사용 확인:

```bash
grep -rn "HTTPException\|raise\|try:" src/backend/api/*.py
```

각 라우터 파일별 핸들러 수와 에러 처리 수 비교:

```bash
# 핸들러 수
grep -c "@router\." src/backend/api/<file>.py

# 에러 처리 수
grep -c "HTTPException\|raise.*Exception" src/backend/api/<file>.py
```

**PASS 기준**: 모든 POST/PUT/DELETE 핸들러에 에러 처리 존재
**FAIL 기준**: 에러 처리 없는 쓰기 핸들러 존재

### Step 3: 인증 의존성 검사

인증이 필요한 엔드포인트에 `Depends(get_current_user)` 또는 유사 패턴 확인:

```bash
grep -rn "get_current_user\|require_auth\|Depends.*auth" src/backend/api/*.py
```

공개 엔드포인트(auth, health)를 제외한 모든 라우터에 인증 확인:

```bash
# 인증 없는 핸들러 탐지
grep -B5 "@router\." src/backend/api/*.py | grep -v "auth.py\|health.py" | grep -v "Depends"
```

**PASS 기준**: 공개 엔드포인트 외 모든 핸들러에 인증 의존성 존재
**FAIL 기준**: 인증 없는 비공개 핸들러 존재

### Step 4: 응답 모델 검사

라우터 데코레이터에 `response_model` 파라미터 확인:

```bash
grep -rn "@router\.\(get\|post\|put\|delete\|patch\)" src/backend/api/*.py | grep -v "response_model"
```

**PASS 기준**: GET/POST 핸들러에 response_model 명시
**FAIL 기준**: response_model 누락된 핸들러 존재

### Step 5: 라우터 등록 검사

app.py에서 모든 라우터 파일이 include_router로 등록되어 있는지 확인:

```bash
# 라우터 파일 목록
ls src/backend/api/*.py | grep -v "__init__\|app\|deps"

# 등록된 라우터 목록
grep "include_router" src/backend/api/app.py
```

**PASS 기준**: 모든 라우터 파일이 app.py에 등록됨
**FAIL 기준**: 등록 누락된 라우터 존재

## Output Format

```markdown
## API Route 검증 결과

| 검사 항목 | 대상 | 통과 | 이슈 | 상태 |
|-----------|------|------|------|------|
| 네이밍 컨벤션 | N개 엔드포인트 | X | Y | PASS/FAIL |
| 에러 처리 | N개 핸들러 | X | Y | PASS/FAIL |
| 인증 의존성 | N개 핸들러 | X | Y | PASS/FAIL |
| 응답 모델 | N개 핸들러 | X | Y | PASS/FAIL |
| 라우터 등록 | N개 파일 | X | Y | PASS/FAIL |
```

## Exceptions

1. **공개 엔드포인트**: `auth.py`, `health.py`의 엔드포인트는 인증 불필요
2. **deps.py, __init__.py**: 라우터 파일이 아닌 유틸리티 파일 제외
3. **WebSocket 엔드포인트**: WebSocket은 별도의 인증 패턴 사용 가능
4. **내부 전용 엔드포인트**: 서비스 간 통신용 엔드포인트는 별도 인증 체계
