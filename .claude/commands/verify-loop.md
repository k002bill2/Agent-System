---
allowed-tools: Bash(npm:*), Bash(npx:*), Bash(uv:*), Bash(python:*), Bash(git:*), Read, Edit, Grep, Glob
description: 자동 재검증 루프 (최대 3회 재시도, 실패 시 자동 수정)
argument-hint: [의도 설명] [--max-retries N] [--only build|test|lint]
---

## Task

### 1단계: 환경 수집
- `git status --short`
- `git diff --name-only`
- CLAUDE.md 확인

### 2단계: 검증 루프 (최대 N회)

각 시도마다:

1. **코드 리뷰** (think hard):
   - `git diff` 분석
   - 의도대로 구현됐는지
   - 로직 오류, 엣지 케이스
   - 보안 취약점

2. **자동화 검증** (AOS 프로젝트 — verification-loop 스킬·CI(`.github/workflows/ci.yml`)와 동일 게이트):
   - Backend Lint/Format: `cd src/backend && uv run ruff check . && uv run ruff format --check .`
   - Backend Type: `cd src/backend && uv run mypy . --ignore-missing-imports`
   - Backend Test: `cd src/backend && uv run pytest ../../tests/backend --tb=short`
   - Dashboard Build: `cd src/dashboard && npm run build`
   - Dashboard Test+Coverage: `cd src/dashboard && npm run test:coverage` (임계치 SSOT: vitest.config.ts)
   - TypeScript: `cd src/dashboard && npx tsc --noEmit`
   - Lint: `cd src/dashboard && npm run lint`

3. **결과 출력**:
   ```
   ├── BE Ruff/Format: PASS/FAIL
   ├── BE MyPy: PASS/FAIL
   ├── BE pytest: PASS/FAIL (N failed)
   ├── FE Build: PASS/FAIL
   ├── FE Test+Coverage: PASS/FAIL
   ├── FE Lint: PASS/WARN (N fixable)
   └── FE TypeCheck: PASS/FAIL
   ```

### 3단계: 실패 시 자동 수정
- import 누락 → 자동 추가
- 린트 포맷 → FE `eslint --fix` / BE `uv run ruff check . --fix`
- 미사용 변수 → 삭제
- 타입 단순 오류 → 수정

### 4단계: 통과 시
```
Verification Loop 완료 (N회 시도, 성공)
다음 단계: /commit-push-pr
```

### 5단계: max_retries 도달 시
```
Verification Loop 실패 (N회 시도 모두 실패)
반복 실패 에러 상세 및 권장 조치 안내
```
