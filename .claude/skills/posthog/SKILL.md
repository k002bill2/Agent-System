---
name: posthog
description: PostHog 또는 커스텀 분석 이벤트 트래킹이 올바르게 구현되었는지 검증합니다. Use when adding analytics events or verifying event tracking implementation.
---

# Analytics 이벤트 트래킹 검증

## Purpose

1. 주요 사용자 액션에 분석 이벤트 트래킹이 포함되어 있는지 검증
2. 이벤트 이름이 네이밍 컨벤션을 따르는지 검증
3. 이벤트 속성(properties)에 필수 필드가 포함되어 있는지 검증

## When to Run

- 새 페이지나 주요 기능을 추가한 후
- 사용자 인터랙션 흐름을 변경한 후
- 분석 관련 코드를 수정한 후

## Related Files

| File | Purpose |
|------|---------|
| `src/dashboard/src/pages/*.tsx` | 페이지 컴포넌트 (이벤트 트래킹 대상) |
| `src/dashboard/src/stores/*.ts` | 스토어 액션 (API 호출 트래킹 대상) |
| `src/dashboard/src/services/*.ts` | 서비스 레이어 |
| `src/backend/api/*.py` | API 엔드포인트 (서버사이드 이벤트) |

## Workflow

### Step 1: 분석 트래킹 코드 존재 확인

프로젝트에서 분석 트래킹 관련 코드를 검색합니다:

```bash
grep -rn "track\|analytics\|posthog\|logEvent\|captureEvent" src/dashboard/src/ --include="*.ts" --include="*.tsx"
```

### Step 2: 주요 사용자 액션 트래킹 검사

다음 액션들에 이벤트 트래킹이 있는지 확인:

1. **인증 이벤트**: 로그인, 로그아웃, 회원가입
2. **CRUD 이벤트**: 생성, 수정, 삭제 작업
3. **네비게이션 이벤트**: 페이지 전환
4. **에러 이벤트**: API 에러, 클라이언트 에러

각 스토어의 주요 액션 함수에서 트래킹 호출 존재 여부:

```bash
grep -n "async.*=.*=>" src/dashboard/src/stores/*.ts | grep -v "get\|fetch\|load"
```

### Step 3: 이벤트 네이밍 컨벤션 검사

이벤트 이름이 `snake_case` 형식인지 확인:

```bash
grep -rn "track\|captureEvent\|logEvent" src/dashboard/src/ --include="*.ts" --include="*.tsx" | grep -v "snake_case_pattern"
```

**PASS 기준**: 모든 이벤트명이 `snake_case` 형식
**FAIL 기준**: camelCase, PascalCase 등 다른 형식의 이벤트명 존재

### Step 4: 결과 종합

## Output Format

```markdown
## Analytics 트래킹 검증 결과

### 트래킹 현황

| 카테고리 | 총 액션 | 트래킹됨 | 누락 | 상태 |
|----------|---------|----------|------|------|
| 인증 | N | N | 0 | PASS |
| CRUD | N | N | X | FAIL |
| 네비게이션 | N | N | 0 | PASS |

### 네이밍 컨벤션

| 이벤트명 | 형식 | 상태 |
|----------|------|------|
| user_login | snake_case | PASS |
```

## Exceptions

1. **순수 조회 액션**: `fetch*`, `get*`, `load*` 등 데이터 조회만 하는 함수는 트래킹 불필요
2. **내부 상태 업데이트**: UI 상태만 변경하는 setter 함수는 트래킹 불필요
3. **개발용 유틸리티**: 디버깅, 로깅 전용 함수는 트래킹 불필요
4. **분석 시스템 미도입 프로젝트**: 프로젝트에 분석 라이브러리가 없으면 안내 후 종료
