---
name: verification-loop
description: "풀스택 검증 피드백 루프. 구현 완료, 리팩토링 후, PR 생성 전, 빌드 깨짐 수정 시 사용. 프론트(src/dashboard: tsc --noEmit → ESLint → vitest run → build)와 백엔드(src/backend: ruff → mypy → pytest)를 변경 영역에 맞게 전체 검증하고 실패 시 자동 재시도(최대 3회). 'verification loop 돌려줘', '검증해줘', 'verify', 'validate', 'check health', '빌드 확인', 'PR 전 검사', '구현 끝 확인' 등의 요청에 트리거. 개별 패턴 검사(verify-frontend/verify-backend)가 아닌, 전체 빌드 파이프라인을 한 번에 검증하는 데 특화."
---

# Verification Loop

## Overview

풀스택 검증 피드백 루프. 코드 변경 후 타입 체크, 린트, 테스트, 빌드를 단계별로 실행하여 품질을 보장한다. 게이트 명령은 CI(`.github/workflows/ci.yml`)의 7개 job과 1:1로 정렬되어 있다 — 로컬에서 통과하면 CI에서도 통과해야 한다.

**REQUIRED BACKGROUND:** superpowers:verification-before-completion

## 트랙 선택 (필수)

변경 파일 영역에 따라 실행할 트랙을 정한다. 판단이 모호하면 **둘 다** 실행한다:

| 변경 영역 | 실행 트랙 |
|-----------|----------|
| `src/backend/**` 포함 | 백엔드 트랙 필수 |
| `src/dashboard/**` 포함 | 프론트 트랙 필수 |
| 양쪽 모두 / 불명확 | 두 트랙 모두 |

**CWD 규칙 (필수):** 모든 명령은 아래 명시된 디렉토리에서 실행한다. 저장소 루트에서 `npm test`류를 실행하지 않는다 — 루트 `package.json` 스크립트는 대시보드 위임 래퍼일 뿐이며, 과거 루트 `test` 스크립트가 no-op이어서 테스트 단계가 조용히 "통과"한 사고가 있었다.

**장시간 명령의 detach 실행 (권장):** 전체 테스트·커버리지·빌드처럼 2분을 넘길 수 있는 명령은 세션 환경의 프로세스 시간 제한(~150초 강제 종료)에 걸려 **결과가 정상인데 exit 코드만 잃는** 사고가 실측됐다. 이런 명령은 `nohup <명령> > <로그> 2>&1 & disown`으로 분리 실행하고, 프로세스 종료 후 **로그의 종결 산출**(테스트 요약 라인·실패 카운트·커버리지 표·임계치 에러 유무)로 판정한다. 로그에 종결 산출이 없으면 통과로 간주하지 않는다 (부분 로그 ≠ 통과).

## 검증 레벨

### Level 1: Quick Check (1분 이내)
```bash
# 프론트 변경 시 (CWD: src/dashboard)
npm run type-check

# 백엔드 변경 시 (CWD: src/backend)
uv run ruff check .
```
- 에러 0개 확인, 빠른 피드백 루프

### Level 2: Standard Check (5분 내외)

기능 구현 완료 또는 리팩토링 후 실행하는 종합 검증. 해당 트랙 전체를 순서대로 실행한다.

**백엔드 트랙 (CWD: `src/backend`)** — CI job: Backend Lint / Backend Type Check / Backend Tests
```bash
# 1. Ruff 린트 + 포맷 검사
uv run ruff check .
uv run ruff format --check .
# 통과 기준: 위반 0개

# 2. MyPy 타입 체크
uv run mypy . --ignore-missing-imports
# 통과 기준: 에러 0개 (래칫 전략 — pyproject.toml disable_error_code 참조)

# 3. pytest 테스트
uv run pytest ../../tests/backend -v --tb=short
# 통과 기준: 실패 0개
# 주의: 이 명령은 rootdir가 repo 루트로 해석되어 src/backend/pyproject.toml의 pytest 설정
#       (asyncio_mode=auto 등)이 적용되지 않는다 (실측: configfile 미탐지, asyncio mode=STRICT).
#       → async 테스트는 @pytest.mark.asyncio 마커 필수 (.claude/rules/aos-backend.md Pytest 절)
```

**프론트 트랙 (CWD: `src/dashboard`)** — CI job: Frontend Lint / Type Check / Tests / Build
```bash
# 1. TypeScript 타입 체크
npm run type-check
# 통과 기준: 타입 에러 0개

# 2. ESLint 린트 검사
npm run lint
# 통과 기준: 린트 에러 0개 (경고는 허용)

# 3. 테스트 + 커버리지 (watch 모드 금지 — 반드시 run)
npm run test:coverage
# 통과 기준: 모든 테스트 통과 + vitest.config.ts의 coverage.thresholds 충족
#            (임계치 수치의 SSOT는 src/dashboard/vitest.config.ts — 여기 복제하지 않음)

# 4. 빌드 검증
npm run build
# 통과 기준: 빌드 성공
```

