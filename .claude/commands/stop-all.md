---
description: AOS 전체 서비스 중지
---

# Stop All Services

Agent Orchestration Service의 모든 서비스를 중지합니다.

## 실행

```bash
./infra/scripts/stop-all.sh
```

## 중지되는 서비스

- Dashboard (React)
- Backend (FastAPI)
- PostgreSQL (Docker)
- Redis (Docker)

## 개별 서비스 중지

특정 서비스만 중지하려면:

```bash
# 대시보드만 중지
pkill -f "vite.*5173"

# 백엔드만 중지
pkill -f "uvicorn.*8000"

# 인프라만 중지
cd infra/docker && docker-compose down
```
