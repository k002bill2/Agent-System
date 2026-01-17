# Verification Loop Skill

Boris Cherny가 강조하는 **검증 피드백 루프**를 자동화하는 스킬입니다.

## 핵심 원칙

> "검증 피드백 루프는 Claude Code 워크플로우에서 가장 중요한 요소입니다."
> — Boris Cherny

## 자동 검증 시점

### 필수 검증 (반드시 실행)
| 시점 | 커맨드 | 검증 항목 |
|------|--------|----------|
| 기능 구현 완료 | `/verify-app` | 타입, 린트, 테스트, 빌드 |
| PR 생성 전 | `/check-health` | 전체 상태 점검 |
| 리팩토링 후 | `/verify-app` | 변경 영향 확인 |

### 권장 검증 (상황별)
| 시점 | 커맨드 | 목적 |
|------|--------|------|
| 복잡한 코드 발견 | `/simplify-code` | 복잡도 분석 |
| 커버리지 확인 | `/test-coverage` | 테스트 충분성 |

## 검증 체크리스트

### Level 1: Quick Check (1분 이내)
```bash
npm run type-check
```
- 타입 에러 0개 확인
- 빠른 피드백 루프

### Level 2: Standard Check (2-3분)
```bash
npm run type-check
npm run lint
npm test
```
- 타입 + 린트 + 테스트
- 기능 구현 완료 시

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

### background-verifier 에이전트
복잡한 작업 완료 후 백그라운드에서 자동 검증:
```
Task(subagent_type="background-verifier", run_in_background=true)
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
# 모든 팀원이 커밋 전 실행
/verify-app
```

### PR 리뷰 기준
- [ ] TypeScript 에러 없음
- [ ] ESLint 에러 없음
- [ ] 모든 테스트 통과
- [ ] 커버리지 목표 충족
- [ ] 빌드 성공

## 관련 리소스

- [background-verifier 에이전트](../../agents/background-verifier.md)
- [/verify-app 커맨드](../../commands/verify-app.md)
- [/check-health 커맨드](../../commands/check-health.md)
