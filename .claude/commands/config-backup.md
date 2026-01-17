---
description: Claude Code 설정 백업/복원 시스템 - backup, restore, verify, diff, list 지원
argument-hint: backup [name] | restore [name] | verify [name] | diff [b1] [b2] | list
---

# Claude Code Config Backup System

설정 백업/복원/검증/비교 시스템입니다.

**저장 위치**: `.claude/backups/` (프로젝트 내)

> **참고**: 샌드박스 모드에서는 홈 디렉토리(`.claude/backups/`) 접근이 제한될 수 있습니다.
> 프로젝트 내 `.claude/backups/`를 기본 사용하며, `.gitignore`에 추가 권장.

## 서브커맨드 분기

인자 `$ARGUMENTS`를 파싱하여 서브커맨드를 결정합니다:

| 인자 | 동작 |
|------|------|
| `backup [name]` | 백업 생성 |
| `restore <name>` | 백업 복원 |
| `verify <name>` | 백업 검증 |
| `diff [b1] [b2]` | 백업 비교 |
| `list` | 백업 목록 |
| (없음) | 도움말 표시 |

---

## 1. backup [custom-name]

### 1.1 환경 준비

```bash
# 백업 디렉토리 생성
mkdir -p .claude/backups
```

### 1.2 백업명 생성

포맷: `{YYYYMMDD}_{HHMMSS}_{project-name}[_custom-name]`

```bash
# 타임스탬프
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# 프로젝트명 (현재 디렉토리명)
PROJECT_NAME=$(basename "$(pwd)")

# 백업명 조합
BACKUP_NAME="${TIMESTAMP}_${PROJECT_NAME}"
# custom-name이 있으면: "${TIMESTAMP}_${PROJECT_NAME}_${CUSTOM_NAME}"
```

### 1.3 백업 디렉토리 생성

```bash
BACKUP_DIR=.claude/backups/${BACKUP_NAME}
mkdir -p "${BACKUP_DIR}"
```

### 1.4 Manifest 생성

`.claude/` 디렉토리를 스캔하여 메타데이터를 수집합니다:

```bash
# 파일 카운트
COMMANDS_COUNT=$(find .claude/commands -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
SKILLS_COUNT=$(find .claude/skills -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
AGENTS_COUNT=$(find .claude/agents -maxdepth 1 -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
HOOKS_COUNT=$(find .claude/hooks -name "*.js" 2>/dev/null | wc -l | tr -d ' ')
TOTAL_FILES=$(find .claude -type f 2>/dev/null | wc -l | tr -d ' ')
TOTAL_SIZE=$(du -sh .claude 2>/dev/null | cut -f1)

# Git 정보
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
```

Write `backup-manifest.json`:

```json
{
  "version": "1.0.0",
  "created_at": "{ISO_TIMESTAMP}",
  "project_name": "{PROJECT_NAME}",
  "project_path": "{PWD}",
  "backup_name": "{BACKUP_NAME}",
  "custom_label": "{CUSTOM_NAME or null}",
  "git_commit": "{GIT_COMMIT}",
  "git_branch": "{GIT_BRANCH}",
  "stats": {
    "total_files": {TOTAL_FILES},
    "total_size": "{TOTAL_SIZE}",
    "commands_count": {COMMANDS_COUNT},
    "skills_count": {SKILLS_COUNT},
    "agents_count": {AGENTS_COUNT},
    "hooks_count": {HOOKS_COUNT}
  }
}
```

### 1.5 아카이브 생성

```bash
tar -czf "${BACKUP_DIR}/claude-config.tar.gz" -C "$(pwd)" .claude/
```

### 1.6 체크섬 생성

```bash
cd .claude && find . -type f -exec shasum -a 256 {} \; > "${BACKUP_DIR}/checksums.sha256" && cd ..
```

### 1.7 Quick Reference 생성

`quick-reference.txt` 파일에 백업 요약을 작성합니다:

