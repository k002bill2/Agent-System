---
name: verification-loop
description: >
  Boris Cherny style verification feedback loop automation. Run type check, lint, test, and build verification.
  Use when: (1) 컴포넌트 구현 완료 후, (2) 리팩토링 후, (3) PR 생성 전 최종 검증,
  (4) 코드 변경 후 타입/린트/테스트/빌드 통합 확인
---

# Verification Loop Skill

Boris Cherny가 강조하는 **검증 피드백 루프**를 자동화하는 스킬입니다.

## 핵심 원칙

> "검증 피드백 루프는 Claude Code 워크플로우에서 가장 중요한 요소입니다."
> — Boris Cherny

## 자동 검증 시점

### 필수 검증 (반드시 실행)
| 시점 | 검증 | 검증 항목 |
|------|------|----------|
| 기능 구현 완료 | 이 스킬의 Level 2 실행 | 타입, 린트, 테스트, 빌드 |
| PR 생성 전 | `/check-health` | 전체 상태 점검 |
| 리팩토링 후 | 이 스킬의 Level 2 실행 | 변경 영향 확인 |

### 권장 검증 (상황별)
| 시점 | 검증 | 목적 |
|------|------|------|
| 커버리지 확인 | `/test-coverage` | 테스트 충분성 |

## 검증 체크리스트

### Level 1: Quick Check (1분 이내)
```bash
npm run type-check
```
- 타입 에러 0개 확인
- 빠른 피드백 루프

### Level 2: Standard Check (2-3분)

기능 구현 완료 또는 리팩토링 후 실행하는 종합 검증입니다.

```bash
# 1. TypeScript 타입 체크
npm run type-check
# 통과 기준: 타입 에러 0개

# 2. ESLint 린트 검사
npm run lint
# 통과 기준: 린트 에러 0개 (경고는 허용)

# 3. Jest 테스트 실행
npm test -- --coverage --coverageReporters="text-summary"
# 통과 기준: 모든 테스트 통과, Stmt ≥75%, Fn ≥70%, Br ≥60%

# 4. 개발 빌드 검증
npm run build
# 통과 기준: 빌드 성공
```

#### Level 2 결과 리포트 형식
```
## 검증 결과 요약

| 항목 | 상태 | 세부사항 |
|------|------|----------|
| TypeScript | ✅/❌ | 에러 X개 |
| ESLint | ✅/❌ | 에러 X개, 경고 Y개 |
| 테스트 | ✅/❌ | X개 통과, Y개 실패 |
| 커버리지 | ✅/❌ | Stmt X%, Fn Y%, Br Z% |
| 빌드 | ✅/❌ | 성공/실패 |

**전체 상태**: ✅ 통과 / ❌ 실패
```

#### Level 2 실패 시 조치
1. **TypeScript 에러**: 타입 정의 수정, `any` 대신 `unknown` 사용
2. **ESLint 에러**: `npm run lint -- --fix` 시도 후 수동 수정
3. **테스트 실패**: 예상값 vs 실제값 비교, 코드 또는 테스트 수정
4. **빌드 실패**: 의존성 확인 (`npm install`), 캐시 정리 (`npm run clean`)

### Level 3: Full Check (5분 이상)
```bash
npm run type-check
npm run lint
npm test -- --coverage
npm run build:development
```
- 전체 검증
- PR 생성 전 필수

## 검증 기준

### TypeScript
| 기준 | 상태 |
|------|------|
| 타입 에러 0개 | 필수 |
| `any` 사용 금지 | 필수 |
| strict mode 활성화 | 필수 |

### ESLint
| 기준 | 상태 |
|------|------|
| 에러 0개 | 필수 |
| 경고 10개 미만 | 권장 |

### 테스트 커버리지
| 지표 | 목표 |
|------|------|
| Statements | ≥75% |
| Functions | ≥70% |
| Branches | ≥60% |

### 빌드
| 기준 | 상태 |
|------|------|
| 빌드 성공 | 필수 |
| 번들 크기 경고 없음 | 권장 |

## 자동화 설정

### PostToolUse 훅 (선택사항)
```json
{
  "event": "PostToolUse",
  "hooks": [{
    "matcher": "Edit|Write",
    "commands": ["npm run type-check 2>&1 | head -5"]
  }]
}
```

## 실패 시 대응

### 우선순위
1. **TypeScript 에러**: 즉시 수정 (블로커)
2. **테스트 실패**: 코드 또는 테스트 수정
3. **린트 에러**: `npm run lint -- --fix` 시도
4. **커버리지 미달**: 테스트 추가

### 수정 후 재검증
```bash
# 수정 후 반드시 재검증
npm run type-check && npm test
```

## 팀 협업 패턴

### 커밋 전 검증
```bash
# 모든 팀원이 커밋 전 Level 2 검증 실행
/verification-loop
```

### PR 리뷰 기준
- [ ] TypeScript 에러 없음
- [ ] ESLint 에러 없음
- [ ] 모든 테스트 통과
- [ ] 커버리지 목표 충족
- [ ] 빌드 성공

## 관련 리소스

- [/check-health 커맨드](../../commands/check-health.md)
- [검증 패턴 레퍼런스](references/verification-patterns.md) — 패턴별 예제 및 시나리오
