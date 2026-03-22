---
name: verify-backend
description: >
  Python/FastAPI/LangGraph 백엔드 패턴 검증.
  Use when: (1) FastAPI 엔드포인트 추가/수정 후, (2) LangGraph 노드 생성/변경 후,
  (3) 백엔드 PR 생성 전
---

# 백엔드 패턴 검증

검증 스크립트를 실행하여 5개 항목을 자동 검사:

```bash
bash scripts/verify.sh
```

## 검사 항목

1. **타입 힌트** — 모든 함수 시그니처 + 반환값 타입 힌트 필수
2. **bare except 금지** — `except Exception as e:` 형태로 예외 타입 지정
3. **하드코딩 시크릿 금지** — 환경변수(`os.environ`) 사용
4. **sync I/O 차단** — `requests.get` 대신 `httpx.AsyncClient`, `time.sleep` 대신 `asyncio.sleep`
5. **print() 금지** — `logging.getLogger(__name__)` 사용

## 출력 형식

| # | 검사 항목 | 상태 | 이슈 수 |
|---|-----------|------|---------|
| 1 | 타입 힌트 | PASS/FAIL | N |
| 2 | bare except | PASS/FAIL | N |
| 3 | 하드코딩 시크릿 | PASS/FAIL | N |
| 4 | sync I/O | PASS/FAIL | N |
| 5 | print() | PASS/FAIL | N |

## 예외 (위반 아님)

- **테스트 파일** (`test_*.py`) — 타입 힌트 누락, print 허용
- **CLI 스크립트** (`cli/`) — print 사용은 의도적 출력
- **마이그레이션** — Alembic 자동 생성 코드 면제
- **설정 파일** (`config.py`) — 기본값 문자열은 시크릿 아님
- **`__init__.py`** — 모듈 초기화 타입 힌트 면제

## 관련 파일

| 경로 | 용도 |
|------|------|
| `src/backend/**/*.py` | 백엔드 소스 코드 |
| `.claude/rules/aos-backend.md` | 백엔드 규칙 원본 |
