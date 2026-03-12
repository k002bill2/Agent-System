---
name: start-all
description: AOS 전체 서비스 시작 (인프라 + Backend + Dashboard).
disable-model-invocation: true
---

# Start All Services

Agent Orchestration Service의 모든 서비스를 한번에 시작합니다.

## 실행

```bash
./infra/scripts/start-all.sh
```

## 시작되는 서비스

| 서비스 | URL | 설명 |
|--------|-----|------|
| PostgreSQL | localhost:5432 | 데이터베이스 |
| Redis | localhost:6379 | 캐시/메시지 큐 |
| Backend | http://localhost:8000 | FastAPI 서버 |
| Dashboard | http://localhost:5173 | React 대시보드 |

## 실행 후 확인

1. **API 상태 확인**
```bash
curl http://localhost:8000/api/health
```

2. **대시보드 접속**
- 브라우저에서 http://localhost:5173 열기

3. **로그 확인**
```bash
tail -f logs/backend.log    # 백엔드 로그
tail -f logs/dashboard.log  # 대시보드 로그
```

## 중지

```bash
./infra/scripts/stop-all.sh
```
