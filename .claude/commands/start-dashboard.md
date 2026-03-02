---
name: start-dashboard
description: React 대시보드 개발 서버 실행 워크플로우
---

# Start Dashboard

React 대시보드 개발 서버를 시작하는 워크플로우입니다.

## 워크플로우

### 1. 기존 프로세스 확인

이미 실행 중인 대시보드 프로세스가 있는지 확인합니다.

```bash
lsof -i :5173 2>/dev/null || echo "PORT_FREE"
```

- 포트가 사용 중이면 사용자에게 알리고 재시작 여부를 확인합니다.
- 포트가 비어있으면 다음 단계로 진행합니다.

### 2. 의존성 확인

`node_modules` 디렉토리가 존재하는지, `package.json`과 동기화되었는지 확인합니다.

```bash
cd src/dashboard && ls node_modules/.package-lock.json 2>/dev/null || echo "NEED_INSTALL"
```

- `NEED_INSTALL`이면 `npm install`을 실행합니다.
- 이미 설치되어 있으면 건너뜁니다.

### 3. 타입 체크 (선택)

빠른 타입 체크로 빌드 오류를 사전에 감지합니다.

```bash
cd src/dashboard && npx tsc --noEmit 2>&1 | tail -5
```

- 타입 에러가 있으면 사용자에게 보고하고 계속 진행할지 확인합니다.
- 에러가 없으면 다음 단계로 진행합니다.

### 4. 개발 서버 시작

Vite 개발 서버를 백그라운드로 실행합니다.

```bash
cd src/dashboard && npm run dev
```

- 백그라운드로 실행하여 터미널을 차단하지 않도록 합니다.
- 실행 후 http://localhost:5173 접속 가능 여부를 확인합니다.

### 5. 실행 확인

서버가 정상적으로 시작되었는지 확인합니다.

```bash
sleep 3 && curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ 2>/dev/null || echo "NOT_READY"
```

## 서비스 정보

| 항목 | 값 |
|------|-----|
| URL | http://localhost:5173 |
| 프레임워크 | React 18 + Vite 6 |
| 스타일링 | Tailwind CSS 3.4 |
| 상태관리 | Zustand 5.0 |
| 언어 | TypeScript 5.6+ |

## 유용한 명령어

```bash
# 로그 확인
tail -f logs/dashboard.log

# 중지
pkill -f "vite.*5173"

# 린트
cd src/dashboard && npm run lint

# 테스트
cd src/dashboard && npm test
```

## 트러블슈팅

- **포트 충돌**: `lsof -i :5173` 으로 확인 후 `kill -9 <PID>`
- **모듈 에러**: `rm -rf src/dashboard/node_modules && cd src/dashboard && npm install`
- **HMR 불안정**: Vite 캐시 삭제 `rm -rf src/dashboard/node_modules/.vite`