```
Claude Code Config Backup
========================
Backup: {BACKUP_NAME}
Created: {TIMESTAMP}
Project: {PROJECT_NAME}
Git: {GIT_BRANCH}@{GIT_COMMIT}

Contents:
- Commands: {COMMANDS_COUNT}
- Skills: {SKILLS_COUNT}
- Agents: {AGENTS_COUNT}
- Hooks: {HOOKS_COUNT}
- Total Files: {TOTAL_FILES}
- Size: {TOTAL_SIZE}
```

### 1.8 결과 출력

```
✅ Backup created: {BACKUP_NAME}
   Location: .claude/backups/{BACKUP_NAME}/
   Files: {TOTAL_FILES} | Size: {TOTAL_SIZE}
```

---

## 2. list

백업 목록을 표시합니다.

```bash
ls -lt .claude/backups/ 2>/dev/null || echo "No backups found"
```

각 백업의 `backup-manifest.json`을 읽어 테이블로 표시:

```
📦 Available Backups
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Backup Name                          | Date       | Files | Size  |
|--------------------------------------|------------|-------|-------|
| 20260111_143022_livemetro           | 2026-01-11 | 87    | 240KB |
| 20260110_091545_livemetro_pre-update | 2026-01-10 | 85    | 235KB |

Total: 2 backups
```

---

## 3. verify <backup-name>

백업 무결성을 검증합니다.

### 3.1 백업 존재 확인

```bash
BACKUP_DIR=.claude/backups/${BACKUP_NAME}
[ -d "${BACKUP_DIR}" ] || echo "Backup not found: ${BACKUP_NAME}"
```

### 3.2 아카이브 무결성

```bash
tar -tzf "${BACKUP_DIR}/claude-config.tar.gz" > /dev/null 2>&1
echo "Archive integrity: $([[ $? -eq 0 ]] && echo 'PASSED' || echo 'FAILED')"
```

### 3.3 체크섬 검증

```bash
# 임시 디렉토리에 압축 해제
TEMP_DIR=$(mktemp -d)
tar -xzf "${BACKUP_DIR}/claude-config.tar.gz" -C "${TEMP_DIR}"

# 체크섬 비교
cd "${TEMP_DIR}/.claude"
shasum -a 256 -c "${BACKUP_DIR}/checksums.sha256"
CHECKSUM_RESULT=$?
cd - > /dev/null
rm -rf "${TEMP_DIR}"

echo "Checksum validation: $([[ ${CHECKSUM_RESULT} -eq 0 ]] && echo 'PASSED' || echo 'FAILED')"
```

### 3.4 Manifest 검증

`backup-manifest.json`의 필수 필드 확인:
- `version`, `created_at`, `project_name`, `backup_name`

### 3.5 결과 리포트

```
📋 BACKUP VERIFICATION: {BACKUP_NAME}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Archive integrity: PASSED
✅ Checksum validation: PASSED (87/87 files)
✅ Manifest validation: PASSED

📊 Statistics:
   - Total files: 87
   - Size: 240 KB
   - Created: 2026-01-11 14:30:22

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFICATION RESULT: ✅ VALID
```

---

## 4. restore <backup-name> [--dry-run] [--only <path>]

백업을 복원합니다.

### 4.1 백업 검증

먼저 `verify` 워크플로우를 실행합니다.

### 4.2 안전 백업 생성

```bash
# 현재 설정 백업
if [ -d ".claude" ]; then
  SAFETY_BACKUP=".claude.bak.$(date +%Y%m%d_%H%M%S)"
  cp -r .claude "${SAFETY_BACKUP}"
  echo "Safety backup created: ${SAFETY_BACKUP}"
fi
```

### 4.3 Dry-run 모드

`--dry-run` 플래그가 있으면 실제 복원 없이 변경 사항만 표시:

```
🔍 DRY-RUN: Would restore from {BACKUP_NAME}

Changes:
- Replace: 87 files
- Preserve: settings.local.json

No changes made.
```

