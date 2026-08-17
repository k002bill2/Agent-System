# 복구 절차 가이드

이 문서는 AOS 시스템의 장애 복구 및 데이터베이스 복원 절차를 설명합니다.

---

## ⚠️ 먼저: 환경을 고르고 변수를 설정하세요

AOS는 **두 가지 토폴로지**로 실행되며 컨테이너 이름·DB 유저·볼륨 접두사가 서로 다릅니다. 이 문서의 명령은 아래에서 설정한 변수를 사용하므로, **다른 무엇보다 먼저** 해당 블록을 실행하세요.

| 항목 | 로컬 개발 (기본) | Self-host 배포 |
|------|------------------|----------------|
| Compose 파일 | `~/Work/shared-infra/docker-compose.yml` | 레포 루트 `docker-compose.yml` |
| 기동 방법 | `infra/scripts/dev.sh` | `docker compose up -d --build` |
| PostgreSQL 컨테이너 | `shared-postgres` | `aos-postgres` |
| Redis 컨테이너 | `shared-redis` | `aos-redis` |
| Qdrant 컨테이너 | `shared-qdrant` | `aos-qdrant` |
| DB 유저 / DB 이름 | `postgres` / `aos` | `aos` / `aos` |
| 볼륨 접두사 | `shared-infra_` (디렉토리명) | `aos_` (compose `name: aos`) |
| 데이터 공유 범위 | **AOS·elitedeck·image_maker 공용** | AOS 전용 |

**둘 중 하나만** 실행하세요. 두 블록을 연달아 붙여넣으면 뒤의 값이 앞의 값을 덮어써 잘못된 환경을 겨냥합니다.

**A. 로컬 개발 (shared-infra)** — `infra/scripts/dev.sh`로 기동한 경우:

```bash
COMPOSE_DIR=~/Work/shared-infra; TOPOLOGY=local

# shared-infra compose 가 읽는 .env 를 먼저 반영한다 — QDRANT_REST_PORT 등이
# 오버라이드돼 있으면 셸에 불러오지 않는 한 기본 포트로 잘못 계산된다
[ -f "$COMPOSE_DIR/.env" ] && { set -a; . "$COMPOSE_DIR/.env"; set +a; }

PG=shared-postgres; RD=shared-redis; QD=shared-qdrant
PGUSER=postgres; PGDB=aos; VOLPREFIX=shared-infra
export CONTAINER_NAME="$PG" REDIS_CONTAINER="$RD" DB_USER="$PGUSER" DB_NAME="$PGDB"
export QDRANT_URL="http://localhost:${QDRANT_REST_PORT:-6333}"   # shared-infra 는 QDRANT_REST_PORT
echo "선택된 환경: $TOPOLOGY / $PG / $QDRANT_URL"
```

**B. Self-host 배포** — 레포 루트 `docker compose up -d`로 기동한 경우 (**레포 루트에서 실행**):

```bash
# compose 가 읽는 .env 를 먼저 반영한다 — POSTGRES_USER/POSTGRES_DB/QDRANT_PORT 는
# .env 로 오버라이드 가능하므로, 셸에 불러오지 않으면 기본값으로 잘못 계산된다
[ -f .env ] && { set -a; . ./.env; set +a; }

PG=aos-postgres; RD=aos-redis; QD=aos-qdrant
PGUSER="${POSTGRES_USER:-aos}"; PGDB="${POSTGRES_DB:-aos}"
VOLPREFIX=aos                            # 루트 compose 의 `name: aos` 가 볼륨 접두사
COMPOSE_DIR="$PWD"; TOPOLOGY=selfhost    # 절대경로로 고정 — 이후 cd 해도 유효
export CONTAINER_NAME="$PG" REDIS_CONTAINER="$RD" DB_USER="$PGUSER" DB_NAME="$PGDB"
export QDRANT_URL="http://localhost:${QDRANT_PORT:-6333}"   # self-host 는 QDRANT_PORT
echo "선택된 환경: $TOPOLOGY / $PG / $PGUSER@$PGDB / $QDRANT_URL / $COMPOSE_DIR"
```

