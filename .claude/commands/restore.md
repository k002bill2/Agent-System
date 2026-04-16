---
name: restore
description: AOS 전체 서비스 복원 (Postgres + Redis + Qdrant)
disable-model-invocation: true
---

# AOS Full Restore

백업 디렉토리에서 Postgres, Redis, Qdrant를 한번에 복원합니다.

## 실행

```bash
# 최신 백업으로 복원
./infra/scripts/restore-all.sh latest

# 특정 시점 백업으로 복원
./infra/scripts/restore-all.sh 20260416_030205
```

## 옵션

| 옵션 | 설명 |
|------|------|
| `latest` | 가장 최근 백업으로 복원 |
| `--skip-redis` | Redis 복원 건너뛰기 |
| `--skip-qdrant` | Qdrant 복원 건너뛰기 |
| `--dry-run` | 복원 계획만 표시 (실행 안 함) |
| `-y` | 확인 프롬프트 건너뛰기 |

## 복원 전 확인

```bash
# 사용 가능한 백업 목록 확인
./infra/scripts/restore-all.sh

# 복원 계획 미리보기
./infra/scripts/restore-all.sh latest --dry-run
```

## 주의사항

- 복원은 현재 데이터를 **덮어씁니다**
- PostgreSQL: `pg_restore --clean --if-exists` 사용
- Redis: SHUTDOWN → RDB 교체 → 재시작
- Qdrant: 스냅샷 업로드로 교체
