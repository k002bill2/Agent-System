# CLAUDE.md

AOS (Agent Orchestration Service) - LangGraph 기반 멀티 에이전트 오케스트레이션 서비스.

## Quick Start

```bash
# 인프라 (Postgres, Redis, Qdrant) — shared-infra 공용 스택을 기동
cd infra/scripts && ./dev.sh

# Backend
cd src/backend && uv pip install -e . && uvicorn api.app:app --reload

# Dashboard
cd src/dashboard && npm install && npm run dev
```

Backend: `localhost:8000` | Dashboard: `localhost:5173` | 환경변수: @.env.example 참조

AOS는 자체 DB 스택을 띄우지 않고 `~/Work/shared-infra`를 공유합니다 (ppt-maker, image-maker도 동일). `dev.sh`/`start-all.sh`/`stop-all.sh`는 모두 shared-infra를 대상으로 동작합니다.

## 새 프로젝트를 shared-infra에 합치기

기존 DB를 보존하면서 새 프로젝트용 DB만 추가합니다.

```bash
cd ~/Work/shared-infra
./add-project.sh <db_name> <redis_db_number>
# 예: ./add-project.sh livemetro 3
```

스크립트가 `init-databases.sql` append + 실행 중인 `shared-postgres`에 idempotent SQL 적용. 기존 aos/elitedeck/image_maker 데이터는 건드리지 않음.

**절대 금지**: `docker compose down -v`, `docker volume rm shared-infra_*` — 모든 프로젝트 데이터 소실.

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
- `docker compose` 명령은 `~/Work/shared-infra/docker-compose.yml`을 대상. `infra/docker/docker-compose.yml`은 더 이상 DB 스택 소스가 아님 (빌드/배포 참조용)

## Compact 시 보존

현재 작업 파일 경로와 변경 의도, 실패한 검증 에러, `dev/active/` 진행 태스크, 미커밋 diff 요약, 합의한 설계 결정.
