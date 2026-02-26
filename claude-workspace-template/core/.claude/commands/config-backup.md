---
description: Claude Code config backup/restore system — backup, restore, verify, diff, list
argument-hint: backup [name] | restore [name] | verify [name] | diff [b1] [b2] | list
---

# Claude Code Config Backup System

Backup, restore, verify, and compare your `.claude/` configuration.

**Storage location**: `.claude/backups/` (inside the project)

> **Note**: In sandbox mode, home directory access may be restricted.
> Uses project-local `.claude/backups/` by default. Recommend adding to `.gitignore`.

## Subcommand Routing

Parse `$ARGUMENTS` to determine the subcommand:

| Argument | Action |
|----------|--------|
| `backup [name]` | Create backup |
| `restore <name>` | Restore backup |
| `verify <name>` | Verify backup |
| `diff [b1] [b2]` | Compare backups |
| `list` | List backups |
| (none) | Show help |

---

## 1. backup [custom-name]

### 1.1 Prepare Environment

```bash
mkdir -p .claude/backups
```

### 1.2 Generate Backup Name

Format: `{YYYYMMDD}_{HHMMSS}_{project-name}[_custom-name]`

```bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PROJECT_NAME=$(basename "$(pwd)")
BACKUP_NAME="${TIMESTAMP}_${PROJECT_NAME}"
# If custom-name provided: "${TIMESTAMP}_${PROJECT_NAME}_${CUSTOM_NAME}"
```

### 1.3 Create Backup Directory

```bash
BACKUP_DIR=.claude/backups/${BACKUP_NAME}
mkdir -p "${BACKUP_DIR}"
```

### 1.4 Generate Manifest

Scan the `.claude/` directory and collect metadata:

```bash
COMMANDS_COUNT=$(find .claude/commands -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
SKILLS_COUNT=$(find .claude/skills -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
AGENTS_COUNT=$(find .claude/agents -maxdepth 1 -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
HOOKS_COUNT=$(find .claude/hooks -name "*.js" 2>/dev/null | wc -l | tr -d ' ')
TOTAL_FILES=$(find .claude -type f 2>/dev/null | wc -l | tr -d ' ')
TOTAL_SIZE=$(du -sh .claude 2>/dev/null | cut -f1)

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
    "total_files": "{TOTAL_FILES}",
    "total_size": "{TOTAL_SIZE}",
    "commands_count": "{COMMANDS_COUNT}",
    "skills_count": "{SKILLS_COUNT}",
    "agents_count": "{AGENTS_COUNT}",
    "hooks_count": "{HOOKS_COUNT}"
  }
}
```

### 1.5 Create Archive

```bash
tar -czf "${BACKUP_DIR}/claude-config.tar.gz" -C "$(pwd)" .claude/
```

### 1.6 Generate Checksums

```bash
cd .claude && find . -type f -exec shasum -a 256 {} \; > "${BACKUP_DIR}/checksums.sha256" && cd ..
```

### 1.7 Generate Quick Reference

Write `quick-reference.txt`:

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

### 1.8 Output

```
Backup created: {BACKUP_NAME}
   Location: .claude/backups/{BACKUP_NAME}/
   Files: {TOTAL_FILES} | Size: {TOTAL_SIZE}
```

---

## 2. list

Display available backups.

```bash
ls -lt .claude/backups/ 2>/dev/null || echo "No backups found"
```

Read each backup's `backup-manifest.json` and display as a table:

```
Available Backups
---

| Backup Name                      | Date       | Files | Size  |
|----------------------------------|------------|-------|-------|
| 20260111_143022_myapp            | 2026-01-11 | 87    | 240KB |
| 20260110_091545_myapp_pre-update | 2026-01-10 | 85    | 235KB |

Total: 2 backups
```

---

## 3. verify <backup-name>

Verify backup integrity.

### 3.1 Check Backup Exists

```bash
BACKUP_DIR=.claude/backups/${BACKUP_NAME}
[ -d "${BACKUP_DIR}" ] || echo "Backup not found: ${BACKUP_NAME}"
```

### 3.2 Archive Integrity

```bash
tar -tzf "${BACKUP_DIR}/claude-config.tar.gz" > /dev/null 2>&1
echo "Archive integrity: $([[ $? -eq 0 ]] && echo 'PASSED' || echo 'FAILED')"
```

### 3.3 Checksum Validation