> **`export` 가 필요한 이유:** `backup-all.sh`·`restore-all.sh`는 `PG`/`PGUSER`가 아니라 `CONTAINER_NAME`·`REDIS_CONTAINER`·`DB_USER`·`DB_NAME`을 읽습니다. 이 줄이 없으면 self-host 환경에서 두 스크립트가 shared-infra 기본값으로 되돌아가, 엉뚱한 인스턴스를 백업하거나 복원합니다.

**이 문서의 인라인 명령**은 설정을 건너뛰면 `PG: parameter null or not set`으로 즉시 실패합니다. 존재하지 않는 컨테이너를 조용히 겨냥하는 것보다 낫기 때문에 의도한 동작입니다.

> **단, 통합 스크립트는 fail-closed가 아닙니다.** `backup-all.sh`·`restore-all.sh`는 변수가 없으면 **shared-infra 기본값**(`shared-postgres`/`shared-redis`)으로 조용히 진행합니다 — launchd 자동 백업이 그 기본값으로 돌아야 하므로 의도된 설계입니다. 따라서 **self-host에서 이 두 스크립트를 쓸 때는 위 B 블록을 반드시 먼저 실행하세요.** 건너뛰면 self-host를 복구하려다 로컬 공유 인스턴스를 백업하거나 덮어씁니다. 두 스택을 한 호스트에서 함께 돌릴 때 특히 위험합니다. 실행 전 `echo "$CONTAINER_NAME"`으로 대상을 눈으로 확인하세요.

**백엔드/대시보드 프로세스는 토폴로지마다 다릅니다.** self-host에서는 `backend`·`dashboard`가 compose 서비스지만, 로컬 개발의 shared-infra compose에는 `postgres`·`redis`·`qdrant` 세 서비스뿐입니다. 로컬에서 백엔드를 재시작하려면 compose가 아니라 `uvicorn` 프로세스를 직접 다시 띄웁니다:

```bash
# 백엔드 재시작 (토폴로지 자동 분기)
if [ "${TOPOLOGY:?}" = "selfhost" ]; then
  (cd "$COMPOSE_DIR" && docker compose restart backend)
else
  # 로컬: uvicorn 프로세스를 중단(Ctrl-C)한 뒤 재기동
  echo "cd src/backend && uvicorn api.app:app --reload 를 다시 실행하세요"
fi
```

> **`docker compose`는 실행 위치가 곧 대상입니다.** 로컬 개발에서 `docker compose restart postgres`를 레포 루트에서 실행하면 shared-infra가 아니라 레포의 self-host 스택을 건드립니다. 반드시 `cd "$COMPOSE_DIR"` 후 실행하세요.

> **공유 인프라 경고.** 로컬 개발 스택은 elitedeck·image_maker와 데이터를 공유합니다. `docker compose down -v`와 `docker volume rm shared-infra_*`는 **세 프로젝트 데이터를 모두 영구 삭제**합니다. 복구 작업 중에도 절대 사용하지 마세요.

---

## 목차

