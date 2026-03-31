---
name: verification-loop
description: "Boris Cherny 스타일 검증 피드백 루프. 구현 완료, 리팩토링 후, PR 생성 전, 빌드 깨짐 수정 시 사용. tsc --noEmit → ESLint → vitest → npm run build 순서로 전체 검증하고 실패 시 자동 재시도(최대 3회). 'verification loop 돌려줘', '검증해줘', 'verify', 'validate', 'check health', '빌드 확인', 'PR 전 검사', '구현 끝 확인' 등의 요청에 트리거. 개별 패턴 검사(verify-frontend/verify-backend)가 아닌, 전체 빌드 파이프라인을 한 번에 검증하는 데 특화."
---

# Verification Loop

## Overview

Boris Cherny 스타일의 검증 피드백 루프. 코드 변경 후 타입 체크, 린트, 테스트, 빌드를 단계별로 실행하여 품질을 보장한다.

**REQUIRED BACKGROUND:** superpowers:verification-before-completion

## 검증 레벨

### Level 1: Quick Check (1분 이내)
```bash
npm run type-check
```
- 타입 에러 0개 확인, 빠른 피드백 루프

### Level 2: Standard Check (2-3분)

기능 구현 완료 또는 리팩토링 후 실행하는 종합 검증.

```bash
# 1. TypeScript 타입 체크
npm run type-check
# 통과 기준: 타입 에러 0개

# 2. ESLint 린트 검사
npm run lint
# 통과 기준: 린트 에러 0개 (경고는 허용)

# 3. 테스트 실행
npm test -- --coverage --coverageReporters="text-summary"
# 통과 기준: 모든 테스트 통과, Stmt ≥75%, Fn ≥70%, Br ≥60%

# 4. 빌드 검증
npm run build
# 통과 기준: 빌드 성공
```

#### 결과 리포트 형식
```
## 검증 결과 요약

| 항목 | 상태 | 세부사항 |
|------|------|----------|
| TypeScript | PASS/FAIL | 에러 X개 |
| ESLint | PASS/FAIL | 에러 X개, 경고 Y개 |
| 테스트 | PASS/FAIL | X개 통과, Y개 실패 |
| 커버리지 | PASS/FAIL | Stmt X%, Fn Y%, Br Z% |
| 빌드 | PASS/FAIL | 성공/실패 |

**전체 상태**: PASS / FAIL
```

### Level 3: Full Check (5분 이상)
```bash
npm run type-check && npm run lint && npm test -- --coverage && npm run build:development
```
- PR 생성 전 필수

## 검증 기준

| 항목 | 필수 기준 | 권장 기준 |
|------|----------|----------|
| TypeScript | 에러 0개, `any` 금지, strict mode | — |
| ESLint | 에러 0개 | 경고 10개 미만 |
| 커버리지 | Stmt ≥75%, Fn ≥70%, Br ≥60% | — |
| 빌드 | 성공 | 번들 크기 경고 없음 |

## 실패 시 대응

| 우선순위 | 실패 항목 | 조치 |
|----------|----------|------|
| 1 (블로커) | TypeScript 에러 | 타입 정의 수정, `any` 대신 `unknown` |
| 2 | 테스트 실패 | 예상값 vs 실제값 비교, 코드 또는 테스트 수정 |
| 3 | 린트 에러 | `npm run lint -- --fix` 시도 후 수동 수정 |
| 4 | 커버리지 미달 | 테스트 추가 |

수정 후 반드시 재검증:
```bash
npm run type-check && npm test
```

## Common Mistakes

| 실수 | 수정 |
|------|------|
| Level 1만 실행 후 완료 선언 | 기능 완료 시 반드시 Level 2 실행 |
| 경고를 에러로 취급하여 불필요 수정 | ESLint 경고는 허용, 에러만 수정 |
| 테스트 실패 시 테스트만 수정 | 코드 버그인지 테스트 오류인지 판별 먼저 |
| 빌드 실패 시 바로 코드 수정 | `npm install` 및 캐시 정리부터 시도 |
| 커버리지만 보고 테스트 품질 무시 | edge case, error case 포함 여부 확인 |

## References

- [/check-health 커맨드](../../commands/check-health.md)
- [검증 패턴 레퍼런스](references/verification-patterns.md) — 패턴별 예제 및 시나리오
