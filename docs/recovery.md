# 복구 절차 가이드

이 문서는 AOS 시스템의 장애 복구 및 데이터베이스 복원 절차를 설명합니다.

## 목차

1. [장애 대응 프로세스](#장애-대응-프로세스)
2. [데이터베이스 복원](#데이터베이스-복원)
3. [서비스 롤백](#서비스-롤백)
4. [장애 유형별 대응](#장애-유형별-대응)
5. [복구 후 검증](#복구-후-검증)

---

## 장애 대응 프로세스

### 1. 상황 파악

```bash
# 헬스체크 상태 확인
curl https://api.aos.example.com/health/detailed

# 로그 확인 (Railway)
railway logs --service backend --recent

# 로그 확인 (Render)
# 대시보드 → Service → Logs
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

## 데이터베이스 복원

### 백업 확인

```bash
# S3에서 백업 목록 확인
aws s3 ls s3://your-bucket/backups/

# 최신 백업 다운로드
aws s3 cp s3://your-bucket/backups/aos_backup_YYYYMMDD_HHMMSS.sql.gz ./

# 백업 무결성 확인
gunzip -t aos_backup_YYYYMMDD_HHMMSS.sql.gz
```

### Railway 데이터베이스 복원

```bash
# 1. 백업 파일 압축 해제
gunzip aos_backup_YYYYMMDD_HHMMSS.sql.gz

# 2. 새 데이터베이스로 복원 (기존 DB 보존)
railway connect postgres
CREATE DATABASE aos_restored;
\q

# 3. 복원 실행
PGPASSWORD=<password> psql \
  -h <host> -p <port> -U <user> \
  -d aos_restored \
  < aos_backup_YYYYMMDD_HHMMSS.sql

# 4. 데이터 확인
railway connect postgres
\c aos_restored
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM tasks;

# 5. 스왑 (신중히 실행)
ALTER DATABASE aos RENAME TO aos_old;
ALTER DATABASE aos_restored RENAME TO aos;
```

### Render 데이터베이스 복원

```bash
# 1. 연결 정보 확인
# Render 대시보드 → Database → Connect

# 2. 복원 실행
PGPASSWORD=<password> psql \
  -h <external-host> -p <port> -U <user> \
  -d <database> \
  < aos_backup_YYYYMMDD_HHMMSS.sql

# 3. 또는 Render Point-in-time Recovery 사용
# 대시보드 → Database → Backups → Restore
```

### 특정 시점 복구 (PITR)

Railway와 Render 모두 관리형 PostgreSQL에서 PITR 지원:

1. **Railway**: 대시보드 → Database → Backups
2. **Render**: 대시보드 → Database → Recovery

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

### Docker 이미지로 롤백

```bash
# 특정 버전 이미지 확인
docker pull ghcr.io/your-org/aos-backend:v1.0.0

# Railway 환경 변수로 이미지 지정
railway variables set RAILWAY_IMAGE=ghcr.io/your-org/aos-backend:v1.0.0
railway up --service backend
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
# 1. DB 상태 확인
railway status

# 2. 연결 정보 확인
railway variables

# 3. 네트워크 확인 (내부 vs 외부 호스트)
# Railway는 내부: postgres.railway.internal
# 외부: containers-us-west-xxx.railway.app

# 4. DB 재시작
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
redis-cli -u $REDIS_URL ping

# 2. 메모리 확인
redis-cli -u $REDIS_URL info memory

# 3. Redis 재시작
railway restart --service redis
```

### 3. LLM API 오류

**증상**:
```
RateLimitError: Rate limit exceeded
```

**대응**:
1. API 대시보드에서 할당량 확인
2. 대체 모델로 전환:
   ```bash
   railway variables set LLM_PROVIDER=anthropic
   railway variables set ANTHROPIC_API_KEY=<key>
   ```
3. 요청 제한 활성화

### 4. 메모리 부족 (OOM)

**증상**:
```
Container killed due to memory limit
```

**대응**:
1. 인스턴스 크기 업그레이드
2. 메모리 누수 확인:
   ```python
   # /health/detailed에서 memory_percent 확인
   curl https://api.aos.example.com/health/detailed | jq '.memory_percent'
   ```
3. 불필요한 서비스 비활성화

### 5. 디스크 용량 부족

**증상**:
```
No space left on device
```

**대응**:
```bash
# 1. 오래된 로그 정리
# Railway는 자동 관리됨

# 2. 임시 파일 정리
rm -rf /tmp/*

# 3. 오래된 백업 삭제
aws s3 rm s3://bucket/backups/ --recursive --exclude "*" --include "aos_backup_2023*"
```

---

## 복구 후 검증

### 체크리스트

- [ ] 헬스체크 통과 (`/health/ready` 200 응답)
- [ ] 로그인 기능 정상
- [ ] API 응답 시간 정상 (< 500ms)
- [ ] 데이터 무결성 확인
- [ ] 외부 연동 정상 (LLM, OAuth 등)

### 검증 스크립트

```bash
#!/bin/bash
API_URL="https://api.aos.example.com"

echo "=== 복구 검증 시작 ==="

# 1. 헬스체크
echo -n "Health check: "
curl -s "$API_URL/health/ready" && echo " OK" || echo " FAILED"

# 2. 상세 헬스체크
echo "Detailed health:"
curl -s "$API_URL/health/detailed" | jq '.'

# 3. API 응답 시간
echo -n "API latency: "
curl -o /dev/null -s -w "%{time_total}s\n" "$API_URL/health"

# 4. 데이터베이스 연결
echo -n "Database: "
curl -s "$API_URL/health/database" | jq -r '.status'

# 5. Redis 연결
echo -n "Redis: "
curl -s "$API_URL/health/redis" | jq -r '.status'

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

- [Railway Incident Response](https://docs.railway.app/reference/incidents)
- [PostgreSQL Backup and Restore](https://www.postgresql.org/docs/current/backup.html)
- [Site Reliability Engineering](https://sre.google/sre-book/table-of-contents/)