1. [장애 대응 프로세스](#장애-대응-프로세스)
2. [자동 백업 설정](#자동-백업-설정)
3. [PostgreSQL 백업/복원](#postgresql-백업복원)
4. [Redis 백업/복원](#redis-백업복원)
5. [Qdrant 백업/복원](#qdrant-백업복원)
6. [서비스 롤백](#서비스-롤백)
7. [장애 유형별 대응](#장애-유형별-대응)
8. [DB 스키마 충돌 해결](#db-스키마-충돌-해결)
9. [복구 후 검증](#복구-후-검증)

---

## 장애 대응 프로세스

### 1. 상황 파악

```bash
# 로컬: 헬스체크 상태 확인
curl http://localhost:8000/health/detailed | jq '.'

# 배포 환경: 헬스체크 상태 확인
curl https://api.aos.example.com/health/detailed | jq '.'

# 로그 확인 (Railway)
railway logs --service backend --recent

# 백엔드 로그 (토폴로지 분기) — 로컬의 shared-infra compose 에는 backend 서비스가 없다
if [ "${TOPOLOGY:?}" = "selfhost" ]; then
  (cd "$COMPOSE_DIR" && docker compose logs -f backend --tail=100)
else
  echo "로컬: 백엔드는 compose 밖 uvicorn 프로세스입니다. 해당 터미널 출력을 확인하세요"
fi
```

### 2. 장애 분류

| 레벨 | 증상 | 대응 |
|------|------|------|
| P1 (Critical) | 서비스 완전 중단 | 즉시 롤백 |
| P2 (Major) | 핵심 기능 장애 | 1시간 내 대응 |
| P3 (Minor) | 부분 기능 저하 | 업무 시간 내 대응 |
| P4 (Low) | 경미한 이슈 | 다음 배포 시 수정 |

### 3. 커뮤니케이션

- Slack 채널에 장애 공지
- 예상 복구 시간 안내
- 복구 완료 후 사후 분석(Postmortem) 작성

---

## 자동 백업 설정

macOS `launchd` 기반으로 매일 자동 DB 백업을 실행합니다.

### 구성 요소

| 파일 | 역할 |
|------|------|
| `infra/scripts/backup-all.sh` | 통합 백업 (Postgres + Redis + Qdrant) |
| `infra/scripts/restore-all.sh` | 통합 복원 (한번에 전체 복원) |
| `infra/scripts/backup-db.sh` | PostgreSQL 단독 백업 (레거시) |
| `infra/scripts/com.aos.db-backup.plist` | launchd 스케줄 템플릿 |
| `infra/scripts/setup-auto-backup.sh` | 설치/제거/상태 관리 CLI |

### 설치

```bash
cd infra/scripts
./setup-auto-backup.sh install
```

설치 시 `com.aos.db-backup.plist` 템플릿의 `__PROJECT_ROOT__`, `__LOG_DIR__` 플레이스홀더가 실제 경로로 치환되어 `~/Library/LaunchAgents/`에 복사됩니다.

> **템플릿을 고쳤으면 반드시 다시 설치하세요.** launchd가 실행하는 것은 레포의 템플릿이 아니라 `~/Library/LaunchAgents/`의 **복사본**입니다. 템플릿만 수정하면 이미 설치된 에이전트는 옛 설정으로 계속 돕니다. `./setup-auto-backup.sh install`을 다시 실행하면 재생성 후 재적재됩니다. `./setup-auto-backup.sh status`가 설치본과 템플릿을 대조해 `Template: stale`로 알려줍니다.

### 관리 명령어

```bash
./setup-auto-backup.sh status     # 상태 확인 (설치 여부, 최신 백업, 총 백업 수)
./setup-auto-backup.sh run        # 즉시 백업 실행
./setup-auto-backup.sh uninstall  # 자동 백업 제거
```

### 수동 백업/복원

```bash
# 전체 백업 (Postgres + Redis + Qdrant)
./infra/scripts/backup-all.sh --verify

# 전체 복원 (최신 백업)
./infra/scripts/restore-all.sh latest

# 특정 시점 복원
./infra/scripts/restore-all.sh 20260416_030205

# 복원 미리보기 (실행 안 함)
./infra/scripts/restore-all.sh latest --dry-run
```

### 동작 방식

| 항목 | 값 |
|------|-----|
| 스케줄 | 매일 03:00 (launchd `StartCalendarInterval`) |
| 대상 | PostgreSQL + Redis + Qdrant (통합) |
| 검증 | `pg_restore --list`로 무결성 확인 (`--verify`) |
| 보관 기간 | 30일 (이후 자동 삭제) |
| 로그 | `infra/backups/logs/backup-stdout.log`, `backup-stderr.log` |

### 백업 디렉토리 구조

```
infra/backups/
├── 20260416_030205/          # 타임스탬프 디렉토리
│   ├── postgres.dump         # PostgreSQL (pg_dump custom format)
│   ├── redis.rdb             # Redis RDB snapshot
│   ├── qdrant.snapshot       # Qdrant full snapshot
│   └── manifest.json         # 메타데이터 (서비스별 상태)
├── latest -> 20260416_030205 # 최신 백업 심링크
└── logs/
    ├── backup-stdout.log
    └── backup-stderr.log
```

### 놓친 백업 실행

macOS `StartCalendarInterval`은 컴퓨터가 꺼져 있거나 잠자기 상태였던 스케줄을 깨어난 후 자동 실행합니다. 별도 설정 없이 놓친 백업이 복구됩니다.

### 환경 변수 (선택)

기본값의 정본(SSOT)은 `infra/scripts/backup-all.sh` 상단이며, 로컬 개발(shared-infra) 기준입니다:

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `CONTAINER_NAME` | `shared-postgres` | PostgreSQL 컨테이너 |
| `REDIS_CONTAINER` | `shared-redis` | Redis 컨테이너 |
| `DB_USER` | `postgres` | 데이터베이스 사용자 |
| `DB_NAME` | `aos` | 데이터베이스 이름 |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant 엔드포인트 |

> **plist에서 이 값들을 재정의하지 마세요.** launchd plist에 `CONTAINER_NAME` 등을 넣으면 스크립트 기본값을 가리고, 인프라 이관 후 그 값이 낡으면 백업이 조용히 실패합니다. 실제로 plist에 남아 있던 `aos-postgres` 오버라이드 때문에 PostgreSQL 백업이 보관 기간 30일 내내 건너뛰어졌습니다(Redis·Qdrant는 정상이라 작업은 "성공"으로 보였습니다). self-host 등 다른 토폴로지에서 백업하려면 plist를 고치지 말고 셸에서 변수를 지정해 `backup-all.sh`를 직접 실행하세요.

### 백업이 실제로 남았는지 확인 (매번)

작업 성공 여부가 아니라 **서비스별 상태**를 봐야 합니다. `backup-all.sh`는 건너뛴 서비스를 실패로 세지 않으므로(`SERVICES_FAIL`만 종료 코드에 반영), 서비스가 통째로 빠져도 작업은 **exit 0으로 끝납니다**:

```bash
jq '.services' infra/backups/latest/manifest.json
# 세 서비스 모두 "ok" 여야 합니다.
# postgres 는 누락 시 "missing", redis/qdrant 는 "skipped" 로 기록됩니다
# (backup-all.sh 의 manifest 생성부 참조). "ok" 가 아니면 그 서비스는 백업되지 않았습니다.

ls -la infra/backups/latest/   # postgres.dump 실존 확인
```

---

## PostgreSQL 백업/복원

### pg_dump를 이용한 백업

```bash
# Docker 환경에서 백업 (변수는 문서 상단 "환경을 고르고" 블록에서 설정)
docker exec "${PG:?}" pg_dump -U "${PGUSER:?}" -d "${PGDB:?}" -Fc > aos_backup_$(date +%Y%m%d_%H%M%S).dump

# 또는 SQL 형식 백업 (사람이 읽기 가능)
docker exec "${PG:?}" pg_dump -U "${PGUSER:?}" -d "${PGDB:?}" > aos_backup_$(date +%Y%m%d_%H%M%S).sql

# 원격 DB 백업
PGPASSWORD=<password> pg_dump -h <host> -p <port> -U <user> -d aos -Fc > aos_backup.dump

# 압축 백업
docker exec "${PG:?}" pg_dump -U "${PGUSER:?}" -d "${PGDB:?}" | gzip > aos_backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### pg_restore를 이용한 복원

```bash
# Custom format (.dump) 복원 - 기존 DB에 덮어쓰기
docker exec -i "${PG:?}" pg_restore -U "${PGUSER:?}" -d "${PGDB:?}" --clean --if-exists < aos_backup.dump

# SQL 형식 복원
docker exec -i "${PG:?}" psql -U "${PGUSER:?}" -d "${PGDB:?}" < aos_backup.sql

# 압축된 SQL 복원
gunzip -c aos_backup.sql.gz | docker exec -i "${PG:?}" psql -U "${PGUSER:?}" -d "${PGDB:?}"

# 원격 DB로 복원
PGPASSWORD=<password> pg_restore -h <host> -p <port> -U <user> -d aos --clean --if-exists aos_backup.dump
```

### S3 백업 관리

```bash
# S3에서 백업 목록 확인
aws s3 ls s3://your-bucket/backups/

# 최신 백업 다운로드
aws s3 cp s3://your-bucket/backups/aos_backup_YYYYMMDD_HHMMSS.dump ./

# 백업을 S3에 업로드
aws s3 cp aos_backup.dump s3://your-bucket/backups/aos_backup_$(date +%Y%m%d_%H%M%S).dump
```

### Railway/Render 데이터베이스 복원

```bash
# Railway: 새 DB로 복원 후 스왑
railway connect postgres
CREATE DATABASE aos_restored;
\q

PGPASSWORD=<password> pg_restore \
  -h <host> -p <port> -U <user> \
  -d aos_restored \
  aos_backup.dump

# 데이터 확인 후 스왑 (신중히 실행)
railway connect postgres
\c aos_restored
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM tasks;
\q

# Render: PITR (Point-in-time Recovery) 사용
# 대시보드 → Database → Recovery
```

---

## Redis 백업/복원

Redis는 AOF(Append Only File)와 RDB 스냅샷을 사용합니다. Docker Compose에서는 `--appendonly yes` 옵션으로 AOF가 활성화되어 있습니다.

### RDB 스냅샷 백업

```bash
# 현재 시점 RDB 스냅샷 생성
docker exec "${RD:?}" redis-cli BGSAVE

# 스냅샷 완료 대기
docker exec "${RD:?}" redis-cli LASTSAVE

# dump.rdb 파일 복사 (컨테이너 → 호스트)
docker cp "${RD:?}":/data/dump.rdb ./redis_backup_$(date +%Y%m%d_%H%M%S).rdb
```

### RDB 복원

> **🚨 로컬(shared-infra)에서는 조율 없이 실행하지 마세요.** RDB 파일은 **Redis 서버 전체**를 담습니다. `shared-redis`는 elitedeck·image_maker와 논리 DB를 공유하므로, 복원하면 **다른 프로젝트의 캐시·큐가 통째로 과거 시점으로 되돌아가거나 사라집니다**. `restore-all.sh latest`도 같은 경로를 탑니다. 공유 환경에서는 (1) 관련 프로젝트와 시점을 합의한 뒤 전체 인스턴스를 함께 복원하거나, (2) AOS 키만 선별 내보내기/복원하세요. 아래 절차는 그 조율이 끝났거나 self-host 전용 인스턴스일 때만 사용합니다.

```bash
# 1. Redis 컨테이너 중지 (compose 는 반드시 해당 환경 디렉토리에서)
(cd "${COMPOSE_DIR:?}" && docker compose stop redis)

# 2. 기존 데이터 백업
docker cp "${RD:?}":/data/dump.rdb ./redis_old_backup.rdb

# 3. 백업 파일을 컨테이너에 복사
docker cp redis_backup.rdb "${RD:?}":/data/dump.rdb

# 4. Redis 재시작
(cd "${COMPOSE_DIR:?}" && docker compose start redis)

# 5. 데이터 확인
docker exec "${RD:?}" redis-cli DBSIZE
```

### AOF 파일 복원

```bash
# AOF 파일은 /data/appendonlydir/ 에 저장됨
docker cp "${RD:?}":/data/appendonlydir ./redis_aof_backup/

# 복원 시
(cd "${COMPOSE_DIR:?}" && docker compose stop redis)
docker cp ./redis_aof_backup/. "${RD:?}":/data/appendonlydir/
(cd "${COMPOSE_DIR:?}" && docker compose start redis)
```

---

## Qdrant 백업/복원

Qdrant는 REST API를 통한 스냅샷 기능을 제공합니다.

### 전체 스냅샷 생성

```bash
# 전체 스냅샷 생성 (모든 컬렉션 포함)
curl -X POST "${QDRANT_URL:?}"/snapshots

# 응답 예시:
# {"result": {"name": "snapshot-2026-03-24-12-00-00.snapshot", ...}}
```

### 컬렉션별 스냅샷

```bash
# 특정 컬렉션 스냅샷 생성
curl -X POST "${QDRANT_URL:?}"/collections/{collection_name}/snapshots

# 스냅샷 목록 확인
curl "${QDRANT_URL:?}"/collections/{collection_name}/snapshots

# 스냅샷 다운로드
curl -o qdrant_backup.snapshot \
  "${QDRANT_URL:?}"/collections/{collection_name}/snapshots/{snapshot_name}
```

### 스냅샷 복원

```bash
# 스냅샷 파일 업로드로 컬렉션 복원
curl -X POST "${QDRANT_URL:?}"/collections/{collection_name}/snapshots/upload \
  -H 'Content-Type: multipart/form-data' \
  -F 'snapshot=@qdrant_backup.snapshot'

# 또는 URL에서 복원
curl -X PUT "${QDRANT_URL:?}"/collections/{collection_name}/snapshots/recover \
  -H 'Content-Type: application/json' \
  -d '{"location": "http://backup-server/qdrant_backup.snapshot"}'
```

### 전체 스냅샷 복원

```bash
# 전체 스냅샷 목록 확인
curl "${QDRANT_URL:?}"/snapshots

# 전체 스냅샷 다운로드
curl -o full_snapshot.snapshot "${QDRANT_URL:?}"/snapshots/{snapshot_name}

# 전체 복원 (Qdrant 재시작 필요)
# 1. Qdrant 중지
(cd "${COMPOSE_DIR:?}" && docker compose stop qdrant)

# 2. 스냅샷 파일을 스토리지에 복사
docker cp full_snapshot.snapshot "${QD:?}":/qdrant/storage/snapshots/

# 3. Qdrant 재시작 (자동 복원)
(cd "${COMPOSE_DIR:?}" && docker compose start qdrant)
```

### Docker 볼륨 직접 백업

```bash
# Qdrant 볼륨 데이터 직접 백업 (오프라인)
(cd "${COMPOSE_DIR:?}" && docker compose stop qdrant)
docker run --rm -v "${VOLPREFIX:?}_qdrant_data":/data -v $(pwd):/backup \
  alpine tar czf /backup/qdrant_volume_backup.tar.gz -C /data .
(cd "${COMPOSE_DIR:?}" && docker compose start qdrant)
```

#### 볼륨 복원

> **🚨 로컬 개발(shared-infra)에서는 이 절차를 쓰지 마세요.** 아래 복원은 `rm -rf /data/*`로 볼륨을 통째로 비웁니다. `shared-infra_qdrant_data`는 elitedeck·image_maker와 공유하므로 **다른 프로젝트의 벡터 데이터까지 삭제**됩니다. 공유 환경에서는 컬렉션 단위 스냅샷 복원(위 "스냅샷 복원" 절)을 쓰세요. 아래는 AOS 전용 볼륨을 쓰는 **self-host 환경에서만** 유효합니다.

```bash
# self-host 전용 — VOLPREFIX 가 AOS 전용 볼륨인지 반드시 확인
[ "${VOLPREFIX:?}" = "aos" ] || { echo "공유 볼륨에는 실행 금지"; exit 1; }

(cd "${COMPOSE_DIR:?}" && docker compose stop qdrant)
docker run --rm -v "${VOLPREFIX}_qdrant_data":/data -v $(pwd):/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/qdrant_volume_backup.tar.gz -C /data"
(cd "${COMPOSE_DIR:?}" && docker compose start qdrant)
```

---

## 서비스 롤백

### GitHub Actions로 롤백

```bash
# 프로덕션 롤백 (이전 버전으로)
gh workflow run deploy-production.yml \
  -f version=v1.0.0 \
  -f skip_tests=true
```

### Railway 직접 롤백

```bash
# 이전 배포로 즉시 롤백
railway rollback --service backend
railway rollback --service dashboard
```

### Render 직접 롤백

1. 대시보드 → Service → Deploys
2. 마지막 성공한 배포 찾기
3. "Rollback to this deploy" 클릭

### Docker Compose 롤백

> **self-host 전용.** `backend`·`dashboard`는 레포 루트 compose에만 정의된 서비스입니다. 로컬 개발에서는 두 프로세스를 compose 밖(uvicorn / vite)에서 직접 기동하므로 이 절차가 적용되지 않습니다. 아래 명령은 레포 루트에서 실행합니다.

```bash
# 특정 버전 이미지로 롤백
docker compose down backend dashboard
docker compose pull  # 또는 특정 태그 지정
docker compose up -d backend dashboard

# 이전 이미지 사용
docker compose up -d --no-build
```

---

## 장애 유형별 대응

### 1. 데이터베이스 연결 실패

**증상**:
```
sqlalchemy.exc.OperationalError: connection refused
```

**대응**:
```bash
# 1. DB 컨테이너 상태 확인 (compose 는 반드시 해당 환경 디렉토리에서)
(cd "${COMPOSE_DIR:?}" && docker compose ps postgres)
(cd "${COMPOSE_DIR:?}" && docker compose logs postgres --tail=20)

# 2. 연결 테스트
docker exec "${PG:?}" pg_isready -U "${PGUSER:?}" -d "${PGDB:?}"

# 3. DB 재시작
(cd "${COMPOSE_DIR:?}" && docker compose restart postgres)

# 4. Railway 환경
railway status
railway variables  # DATABASE_URL 확인
railway restart --service postgres
```

### 2. Redis 연결 실패

**증상**:
```
redis.exceptions.ConnectionError: Connection refused
```

**대응**:
```bash
# 1. Redis 상태 확인
docker exec "${RD:?}" redis-cli ping

# 2. 메모리 확인
docker exec "${RD:?}" redis-cli info memory

# 3. Redis 재시작
(cd "${COMPOSE_DIR:?}" && docker compose restart redis)
```

### 3. LLM API 오류

**증상**:
```
RateLimitError: Rate limit exceeded
```

**대응**:
1. API 대시보드에서 할당량 확인
2. 대체 Provider로 전환:
   ```bash
   # .env 수정
   LLM_PROVIDER=anthropic
   ANTHROPIC_API_KEY=<key>

   # Backend 재시작 — 문서 상단 "백엔드 재시작 (토폴로지 자동 분기)" 블록 사용
   ```
3. 요청 제한 활성화

### 4. 메모리 부족 (OOM)

**증상**:
```
Container killed due to memory limit
```

**대응**:
1. 인스턴스 크기 업그레이드
2. 메모리 사용량 확인:
   ```bash
   curl http://localhost:8000/health/detailed | jq '.memory_percent'
   docker stats --no-stream
   ```
3. 불필요한 서비스 비활성화

### 5. Qdrant 연결 실패

**증상**:
```
ConnectionError: Qdrant connection failed
```

**대응**:
```bash
# 1. Qdrant 상태 확인 (호스트에서)
curl "${QDRANT_URL:?}"/healthz

# 2. 컬렉션 목록 확인
curl "${QDRANT_URL:?}"/collections

# 3. Qdrant 재시작
(cd "${COMPOSE_DIR:?}" && docker compose restart qdrant)

# 참고: Qdrant는 healthcheck 없이 service_started로 시작됨
# 재시작 후 수 초 대기 필요
```

---

## DB 스키마 충돌 해결

DB 이전이나 대규모 스키마 변경 시 충돌이 발생할 수 있습니다.

### SQLAlchemy 테이블 자동 생성 충돌

AOS의 SQLAlchemy는 `create_all()`로 테이블을 자동 생성합니다. 기존 스키마와 충돌 시:

```bash
# 1. 현재 스키마 백업
docker exec "${PG:?}" pg_dump -U "${PGUSER:?}" -d "${PGDB:?}" --schema-only > schema_backup.sql

# 2. 데이터 백업 (필수!)
docker exec "${PG:?}" pg_dump -U "${PGUSER:?}" -d "${PGDB:?}" -Fc > data_backup.dump
```

### DROP SCHEMA 방법 (전체 초기화)

> **주의**: 모든 테이블과 데이터가 삭제됩니다. 반드시 백업 후 실행하세요.

```bash
# 1. DB 접속 (공유 환경이면 $PGDB 가 aos 인지 반드시 확인 — 다른 프로젝트 DB 삭제 방지)
docker exec -it "${PG:?}" psql -U "${PGUSER:?}" -d "${PGDB:?}"

# 2. public 스키마 전체 삭제 및 재생성
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
-- 접속 중인 롤에 부여한다. 로컬(shared-infra)에는 postgres 롤만 존재하고
-- self-host 에는 aos 롤이 존재하므로, 롤 이름을 literal 로 적으면 한쪽에서 실패한다.
GRANT ALL ON SCHEMA public TO CURRENT_USER;
GRANT ALL ON SCHEMA public TO public;
\q

# 3. Backend 재시작 (SQLAlchemy가 테이블 자동 재생성)
#    문서 상단 "백엔드 재시작 (토폴로지 자동 분기)" 블록을 사용한다

# 4. 필요 시 데이터 복원
docker exec -i "${PG:?}" pg_restore -U "${PGUSER:?}" -d "${PGDB:?}" --data-only data_backup.dump
```

### 특정 테이블만 재생성

```bash
docker exec -it "${PG:?}" psql -U "${PGUSER:?}" -d "${PGDB:?}"

# 특정 테이블 삭제 (CASCADE로 의존 관계도 함께)
DROP TABLE IF EXISTS <table_name> CASCADE;
\q

# Backend 재시작으로 자동 재생성
# 문서 상단 "백엔드 재시작 (토폴로지 자동 분기)" 블록을 사용한다
```

---

## 복구 후 검증

### 체크리스트

- [ ] 헬스체크 통과 (`/health` 200 응답)
- [ ] 준비 상태 확인 (`/health/ready` 200 응답)
- [ ] 로그인 기능 정상
- [ ] API 응답 시간 정상 (< 500ms)
- [ ] 데이터 무결성 확인
- [ ] 외부 연동 정상 (LLM, OAuth 등)

### 검증 스크립트

```bash
#!/bin/bash
API_URL="${1:-http://localhost:8000}"

echo "=== 복구 검증 시작 ==="

# 1. 기본 헬스체크
echo -n "Health check: "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health")
[ "$STATUS" = "200" ] && echo "OK ($STATUS)" || echo "FAILED ($STATUS)"

# 2. Readiness probe
echo -n "Readiness: "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health/ready")
[ "$STATUS" = "200" ] && echo "Ready ($STATUS)" || echo "Not Ready ($STATUS)"

# 3. 상세 헬스체크
echo "Detailed health:"
curl -s "$API_URL/health/detailed" | jq '.'

# 4. API 응답 시간
echo -n "API latency: "
curl -o /dev/null -s -w "%{time_total}s\n" "$API_URL/health"

# 5. DB 상태
echo -n "Database: "
curl -s "$API_URL/health/database" | jq -r '.status // "not available"'

# 6. Redis 상태
echo -n "Redis: "
curl -s "$API_URL/health/redis" | jq -r '.status // "not available"'

# 7. LLM 상태
echo -n "LLM: "
curl -s "$API_URL/health/llm" | jq -r '.status // "not available"'

echo "=== 검증 완료 ==="
```

### 사후 분석 (Postmortem)

복구 후 반드시 작성:

1. **타임라인**: 장애 발생부터 복구까지
2. **근본 원인**: 왜 발생했는지
3. **영향 범위**: 어떤 기능/사용자가 영향받았는지
4. **대응 조치**: 무엇을 했는지
5. **재발 방지**: 어떻게 예방할 것인지
6. **액션 아이템**: 구체적인 개선 작업

---

## 비상 연락처

| 역할 | 담당 | 연락처 |
|------|------|--------|
| 1차 대응 | DevOps | Slack: #aos-alerts |
| 2차 대응 | Backend Lead | - |
| 3차 대응 | Tech Lead | - |

---

## 참고 자료

- [PostgreSQL Backup and Restore](https://www.postgresql.org/docs/current/backup.html)
- [Redis Persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)
- [Qdrant Snapshots API](https://qdrant.tech/documentation/concepts/snapshots/)
- [Railway Documentation](https://docs.railway.app)
- [Render Documentation](https://render.com/docs)
- [Site Reliability Engineering](https://sre.google/sre-book/table-of-contents/)
