# CLAUDE.md

AOS (Agent Orchestration Service) - LangGraph 기반 멀티 에이전트 오케스트레이션 서비스.

## Quick Start

```bash
# 인프라 (Postgres, Redis, Qdrant)
cd infra/scripts && ./dev.sh

# Backend
cd src/backend && uv pip install -e . && uvicorn api.app:app --reload

# Dashboard
cd src/dashboard && npm install && npm run dev
```

Backend: `localhost:8000` | Dashboard: `localhost:5173` | 환경변수: @.env.example 참조

## Testing

```bash
# Backend
cd src/backend && pytest ../../tests/backend

# Dashboard (Vitest)
cd src/dashboard && npm test

# 전체 검증 (tsc + lint + test + build)
/check-health
```

## Common Pitfalls

- Docker 포트 충돌 시 `.env`의 `PG_PORT`, `REDIS_PORT` 등으로 오버라이드
- Vite proxy 설정(`vite.config.ts`)이 `/api` → `localhost:8000`으로 프록시함
- Zustand store 테스트 시 각 테스트마다 store 리셋 필요 (격리)
- SQLAlchemy async session은 반드시 `async with` 패턴 사용 (수동 close 금지)
- CORS 문제 발생 시 `.env`의 `CORS_ORIGINS` 확인
- `docker compose` 명령은 항상 `-f infra/docker/docker-compose.yml` 경로 명시

## Compact 시 보존

현재 작업 파일 경로와 변경 의도, 실패한 검증 에러, `dev/active/` 진행 태스크, 미커밋 diff 요약, 합의한 설계 결정.
