---
name: backup
description: AOS 전체 서비스 백업 (Postgres + Redis + Qdrant)
disable-model-invocation: true
---

# AOS Full Backup

Postgres, Redis, Qdrant를 하나의 타임스탬프 디렉토리로 백업합니다.

## 실행

```bash
./infra/scripts/backup-all.sh --verify
```

## 옵션

| 옵션 | 설명 |
|------|------|
| `--verify` | 백업 후 무결성 검증 |
| `--skip-redis` | Redis 백업 건너뛰기 |
| `--skip-qdrant` | Qdrant 백업 건너뛰기 |
| `-r DAYS` | 보관 기간 (기본 30일) |

## 백업 위치

```
infra/backups/{timestamp}/
├── postgres.dump       # pg_dump custom format
├── redis.rdb           # RDB snapshot
├── qdrant.snapshot     # Full snapshot
└── manifest.json       # 메타데이터
```

## 자동 백업 설정

```bash
./infra/scripts/setup-auto-backup.sh install   # 매일 03:00 자동 실행
./infra/scripts/setup-auto-backup.sh status    # 상태 확인
```

## 복원

```bash
./infra/scripts/restore-all.sh latest          # 최신 백업으로 전체 복원
```
