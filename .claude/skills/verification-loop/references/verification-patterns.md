# 검증 패턴 예시

## 패턴 1: 기능 구현 후 검증

### 시나리오
새로운 훅 `useAgentSearch`를 구현 완료한 상황

### 검증 흐름
```
1. useAgentSearch.ts 작성 완료
2. useAgentSearch.test.ts 테스트 작성
3. Level 2 검증 실행 (/verification-loop)
4. 결과 확인 및 수정
5. 커밋 준비
```

### 예시 출력
```
## 검증 결과 요약

| 항목 | 상태 | 세부사항 |
|------|------|----------|
| TypeScript | ✅ | 에러 0개 |
| ESLint | ✅ | 에러 0개, 경고 2개 |
| 테스트 | ✅ | 275개 테스트 모두 통과 |
| 커버리지 | ✅ | Stmt 92%, Fn 96%, Br 75% |
| 빌드 | ✅ | 빌드 성공 |

**전체 상태**: ✅ 통과
```

## 패턴 2: 리팩토링 후 검증

### 시나리오
`useNotifications.ts`를 리팩토링한 상황

### 검증 흐름
```
1. 리팩토링 적용
2. Level 2 검증 실행 (/verification-loop)
3. 기존 테스트 통과 확인
4. 회귀 테스트 추가 (필요 시)
```

### 주의사항
- 리팩토링은 기능 변경이 아님
- 기존 테스트가 모두 통과해야 함
- 실패 시 리팩토링 롤백 고려

## 패턴 3: 버그 수정 후 검증

### 시나리오
`AgentCard` 컴포넌트 버그 수정

### 검증 흐름
```
1. 버그 재현 테스트 작성 (실패 확인)
2. 버그 수정
3. 테스트 통과 확인
4. Level 2 검증 실행 (/verification-loop)
5. 관련 컴포넌트 영향 확인
```

### TDD 패턴
```typescript
// 1. 먼저 실패하는 테스트 작성
it('should handle empty arrival data', () => {
  const { getByText } = render(<AgentCard agents={[]} />);
  expect(getByText('도착 정보 없음')).toBeTruthy();
});

// 2. 테스트 통과하도록 수정
// 3. Level 2 검증으로 전체 확인
```

## 패턴 4: PR 생성 전 최종 검증

### 시나리오
기능 개발 완료 후 PR 생성

### 검증 흐름
```
1. /check-health (전체 상태 확인)
2. Level 3 검증 실행 (/verification-loop)
3. git diff 검토
4. PR 생성
```

### 체크리스트
- [ ] 모든 테스트 통과
- [ ] 커버리지 목표 충족
- [ ] 빌드 성공
- [ ] 불필요한 console.log 제거
- [ ] TODO 주석 정리

## 패턴 5: 실패 복구

### TypeScript 에러 (CWD: src/dashboard)
```bash
# 에러 위치 확인
npm run type-check 2>&1 | grep "error TS"

# 수정 후 재검증
npm run type-check
```

### 테스트 실패 (CWD: src/dashboard)
```bash
# 실패한 테스트만 재실행
npx vitest run 실패한테스트파일명

# 전체 재검증 (watch 모드 금지)
npm run test:run
```

### 커버리지 미달 (CWD: src/dashboard)
```bash
# 커버리지 상세 확인 (임계치 SSOT: vitest.config.ts)
npm run test:coverage
```

### 백엔드 실패 (CWD: src/backend)
```bash
# 린트/타입 재검증
uv run ruff check . && uv run mypy . --ignore-missing-imports

# 실패한 테스트만 재실행
uv run pytest ../../tests/backend -k "실패한테스트" --tb=short
```

## 패턴 6: CI/CD 연동

실제 CI 정의는 `.github/workflows/ci.yml`이 유일한 진실원이다 — 예시 YAML을 복제하지 않는다. CI는 7개 job(backend-lint / backend-typecheck / backend-test / frontend-lint / frontend-typecheck / frontend-test / frontend-build)으로 구성되며, verification-loop의 Level 2 트랙 명령이 각 job과 1:1 대응한다.

### 로컬과 동일한 검증
- CI와 로컬 검증 기준 일치
- verification-loop 스킬의 Level 2 = CI 검증
