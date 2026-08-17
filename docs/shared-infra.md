# shared-infra 운영

AOS는 자체 DB 스택을 띄우지 않고 `~/Work/shared-infra`를 공유합니다 (ppt-maker, image-maker도 동일).
`dev.sh`/`start-all.sh`/`stop-all.sh`는 모두 shared-infra를 대상으로 동작합니다.

**절대 금지**: `docker compose down -v`, `docker volume rm shared-infra_*` — 모든 프로젝트 데이터 소실.

## 새 프로젝트를 shared-infra에 합치기

기존 DB를 보존하면서 새 프로젝트용 DB만 추가합니다.

```bash
cd ~/Work/shared-infra
./add-project.sh <db_name> <redis_db_number>
# 예: ./add-project.sh livemetro 3
```

스크립트가 `init-databases.sql` append + 실행 중인 `shared-postgres`에 idempotent SQL 적용. 기존 aos/elitedeck/image_maker 데이터는 건드리지 않음.

## 문제 해결 후 상태 검증 (read-only)

```bash
docker compose -f ~/Work/shared-infra/docker-compose.yml ps   # postgres·redis=Up(healthy), qdrant=Up(healthcheck 없음 — 아래 /healthz가 판정)
docker exec shared-postgres pg_isready -U postgres            # accepting connections
docker exec shared-postgres psql -U postgres -lqt             # 기존 DB(aos 등) 보존 확인
docker exec shared-redis redis-cli ping                       # PONG
curl -sf localhost:6333/healthz                               # Qdrant
```

백엔드 기동 중이면 `curl -sf localhost:8000/health`(종합: `/health/detailed`)로 연결성까지 확인.

## 관련 문서

- 배포/컨테이너 구성: `docs/deployment.md`
- 전체 아키텍처: `docs/architecture.md`
