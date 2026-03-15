---
name: verify-backend
description: Python/FastAPI/LangGraph 백엔드 패턴 검증. API 구현 후, PR 전 사용.
---

# 백엔드 패턴 검증

## Purpose

AOS 백엔드 코드가 프로젝트 규칙을 준수하는지 검증합니다:

1. **타입 힌트** — 모든 함수 시그니처 + 반환값 타입 힌트 필수
2. **비동기 패턴** — async/await 일관 사용, sync 호출로 이벤트 루프 차단 금지
3. **에러 처리** — HTTPException 사용, bare except 금지
4. **보안** — 하드코딩된 시크릿 금지, SQL 파라미터 바인딩, 민감 데이터 로깅 금지

## When to Run

- FastAPI 엔드포인트를 추가하거나 수정한 후
- LangGraph 노드를 생성하거나 변경한 후
- 백엔드 PR 생성 전

## Related Files

| File | Purpose |
|------|---------|
| `src/backend/api/**/*.py` | FastAPI 라우터 |
| `src/backend/agents/**/*.py` | 에이전트 정의 |
| `src/backend/orchestrator/**/*.py` | 오케스트레이션 노드 |
| `src/backend/services/**/*.py` | 비즈니스 로직 서비스 |
| `src/backend/models/**/*.py` | 데이터 모델 |
| `src/backend/db/**/*.py` | SQLAlchemy ORM |
| `.claude/rules/aos-backend.md` | 백엔드 규칙 원본 |

## Workflow

### Step 1: 타입 힌트 누락 검사

**파일:** `src/backend/**/*.py`

**검사:** 함수 정의에 반환 타입 힌트가 없는 경우를 탐지합니다.

```bash
# 반환 타입 없는 def 탐지 (-> 없는 def)
grep -rn "def .*(.*):" src/backend/ --include="*.py" | grep -v "\->" | grep -v "__pycache__" | grep -v "test_"
```

**PASS:** 모든 함수에 반환 타입 힌트 존재
**FAIL:** 반환 타입 힌트 누락 → `-> ReturnType` 추가 권장

### Step 2: bare except 검사

**파일:** `src/backend/**/*.py`

**검사:** `except:` (예외 타입 미지정)를 탐지합니다.

```bash
grep -rn "except:" src/backend/ --include="*.py" | grep -v "except Exception" | grep -v "__pycache__"
```

**PASS:** 모든 except에 예외 타입 지정됨
**FAIL:** bare except 발견 → `except Exception as e:` 등으로 교체 권장

### Step 3: 하드코딩된 시크릿 검사

**파일:** `src/backend/**/*.py`

**검사:** API 키, 비밀번호 등이 하드코딩되었는지 탐지합니다.

```bash
grep -rn "password\s*=\s*[\"'].\+[\"']\|api_key\s*=\s*[\"'].\+[\"']\|secret\s*=\s*[\"'].\+[\"']" src/backend/ --include="*.py" | grep -v "__pycache__" | grep -v "test_" | grep -v "\.env"
```

**PASS:** 하드코딩된 시크릿 없음
**FAIL:** 시크릿 하드코딩 발견 → 환경변수로 교체 필수

### Step 4: sync 호출 차단 검사

**파일:** `src/backend/**/*.py`

**검사:** async 컨텍스트에서 동기 I/O 호출을 탐지합니다.

```bash
# async 함수 내 동기 호출 패턴 (requests.get, open(), time.sleep)
grep -rn "requests\.\(get\|post\|put\|delete\)\|time\.sleep\b" src/backend/ --include="*.py" | grep -v "__pycache__" | grep -v "test_"
```

**PASS:** 동기 I/O 호출 없음 (httpx.AsyncClient, asyncio.sleep 사용)
**FAIL:** 동기 I/O 발견 → async 대체 함수로 교체 권장

### Step 5: 로깅 패턴 검사

**파일:** `src/backend/**/*.py`

**검사:** `print()` 대신 `logging` 모듈을 사용하는지, 민감 데이터를 로깅하지 않는지 확인합니다.

```bash
# print() 사용 탐지
grep -rn "^\s*print(" src/backend/ --include="*.py" | grep -v "__pycache__" | grep -v "test_" | grep -v "cli"
```

**PASS:** print() 미사용 (logging.getLogger 사용)
**FAIL:** print() 발견 → `logger = logging.getLogger(__name__)` + `logger.info()` 사용 권장

## Output Format

```markdown
## 백엔드 검증 결과

| # | 검사 항목 | 상태 | 이슈 수 | 상세 |
|---|-----------|------|---------|------|
| 1 | 타입 힌트 | PASS/FAIL | N | ... |
| 2 | bare except | PASS/FAIL | N | ... |
| 3 | 하드코딩 시크릿 | PASS/FAIL | N | ... |
| 4 | sync 호출 차단 | PASS/FAIL | N | ... |
| 5 | 로깅 패턴 | PASS/FAIL | N | ... |
```

## Exceptions

다음은 **위반이 아닙니다**:

1. **테스트 파일** — `test_*.py` 파일에서의 타입 힌트 누락, print 사용은 허용
2. **CLI 스크립트** — `cli/` 디렉토리의 print 사용은 의도적 출력
3. **마이그레이션 파일** — Alembic 마이그레이션의 자동 생성 코드는 면제
4. **설정 파일** — `config.py`의 기본값 문자열은 시크릿이 아님 (예: `default="localhost"`)
5. **__init__.py** — 모듈 초기화 파일의 타입 힌트 면제
