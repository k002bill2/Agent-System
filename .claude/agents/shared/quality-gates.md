---
name: quality-gates
description: Shared quality gates for all specialist agents
---

# Quality Gates

All agents MUST pass these quality gates before marking work as complete.

## Automated Checks

```bash
# Run all quality checks
npm run type-check   # TypeScript strict mode
npm run lint         # ESLint zero errors
npm test -- --coverage  # Test coverage
```

## 0. Ethical Quality Gate (Layer 1) - FIRST

기술적 품질 검사 **전에** 윤리적 검증을 먼저 수행합니다. 이 게이트를 통과하지 못하면 다른 검사를 진행하지 않습니다.

### Pre-Execution Ethical Checklist

| 체크 항목 | 검증 방법 | 실패시 |
|----------|----------|--------|
| 사용자 데이터 처리 | 개인정보 최소 수집 원칙 확인 | **BLOCK** |
| API 호출 빈도 | Seoul API 30초 제한 준수 | **BLOCK** |
| 리소스 사용 | 메모리/CPU 임계값 미초과 | WARN |
| 권한 범위 | 워크스페이스 내 작업만 | **BLOCK** |
| 롤백 가능성 | 변경 전 백업 존재 | **BLOCK** |
| 투명성 | 모든 에러/경고 로깅 | **BLOCK** |

### Ethical Compliance Score

```
Score = (통과한 윤리 체크 / 전체 윤리 체크) × 100

- 100%: 진행 가능
- 80-99%: 경고 후 진행 (로그 필수)
- <80%: BLOCK + Primary 검토 필요
```

### Ethical Veto Trigger

다음 상황 감지시 **즉시 작업 중단**:
- [ ] 백업 없이 사용자 데이터 수정 시도
- [ ] API 키/토큰 하드코딩 시도
- [ ] 무한 루프 가능성 있는 코드
- [ ] 30초 미만 API 폴링 간격
- [ ] 워크스페이스 외부 파일 수정 시도

→ [ace-framework.md](./ace-framework.md)의 Ethical Veto Protocol 참조

---

## Quality Gate Requirements

### 1. TypeScript Strict Mode
- [ ] `npm run type-check` passes with zero errors
- [ ] No `any` types (use `unknown` if type is truly unknown)
- [ ] Explicit return types on exported functions
- [ ] Proper null/undefined handling with guards

### 2. ESLint Compliance
- [ ] `npm run lint` passes with zero errors
- [ ] No disabled ESLint rules without justification comment
- [ ] Consistent code style

### 3. Test Coverage Thresholds
| Metric | Minimum |
|--------|---------|
| Statements | 75% |
| Functions | 70% |
| Branches | 60% |
| Lines | 75% |

### 4. Security
- [ ] No hardcoded API keys or secrets
- [ ] No hardcoded Firebase credentials
- [ ] Sensitive data uses environment variables
- [ ] No console.log with sensitive information

### 5. React Native Specific
- [ ] `memo()` on expensive components
- [ ] `useCallback`/`useMemo` for stable references
- [ ] Accessibility labels on interactive elements
- [ ] Proper cleanup in useEffect return functions

### 6. Subscription Cleanup
```typescript
// REQUIRED pattern for all subscriptions
useEffect(() => {
  const unsubscribe = service.subscribe(callback);
  return () => unsubscribe(); // Cleanup!
}, []);
```

## Validation Commands

```bash
# Quick validation
npm run lint && npm run type-check

# Full validation (before PR)
npm run lint && npm run type-check && npm test -- --coverage
```

## Agent-Specific Gates

| Agent | Additional Requirements |
|-------|------------------------|
| mobile-ui-specialist | Accessibility labels, responsive design |
| backend-integration-specialist | API rate limits respected, cleanup functions |
| performance-optimizer | Metrics before/after, no memory leaks |
| test-automation-specialist | Coverage meets thresholds, no flaky tests |
| quality-validator | All gates verified, integration checked |

---

**Version**: 2.0 | **Last Updated**: 2025-01-10 | **Layer 1 Ethical Gate Added**