#### 결과 리포트 형식
```
## 검증 결과 요약

| 트랙 | 항목 | 상태 | 세부사항 |
|------|------|------|----------|
| BE | Ruff | PASS/FAIL/SKIP(사유) | 위반 X개 |
| BE | MyPy | PASS/FAIL/SKIP(사유) | 에러 X개 |
| BE | pytest | PASS/FAIL/SKIP(사유) | X passed, Y failed, Z skipped |
| FE | TypeScript | PASS/FAIL/SKIP(사유) | 에러 X개 |
| FE | ESLint | PASS/FAIL/SKIP(사유) | 에러 X개, 경고 Y개 |
| FE | 테스트 | PASS/FAIL/SKIP(사유) | X개 통과, Y개 실패 |
| FE | 커버리지 | PASS/FAIL | vitest.config.ts 임계치 대비 |
| FE | 빌드 | PASS/FAIL/SKIP(사유) | 성공/실패 |

**전체 상태**: PASS / FAIL
```
- SKIP은 트랙 선택 규칙에 따라 해당 영역 변경이 없을 때만 허용되며, 반드시 사유를 적는다.

### Level 3: Full Check (PR 생성 전 필수)

변경 영역과 무관하게 **두 트랙 전체**를 실행한다 (Level 2의 백엔드 트랙 + 프론트 트랙 전부). CI가 두 트랙을 모두 돌리므로 PR 전 로컬 검증도 동일해야 한다.

## 검증 기준

| 트랙 | 항목 | 필수 기준 | 권장 기준 |
|------|------|----------|----------|
| BE | Ruff | check + format --check 위반 0개 | — |
| BE | MyPy | 에러 0개 | — |
| BE | pytest | 실패 0개 | 새 코드에 테스트 동반 |
| FE | TypeScript | 에러 0개, `any` 금지, strict mode | — |
| FE | ESLint | 에러 0개 | 경고 10개 미만 |
| FE | 커버리지 | `src/dashboard/vitest.config.ts`의 `coverage.thresholds` 충족 (SSOT — 수치는 config만 참조) | — |
| FE | 빌드 | 성공 | 번들 크기 경고 없음 |

## 실패 시 대응

| 우선순위 | 실패 항목 | 조치 |
|----------|----------|------|
| 1 (블로커) | TypeScript/MyPy 에러 | 타입 정의 수정, `any` 대신 `unknown` |
| 2 | 테스트 실패 (vitest/pytest) | 예상값 vs 실제값 비교, 코드 또는 테스트 수정. 백엔드 async 테스트는 `@pytest.mark.asyncio` 마커 확인(`.claude/rules/aos-backend.md`) |
| 3 | 린트 에러 | FE: `npm run lint -- --fix`, BE: `uv run ruff check . --fix` 시도 후 수동 수정 |
| 4 | 커버리지 미달 | 테스트 추가 |

수정 후 반드시 재검증 (실패했던 항목 + 해당 트랙 전체):
```bash
# 프론트 (CWD: src/dashboard)
npm run type-check && npm run test:run

# 백엔드 (CWD: src/backend)
uv run ruff check . && uv run pytest ../../tests/backend --tb=short
```

## Common Mistakes

| 실수 | 수정 |
|------|------|
| 저장소 루트에서 게이트 명령 실행 | 반드시 명시된 CWD(src/dashboard 또는 src/backend)에서 실행 |
| 백엔드 변경인데 프론트 트랙만 실행 | 트랙 선택 표대로 백엔드 트랙(ruff/mypy/pytest) 실행 |
| `npm test`(watch 모드)로 게이트 실행 | `npm run test:run` 또는 `npm run test:coverage` 사용 |
| Level 1만 실행 후 완료 선언 | 기능 완료 시 반드시 Level 2 실행 |
| 경고를 에러로 취급하여 불필요 수정 | ESLint 경고는 허용, 에러만 수정 |
| 테스트 실패 시 테스트만 수정 | 코드 버그인지 테스트 오류인지 판별 먼저 |
| 빌드 실패 시 바로 코드 수정 | `npm install` 및 캐시 정리부터 시도 |
| 커버리지만 보고 테스트 품질 무시 | edge case, error case 포함 여부 확인 |

## 사용하지 말아야 할 때

단일 파일의 사소한 편집, 문서/주석 수정에는 전체 검증 루프를 돌리지 마라. 구현 완료, 리팩토링 직후, PR 직전에만 사용한다. 작은 변경에는 Level 1 Quick Check로 충분하다.

## References

- [/check-health 커맨드](../../commands/check-health.md)
- [검증 패턴 레퍼런스](references/verification-patterns.md) — 패턴별 예제 및 시나리오
- CI 정의: `.github/workflows/ci.yml` (게이트 명령의 정렬 대상)
