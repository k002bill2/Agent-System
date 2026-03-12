---
name: deploy-with-tests
description: 테스트 검증 후 빌드/배포 실행.
disable-model-invocation: true
---

# Deploy with Tests

Backend(Python)과 Frontend(TypeScript) 모두 검증 후 배포합니다.
**단계를 절대 건너뛰지 마세요. 어떤 단계든 실패하면 계속하기 전에 멈추고 수정하세요.**

## 실행 단계

### 1. Backend 사전 검증

```bash
# 1. Python 테스트
cd src/backend && python -m pytest ../../tests/backend --tb=short -q
```

### 2. Frontend 사전 검증

순서대로 실행하고 모두 통과해야 다음 단계로 진행:

```bash
cd src/dashboard

# 1. TypeScript 타입 체크
npx tsc --noEmit

# 2. ESLint 검사
npm run lint

# 3. Vitest 테스트 (커버리지 포함)
npm test -- --coverage
```

### 3. 커버리지 확인

커버리지 임계값 확인:
- Statements: 75% 이상
- Functions: 70% 이상
- Branches: 60% 이상

**임계값 미달 시 배포 중단**

### 4. 빌드 프로파일 선택

사용자에게 빌드 프로파일 확인:
- `development`: 개발용 빌드
- `preview`: 테스트용 빌드
- `production`: 프로덕션 빌드

### 5. Vite 빌드 실행

```bash
# Preview 빌드 예시
npm run build

# Production 빌드 예시 (주의 필요)
npm run build
```

### 6. 빌드 상태 확인

빌드 완료 후 dist/ 디렉토리 확인 및 배포 준비 상태 점검.

## 출력 형식

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 DEPLOY WITH TESTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[1/5] Backend Tests (pytest)
✅ All tests passed

[2/5] Frontend Type Check
✅ No type errors

[3/5] Frontend Lint Check
✅ No lint errors

[4/5] Frontend Test & Coverage
✅ Tests passed
   Statements: 78.5% (✅ ≥75%)
   Functions: 72.1% (✅ ≥70%)
   Branches: 65.3% (✅ ≥60%)

[5/5] Vite Build
🔄 Building with profile: preview
📦 Build output: dist/

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 실패 시

```
❌ DEPLOY BLOCKED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step Failed: {단계}
Reason: {이유}

에러를 모두 수정한 후 재시도: /deploy-with-tests
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
