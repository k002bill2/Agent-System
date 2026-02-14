---
name: verify-test
description: 테스트 파일이 존재하고, 테스트 패턴(네이밍, 구조, 커버리지)이 일관되게 적용되는지 검증합니다.
---

# 테스트 검증

## Purpose

1. 주요 모듈(스토어, 서비스, API)에 대응하는 테스트 파일이 존재하는지 검증
2. 테스트 파일 네이밍과 구조가 프로젝트 컨벤션을 따르는지 검증
3. 테스트가 주요 시나리오(정상, 에러, 엣지 케이스)를 커버하는지 검증
4. 테스트 실행이 통과하는지 확인

## When to Run

- 새 모듈/서비스/스토어를 추가한 후
- 기존 코드의 기능을 변경한 후
- PR 생성 전 테스트 완전성 확인
- 테스트 커버리지 감소 의심 시

## Related Files

| File | Purpose |
|------|---------|
| `tests/backend/*.py` | Backend 테스트 |
| `src/dashboard/src/**/__tests__/*.test.ts(x)` | Frontend 테스트 |
| `src/dashboard/src/pages/*.test.tsx` | 페이지 테스트 |
| `src/dashboard/vitest.config.ts` | Vitest 설정 |
| `tests/backend/conftest.py` | pytest fixtures |

## Workflow

### Step 1: 소스-테스트 매핑 검사

주요 소스 파일에 대응하는 테스트 파일 존재 확인:

**Backend:**

```bash
# 서비스 파일 → 테스트 매핑
ls src/backend/services/*.py | grep -v "__"
ls tests/backend/test_*.py
```

```bash
# API 파일 → 테스트 매핑
ls src/backend/api/*.py | grep -v "__\|app\|deps"
ls tests/backend/test_api_*.py 2>/dev/null
```

**Frontend:**

```bash
# 스토어 파일 → 테스트 매핑
ls src/dashboard/src/stores/*.ts | grep -v index
ls src/dashboard/src/stores/__tests__/*.test.ts 2>/dev/null
```

```bash
# 컴포넌트 테스트 파일
find src/dashboard/src -name "*.test.tsx" -o -name "*.test.ts"
```

**PASS 기준**: 주요 서비스/스토어의 80% 이상에 테스트 파일 존재
**FAIL 기준**: 테스트 파일이 50% 미만

### Step 2: 테스트 네이밍 컨벤션 검사

```bash
# Backend: test_ prefix
ls tests/backend/ | grep -v "test_\|conftest\|__"

# Frontend: .test.ts(x) suffix
find src/dashboard/src -name "*.test.*" | head -20
```

**PASS 기준**: Backend `test_*.py`, Frontend `*.test.ts(x)` 패턴
**FAIL 기준**: 컨벤션을 따르지 않는 테스트 파일명

### Step 3: 테스트 구조 검사

테스트가 describe/it 또는 def test_ 구조를 따르는지:

```bash
# Frontend: describe/it 패턴
grep -rn "describe(\|it(\|test(" src/dashboard/src/**/*.test.* | head -20

# Backend: def test_ 패턴
grep -rn "def test_\|class Test" tests/backend/*.py | head -20
```

### Step 4: 에러 시나리오 테스트 검사

테스트에 에러/실패 시나리오가 포함되어 있는지:

```bash
# 에러 케이스 테스트
grep -rn "error\|fail\|reject\|throw\|exception\|invalid\|404\|500" tests/backend/*.py src/dashboard/src/**/*.test.* | grep -i "test\|it(\|describe"
```

**PASS 기준**: 각 테스트 파일에 최소 1개 에러 시나리오 존재
**FAIL 기준**: 정상 케이스만 테스트하고 에러 시나리오 없음

### Step 5: 테스트 실행 확인

```bash
# Backend 테스트 실행
cd src/backend && python -m pytest ../../tests/backend --tb=short -q 2>&1 | tail -5

# Frontend 테스트 실행
cd src/dashboard && npx vitest run --reporter=verbose 2>&1 | tail -10
```

**PASS 기준**: 모든 테스트 통과
**FAIL 기준**: 실패하는 테스트 존재

### Step 6: 결과 종합

## Output Format

```markdown
## 테스트 검증 결과

### 테스트 커버리지 매핑

| 소스 유형 | 소스 수 | 테스트 수 | 커버율 | 상태 |
|-----------|---------|-----------|--------|------|
| Backend 서비스 | N | X | Y% | PASS/FAIL |
| Backend API | N | X | Y% | PASS/FAIL |
| Frontend 스토어 | N | X | Y% | PASS/FAIL |
| Frontend 컴포넌트 | N | X | Y% | PASS/WARN |

### 테스트 실행 결과

| 환경 | 총 테스트 | 통과 | 실패 | 상태 |
|------|-----------|------|------|------|
| Backend (pytest) | N | X | Y | PASS/FAIL |
| Frontend (vitest) | N | X | Y | PASS/FAIL |
```

## Exceptions

1. **__init__.py**: 초기화 파일은 별도 테스트 불필요
2. **타입 정의 파일**: `types.ts`, `models.py` 등 순수 타입 파일은 테스트 불필요
3. **설정 파일**: `conftest.py`, `vitest.config.ts` 등 설정 파일은 테스트 대상 아님
4. **UI 컴포넌트 100% 커버리지 불필요**: 컴포넌트는 WARN (스토어/서비스는 FAIL)
5. **E2E 테스트**: 통합/E2E 테스트는 이 스킬 범위 외 (단위 테스트만 검증)
