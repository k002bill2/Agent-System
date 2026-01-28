---
description: 테스트 검증 후 빌드/배포 실행
---

# Deploy with Tests

테스트와 타입 체크를 통과한 후에만 프로덕션 빌드를 실행합니다.

## 실행 단계

### 1. 사전 검증

순서대로 실행하고 모두 통과해야 다음 단계로 진행:

```bash
# 1. TypeScript 타입 체크
npm run type-check

# 2. ESLint 검사
npm run lint

# 3. Vitest 테스트 (커버리지 포함)
npm test -- --coverage
```

### 2. 커버리지 확인

커버리지 임계값 확인:
- Statements: 75% 이상
- Functions: 70% 이상
- Branches: 60% 이상

**임계값 미달 시 배포 중단**

### 3. 빌드 프로파일 선택

사용자에게 빌드 프로파일 확인:
- `development`: 개발용 빌드
- `preview`: 테스트용 빌드
- `production`: 프로덕션 빌드

### 4. Vite 빌드 실행

```bash
# Preview 빌드 예시
npm run build:preview

# Production 빌드 예시 (주의 필요)
npm run build:production
```

### 5. 빌드 상태 확인

빌드 완료 후 dist/ 디렉토리 확인 및 배포 준비 상태 점검.

## 출력 형식

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 DEPLOY WITH TESTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[1/4] Type Check
✅ No type errors

[2/4] Lint Check
✅ No lint errors

[3/4] Test & Coverage
✅ Tests passed
   Statements: 78.5% (✅ ≥75%)
   Functions: 72.1% (✅ ≥70%)
   Branches: 65.3% (✅ ≥60%)

[4/4] Vite Build
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

Fix and retry with: /deploy-with-tests
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
