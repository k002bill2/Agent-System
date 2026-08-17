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

**문제 해결 후 상태 검증 (read-only)**:

```bash
docker compose -f ~/Work/shared-infra/docker-compose.yml ps   # postgres·redis=Up(healthy), qdrant=Up(healthcheck 없음 — 아래 /healthz가 판정)
docker exec shared-postgres pg_isready -U postgres            # accepting connections
docker exec shared-postgres psql -U postgres -lqt             # 기존 DB(aos 등) 보존 확인
docker exec shared-redis redis-cli ping                       # PONG
curl -sf localhost:6333/healthz                               # Qdrant
```

백엔드 기동 중이면 `curl -sf localhost:8000/health`(종합: `/health/detailed`)로 연결성까지 확인.

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
- SQLAlchemy async session: 코드가 직접 생성할 때만(`async_session_factory()`) `async with`로 수명 관리. `Depends(get_db)`로 주입된 세션은 dependency가 수명·commit/rollback을 소유 — handler에서 재차 `async with`·수동 close 금지
- CORS 문제 발생 시 `.env`의 `CORS_ORIGINS` 확인
- `docker compose` 명령은 `~/Work/shared-infra/docker-compose.yml`을 대상. `infra/docker/docker-compose.yml`은 더 이상 DB 스택 소스가 아님 (빌드/배포 참조용)

## 하네스: AOS 기능 개발

**목표:** 풀스택 기능을 계획→빌드(백엔드∥프론트)→통합검증→테스트→리뷰→문서동기화까지 전문 에이전트 팀으로 자동 조율.

**트리거:** 풀스택/엔드투엔드 기능 개발·수정·부분 재실행 요청 시 `aos-feature-harness` 스킬을 사용하라. 단순 단일 파일 수정·질문은 직접 처리.

**변경 이력:** `docs/harness-changelog.md` (구성 이후 전체 변경·사유 기록 — 하네스 수정·감사 시에만 읽기. 새 항목도 그 파일에 추가)

## Compact 시 보존

현재 작업 파일 경로와 변경 의도, 실패한 검증 에러, `dev/active/` 진행 태스크, 미커밋 diff 요약, 합의한 설계 결정.
