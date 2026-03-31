---
name: verify-backend
description: "Python/FastAPI/LangGraph 백엔드 패턴 검증 전문 스킬. FastAPI 엔드포인트, LangGraph 노드, SQLAlchemy 모델, 서비스 레이어를 수정한 후 반드시 사용. 타입 힌트 완전성, bare except 금지, 하드코딩 시크릿, sync I/O 차단, print문 잔존, logging 패턴, Pydantic 모델 검증을 체계적으로 검사. '백엔드 검증', '타입 힌트 확인', 'FastAPI 패턴 맞나', 'bare except 있나', 'async 일관성 확인' 등의 요청에 트리거. 프론트엔드나 테스트 작성이 아닌, Python 백엔드 코드의 패턴 준수 여부를 검사하는 데 특화."
allowed-tools: Bash, Grep, Glob, Read
---

# Verify Backend

## Overview

Python 백엔드의 5가지 필수 패턴(타입 힌트, bare except, 하드코딩 시크릿, sync I/O, print)을 자동 검증하는 스킬. 엔드포인트/노드 변경 후 또는 PR 전에 실행한다.

## 검증 실행

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

## Common Mistakes

| 실수 | 수정 |
|------|------|
| 테스트 파일에서 FAIL 보고 | 예외 목록 확인 — `test_*.py`는 면제 |
| `except:` bare except 사용 | `except Exception as e:` 또는 구체 예외 타입 지정 |
| `requests.get()` 동기 호출 | `async with httpx.AsyncClient() as client:` 비동기 전환 |
| `time.sleep()` 사용 | `await asyncio.sleep()` 비동기 전환 |
| `print()` 디버깅용 남김 | `logger = logging.getLogger(__name__)` 후 `logger.info()` |

## References

| 경로 | 용도 |
|------|------|
| `src/backend/**/*.py` | 백엔드 소스 코드 |
| `.claude/rules/aos-backend.md` | 백엔드 규칙 원본 |
