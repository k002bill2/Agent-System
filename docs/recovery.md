# 복구 절차 가이드

이 문서는 AOS 시스템의 장애 복구 및 데이터베이스 복원 절차를 설명합니다.

## 목차

1. [장애 대응 프로세스](#장애-대응-프로세스)
2. [PostgreSQL 백업/복원](#postgresql-백업복원)
3. [Redis 백업/복원](#redis-백업복원)
4. [Qdrant 백업/복원](#qdrant-백업복원)
5. [서비스 롤백](#서비스-롤백)
6. [장애 유형별 대응](#장애-유형별-대응)
7. [DB 스키마 충돌 해결](#db-스키마-충돌-해결)
8. [복구 후 검증](#복구-후-검증)

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

# 로그 확인 (Docker Compose)
docker compose logs -f backend --tail=100
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

## PostgreSQL 백업/복원

### pg_dump를 이용한 백업

```bash
# 로컬 Docker 환경에서 백업
docker exec aos-postgres pg_dump -U aos -d aos -Fc > aos_backup_$(date +%Y%m%d_%H%M%S).dump

# 또는 SQL 형식 백업 (사람이 읽기 가능)
docker exec aos-postgres pg_dump -U aos -d aos > aos_backup_$(date +%Y%m%d_%H%M%S).sql

# 원격 DB 백업
PGPASSWORD=<password> pg_dump -h <host> -p <port> -U <user> -d aos -Fc > aos_backup.dump

# 압축 백업
docker exec aos-postgres pg_dump -U aos -d aos | gzip > aos_backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### pg_restore를 이용한 복원

```bash
# Custom format (.dump) 복원 - 기존 DB에 덮어쓰기
docker exec -i aos-postgres pg_restore -U aos -d aos --clean --if-exists < aos_backup.dump

# SQL 형식 복원
docker exec -i aos-postgres psql -U aos -d aos < aos_backup.sql

# 압축된 SQL 복원
gunzip -c aos_backup.sql.gz | docker exec -i aos-postgres psql -U aos -d aos

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
docker exec aos-redis redis-cli BGSAVE

# 스냅샷 완료 대기
docker exec aos-redis redis-cli LASTSAVE

# dump.rdb 파일 복사 (컨테이너 → 호스트)
docker cp aos-redis:/data/dump.rdb ./redis_backup_$(date +%Y%m%d_%H%M%S).rdb
```

### RDB 복원

```bash
# 1. Redis 컨테이너 중지
docker compose stop redis

# 2. 기존 데이터 백업
docker cp aos-redis:/data/dump.rdb ./redis_old_backup.rdb

# 3. 백업 파일을 컨테이너에 복사
docker cp redis_backup.rdb aos-redis:/data/dump.rdb

# 4. Redis 재시작
docker compose start redis

# 5. 데이터 확인
docker exec aos-redis redis-cli DBSIZE
```

### AOF 파일 복원

```bash
# AOF 파일은 /data/appendonlydir/ 에 저장됨
docker cp aos-redis:/data/appendonlydir ./redis_aof_backup/

# 복원 시
docker compose stop redis
docker cp ./redis_aof_backup/. aos-redis:/data/appendonlydir/
docker compose start redis
```

---

## Qdrant 백업/복원

Qdrant는 REST API를 통한 스냅샷 기능을 제공합니다.

### 전체 스냅샷 생성

```bash
# 전체 스냅샷 생성 (모든 컬렉션 포함)
curl -X POST http://localhost:6333/snapshots

# 응답 예시:
# {"result": {"name": "snapshot-2026-03-24-12-00-00.snapshot", ...}}
```

### 컬렉션별 스냅샷

```bash
# 특정 컬렉션 스냅샷 생성
curl -X POST http://localhost:6333/collections/{collection_name}/snapshots

# 스냅샷 목록 확인
curl http://localhost:6333/collections/{collection_name}/snapshots

# 스냅샷 다운로드
curl -o qdrant_backup.snapshot \
  http://localhost:6333/collections/{collection_name}/snapshots/{snapshot_name}
```

### 스냅샷 복원

```bash
# 스냅샷 파일 업로드로 컬렉션 복원
curl -X POST http://localhost:6333/collections/{collection_name}/snapshots/upload \
  -H 'Content-Type: multipart/form-data' \
  -F 'snapshot=@qdrant_backup.snapshot'

# 또는 URL에서 복원
curl -X PUT http://localhost:6333/collections/{collection_name}/snapshots/recover \
  -H 'Content-Type: application/json' \
  -d '{"location": "http://backup-server/qdrant_backup.snapshot"}'
```

### 전체 스냅샷 복원

```bash
# 전체 스냅샷 목록 확인
curl http://localhost:6333/snapshots

# 전체 스냅샷 다운로드
curl -o full_snapshot.snapshot http://localhost:6333/snapshots/{snapshot_name}

# 전체 복원 (Qdrant 재시작 필요)
# 1. Qdrant 중지
docker compose stop qdrant

# 2. 스냅샷 파일을 스토리지에 복사
docker cp full_snapshot.snapshot aos-qdrant:/qdrant/storage/snapshots/

# 3. Qdrant 재시작 (자동 복원)
docker compose start qdrant
```

### Docker 볼륨 직접 백업

```bash
# Qdrant 볼륨 데이터 직접 백업 (오프라인)
docker compose stop qdrant
docker run --rm -v agent-system_qdrant_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/qdrant_volume_backup.tar.gz -C /data .
docker compose start qdrant

# 볼륨 복원
docker compose stop qdrant
docker run --rm -v agent-system_qdrant_data:/data -v $(pwd):/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/qdrant_volume_backup.tar.gz -C /data"
docker compose start qdrant
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
# 1. DB 컨테이너 상태 확인
docker compose ps postgres
docker compose logs postgres --tail=20

# 2. 연결 테스트
docker exec aos-postgres pg_isready -U aos -d aos

# 3. DB 재시작
docker compose restart postgres

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
docker exec aos-redis redis-cli ping

# 2. 메모리 확인
docker exec aos-redis redis-cli info memory

# 3. Redis 재시작
docker compose restart redis
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

   # Backend 재시작
   docker compose restart backend
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
curl http://localhost:6333/healthz

# 2. 컬렉션 목록 확인
curl http://localhost:6333/collections

# 3. Qdrant 재시작
docker compose restart qdrant

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
docker exec aos-postgres pg_dump -U aos -d aos --schema-only > schema_backup.sql

# 2. 데이터 백업 (필수!)
docker exec aos-postgres pg_dump -U aos -d aos -Fc > data_backup.dump
```

### DROP SCHEMA 방법 (전체 초기화)

> **주의**: 모든 테이블과 데이터가 삭제됩니다. 반드시 백업 후 실행하세요.

```bash
# 1. DB 접속
docker exec -it aos-postgres psql -U aos -d aos

# 2. public 스키마 전체 삭제 및 재생성
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO aos;
GRANT ALL ON SCHEMA public TO public;
\q

# 3. Backend 재시작 (SQLAlchemy가 테이블 자동 재생성)
docker compose restart backend

# 4. 필요 시 데이터 복원
docker exec -i aos-postgres pg_restore -U aos -d aos --data-only data_backup.dump
```

### 특정 테이블만 재생성

```bash
docker exec -it aos-postgres psql -U aos -d aos

# 특정 테이블 삭제 (CASCADE로 의존 관계도 함께)
DROP TABLE IF EXISTS <table_name> CASCADE;
\q

# Backend 재시작으로 자동 재생성
docker compose restart backend
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
