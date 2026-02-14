---
name: verify-points
description: 핵심 체크포인트(API 헬스, DB 연결, 환경 변수, 주요 기능 엔드포인트)가 올바르게 설정되어 있는지 검증합니다.
---

# 핵심 체크포인트 검증

## Purpose

1. API 헬스체크 엔드포인트가 올바르게 구현되어 있는지 검증
2. 필수 환경 변수가 코드에서 참조되는 곳에 기본값 또는 검증이 있는지 확인
3. DB 연결 설정이 올바른지 검증
4. 주요 기능의 진입점(엔트리포인트)이 정상 동작하는지 검증

## When to Run

- 배포 전 최종 검증
- 환경 변수를 추가/변경한 후
- DB 설정을 수정한 후
- 주요 기능을 추가/수정한 후

## Related Files

| File | Purpose |
|------|---------|
| `src/backend/api/health.py` | 헬스체크 API |
| `src/backend/api/app.py` | 앱 설정, 라우터 등록 |
| `src/backend/db/*.py` | 데이터베이스 설정 |
| `.env` / `.env.example` | 환경 변수 |
| `src/dashboard/vite.config.ts` | 프론트엔드 설정 |

## Workflow

### Step 1: 헬스체크 엔드포인트 검사

헬스체크 엔드포인트 존재 및 구현 확인:

```bash
grep -rn "health\|readiness\|liveness" src/backend/api/ --include="*.py"
```

**PASS 기준**: `/health` 엔드포인트가 DB 연결 상태를 포함한 응답 반환
**FAIL 기준**: 헬스체크 없거나 단순 200 반환만 하는 경우

### Step 2: 환경 변수 참조 검사

코드에서 사용하는 환경 변수가 기본값이나 검증을 갖는지:

```bash
# Backend 환경 변수 참조
grep -rn "os.environ\|os.getenv\|environ.get\|env\." src/backend/ --include="*.py" | grep -v "__pycache__"

# Frontend 환경 변수 참조
grep -rn "import.meta.env\|VITE_" src/dashboard/src/ --include="*.ts" --include="*.tsx"
```

```bash
# 기본값 없는 환경 변수 (위험)
grep -rn "os.environ\[" src/backend/ --include="*.py" | grep -v "get("
```

**PASS 기준**: 모든 환경 변수에 기본값 또는 명확한 에러 메시지 존재
**FAIL 기준**: 기본값 없는 `os.environ[]` 직접 접근으로 KeyError 위험

### Step 3: DB 연결 설정 검사

```bash
# DB URL 설정 확인
grep -rn "DATABASE_URL\|create_engine\|create_async_engine\|sessionmaker" src/backend/db/ --include="*.py"

# 연결 풀 설정 확인
grep -rn "pool_size\|max_overflow\|pool_timeout" src/backend/ --include="*.py"
```

**PASS 기준**: 비동기 엔진(asyncpg) 사용, 연결 풀 설정 존재
**FAIL 기준**: 동기 엔진 사용 또는 연결 풀 미설정

### Step 4: CORS 설정 검사

```bash
grep -rn "CORS\|cors\|allow_origins\|allow_methods" src/backend/api/app.py
```

**PASS 기준**: CORS 미들웨어 설정에 FRONTEND_URL 참조
**FAIL 기준**: `allow_origins=["*"]` 프로덕션 환경에서 사용

### Step 5: 결과 종합

## Output Format

```markdown
## 핵심 체크포인트 검증 결과

| 검사 항목 | 상태 | 상세 |
|-----------|------|------|
| 헬스체크 | PASS/FAIL | /health 엔드포인트 상태 |
| 환경 변수 | PASS/WARN | N개 변수 중 X개 기본값 없음 |
| DB 연결 | PASS/FAIL | asyncpg + 풀 설정 |
| CORS | PASS/WARN | 설정 적절성 |
```

## Exceptions

1. **로컬 개발 환경**: 개발 환경에서 `allow_origins=["*"]` 사용은 허용
2. **선택적 서비스**: ChromaDB, Redis 등 선택적 서비스의 미설정은 WARN (FAIL 아님)
3. **테스트 환경**: 테스트 설정 파일(conftest.py)의 환경 변수는 제외