### 4.4 선택적 복원

`--only` 플래그로 특정 경로만 복원:

```bash
# 예: --only commands
tar -xzf "${BACKUP_DIR}/claude-config.tar.gz" -C "$(pwd)" .claude/commands/
```

### 4.5 전체 복원

```bash
# settings.local.json 보존
if [ -f ".claude/settings.local.json" ]; then
  cp .claude/settings.local.json /tmp/settings.local.json.bak
fi

# 복원
tar -xzf "${BACKUP_DIR}/claude-config.tar.gz" -C "$(pwd)"

# settings.local.json 복구
if [ -f "/tmp/settings.local.json.bak" ]; then
  cp /tmp/settings.local.json.bak .claude/settings.local.json
  rm /tmp/settings.local.json.bak
fi
```

### 4.6 결과

```
✅ Restore completed from: {BACKUP_NAME}
   Files restored: 87
   Safety backup: {SAFETY_BACKUP}
   Preserved: settings.local.json
```

---

## 5. diff <backup1> [backup2]

백업 간 또는 백업과 현재 설정을 비교합니다.

### 5.1 비교 대상 결정

- 인자 1개: `backup1` vs 현재 `.claude/`
- 인자 2개: `backup1` vs `backup2`

### 5.2 파일 목록 추출

```bash
# 백업의 파일 목록
tar -tzf "${BACKUP_DIR}/claude-config.tar.gz" | sort > /tmp/backup_files.txt

# 현재 파일 목록 (또는 다른 백업)
find .claude -type f | sed 's|^\./||' | sort > /tmp/current_files.txt
```

### 5.3 차이점 계산

```bash
# 추가된 파일 (현재에만 존재)
comm -13 /tmp/backup_files.txt /tmp/current_files.txt > /tmp/added.txt

# 삭제된 파일 (백업에만 존재)
comm -23 /tmp/backup_files.txt /tmp/current_files.txt > /tmp/removed.txt

# 공통 파일 (수정 여부 확인 필요)
comm -12 /tmp/backup_files.txt /tmp/current_files.txt > /tmp/common.txt
```

### 5.4 결과 출력

```
📊 DIFF: {BACKUP_NAME} ⟷ Current
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📁 ADDED (3 files):
   + commands/run-eval.md
   + skills/agent-improvement/SKILL.md
   + evals/tasks/ui-component-creation.yaml

📁 REMOVED (1 file):
   - skills/deprecated-skill/SKILL.md

📁 MODIFIED (5 files):
   ~ hooks.json
   ~ commands/verify-app.md
   ~ agents/lead-orchestrator.md

📊 Summary:
   Added: 3 | Removed: 1 | Modified: 5 | Unchanged: 78

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 도움말 (인자 없음)

```
📦 Claude Code Config Backup System
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Usage: /config-backup <command> [options]

Commands:
  backup [name]     Create a new backup (optional custom name)
  restore <name>    Restore from a backup
  verify <name>     Verify backup integrity
  diff [b1] [b2]    Compare backups or backup vs current
  list              List all available backups

Options:
  --dry-run         Preview changes without applying (restore, diff)
  --only <path>     Restore specific path only (restore)

Examples:
  /config-backup backup pre-refactor
  /config-backup list
  /config-backup verify 20260111_143022_livemetro
  /config-backup diff 20260111_143022_livemetro
  /config-backup restore 20260111_143022_livemetro --dry-run

Storage: .claude/backups/
```

---

## 에러 처리

| 에러 | 처리 |
|------|------|
| 백업 디렉토리 없음 | 자동 생성 |
| 백업명 중복 | 카운터 추가 (`_1`, `_2`) |
| 백업 없음 | 사용 가능한 백업 목록 표시 |
| 검증 실패 | 구체적 실패 항목 표시 |
| 권한 오류 | 경로 및 권한 안내 |
