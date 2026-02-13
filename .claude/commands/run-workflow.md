---
description: /run-workflow
---

# Run Workflow - 서버 실행

개발 서버를 시작합니다.

## 실행 단계

### 1. 의존성 확인

node_modules가 있는지 확인하고, 없으면 설치합니다.

```bash
if [ ! -d "node_modules" ]; then echo "📦 Installing dependencies..." && npm install; else echo "✅ Dependencies already installed"; fi
```

### 2. 개발 서버 실행

```bash
npm run dev
```

백그라운드로 실행하고 서버가 준비될 때까지 대기합니다.

## 출력 형식

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RUN WORKFLOW - 서버 실행
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[1/2] 의존성 확인
✅ Dependencies installed

[2/2] 개발 서버 실행
🚀 Dev server running

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 실패 시

```
❌ WORKFLOW FAILED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step Failed: {단계}
Reason: {이유}

에러를 수정한 후 재시도: /run-workflow
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 참고

- HMR(Hot Module Replacement) 활성화되어 코드 변경 시 자동 반영
- `Ctrl+C`로 서버 종료