```bash
TEMP_DIR=$(mktemp -d)
tar -xzf "${BACKUP_DIR}/claude-config.tar.gz" -C "${TEMP_DIR}"
cd "${TEMP_DIR}/.claude"
shasum -a 256 -c "${BACKUP_DIR}/checksums.sha256"
CHECKSUM_RESULT=$?
cd - > /dev/null
rm -rf "${TEMP_DIR}"
echo "Checksum validation: $([[ ${CHECKSUM_RESULT} -eq 0 ]] && echo 'PASSED' || echo 'FAILED')"
```

### 3.4 Manifest Validation

Check required fields in `backup-manifest.json`:
- `version`, `created_at`, `project_name`, `backup_name`

### 3.5 Result Report

```
BACKUP VERIFICATION: {BACKUP_NAME}
---

Archive integrity: PASSED
Checksum validation: PASSED (87/87 files)
Manifest validation: PASSED

Statistics:
   - Total files: 87
   - Size: 240 KB
   - Created: 2026-01-11 14:30:22

VERIFICATION RESULT: VALID
```

---

## 4. restore <backup-name> [--dry-run] [--only <path>]

Restore from a backup.

### 4.1 Verify Backup

Run the `verify` workflow first.

### 4.2 Create Safety Backup

```bash
if [ -d ".claude" ]; then
  SAFETY_BACKUP=".claude.bak.$(date +%Y%m%d_%H%M%S)"
  cp -r .claude "${SAFETY_BACKUP}"
  echo "Safety backup created: ${SAFETY_BACKUP}"
fi
```

### 4.3 Dry-run Mode

With `--dry-run`, show what would change without applying:

```
DRY-RUN: Would restore from {BACKUP_NAME}

Changes:
- Replace: 87 files
- Preserve: settings.local.json

No changes made.
```

### 4.4 Selective Restore

With `--only` flag, restore specific path only:

```bash
tar -xzf "${BACKUP_DIR}/claude-config.tar.gz" -C "$(pwd)" .claude/commands/
```

### 4.5 Full Restore

```bash
# Preserve settings.local.json
if [ -f ".claude/settings.local.json" ]; then
  cp .claude/settings.local.json /tmp/settings.local.json.bak
fi

tar -xzf "${BACKUP_DIR}/claude-config.tar.gz" -C "$(pwd)"

# Restore settings.local.json
if [ -f "/tmp/settings.local.json.bak" ]; then
  cp /tmp/settings.local.json.bak .claude/settings.local.json
  rm /tmp/settings.local.json.bak
fi
```

### 4.6 Output

```
Restore completed from: {BACKUP_NAME}
   Files restored: 87
   Safety backup: {SAFETY_BACKUP}
   Preserved: settings.local.json
```

---

## 5. diff <backup1> [backup2]

Compare backups or a backup vs current config.

### 5.1 Determine Comparison Targets

- 1 argument: `backup1` vs current `.claude/`
- 2 arguments: `backup1` vs `backup2`

### 5.2 Extract File Lists

```bash
tar -tzf "${BACKUP_DIR}/claude-config.tar.gz" | sort > /tmp/backup_files.txt
find .claude -type f | sed 's|^\./||' | sort > /tmp/current_files.txt
```

### 5.3 Compute Differences

```bash
comm -13 /tmp/backup_files.txt /tmp/current_files.txt > /tmp/added.txt
comm -23 /tmp/backup_files.txt /tmp/current_files.txt > /tmp/removed.txt
comm -12 /tmp/backup_files.txt /tmp/current_files.txt > /tmp/common.txt
```

### 5.4 Output

```
DIFF: {BACKUP_NAME} vs Current
---

ADDED (3 files):
   + commands/new-command.md
   + skills/new-skill/SKILL.md

REMOVED (1 file):
   - skills/old-skill/SKILL.md

MODIFIED (5 files):
   ~ hooks.json
   ~ commands/verify-app.md

Summary:
   Added: 3 | Removed: 1 | Modified: 5 | Unchanged: 78
```

---

## Help (no arguments)

```
Claude Code Config Backup System
---

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
  /config-backup verify 20260111_143022_myapp
  /config-backup diff 20260111_143022_myapp
  /config-backup restore 20260111_143022_myapp --dry-run

Storage: .claude/backups/
```

---

## Error Handling

| Error | Handling |
|-------|----------|
| Backup directory missing | Auto-create |
| Duplicate backup name | Append counter (`_1`, `_2`) |
| No backups found | Show empty list message |
| Verification failed | Show specific failure details |
| Permission error | Display path and permission guidance |
