# AOS Backup System Removal Plan

> **For Hermes:** Execute in an Orca-managed dedicated worktree. Do not merge or push without independent verification.

**Goal:** Remove AOS's local and scheduled database-backup generation, delete local AOS backup artifacts, and leave the repository documentation consistent with the new no-built-in-backup policy.

**Architecture:** Disable every local generation path (macOS launchd, manual shell scripts, and pre-shutdown hook) and remove the GitHub Actions backup workflow. Remove the obsolete restore helper because its only data source is the deleted local backup set. Update operator documentation to direct operators to their infrastructure/provider-native backup policy rather than a nonexistent AOS command.

**Tech Stack:** Bash, macOS launchd, GitHub Actions YAML, Markdown, git worktree.

---

## Scope and acceptance criteria

- In scope: AOS repository backup/restore automation and AOS-local backup artifacts under `infra/backups/`, legacy root backup artifacts under `infra/`, and `src/backend/backups/db/`.
- In scope: the installed `~/Library/LaunchAgents/com.aos.db-backup.plist` and its loaded launchd service.
- In scope: documentation references that instruct users to install/run AOS backup automation.
- Out of scope: other projects' backup directories, shared-infra database volumes, GitHub/S3/GCS historical objects, and unrelated `.claude` configuration backups.
- No `docker compose down -v`, volume deletion, database restart, remote push, or external publication.
- Verification must prove: no AOS backup generator remains in tracked source; `stop-all.sh` no longer creates pre-shutdown backups; GitHub workflow is absent; launchd service and installed plist are absent; local AOS backup paths are absent; docs do not instruct use of removed scripts; shell/YAML/Markdown checks and relevant tests pass.

## Implementation tasks

1. Remove tracked AOS backup generators and obsolete restore helper:
   - `infra/scripts/backup-all.sh`
   - `infra/scripts/backup-db.sh`
   - `infra/scripts/restore-all.sh`
   - `infra/scripts/setup-auto-backup.sh`
   - `infra/scripts/com.aos.db-backup.plist`
   - `.github/workflows/backup.yml`
2. Remove the automatic pre-shutdown backup block from `infra/scripts/stop-all.sh` while preserving normal service shutdown behavior.
3. Update `.gitignore`, README/deployment/recovery/architecture docs only where they describe this removed AOS backup system; retain generic third-party/config backup documentation when it is unrelated.
4. Run focused static checks and repository tests appropriate to touched shell/docs/workflow files. Do not run destructive infrastructure commands.
5. Report changed files and verification output; stop before merge/push.
