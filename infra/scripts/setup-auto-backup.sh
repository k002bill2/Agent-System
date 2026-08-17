#!/bin/bash
# Auto Backup Setup — macOS launchd scheduler for daily DB backup
# Usage: ./setup-auto-backup.sh [install|uninstall|status]
#
# Installs a LaunchAgent that runs backup-db.sh daily at 03:00.
# Missed runs (e.g., laptop was asleep) execute on next wake.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

LABEL="com.aos.db-backup"
PLIST_SRC="$SCRIPT_DIR/com.aos.db-backup.plist"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$PROJECT_ROOT/infra/backups/logs"
# backup-all.sh writes one manifest entry per service (postgres, redis, qdrant).
EXPECTED_SERVICES=3

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

cmd_install() {
    log_info "Installing AOS auto-backup scheduler..."

    # Validate backup script exists
    if [[ ! -x "$SCRIPT_DIR/backup-db.sh" ]]; then
        log_error "backup-db.sh not found or not executable at $SCRIPT_DIR/"
        exit 1
    fi

    # Create log directory
    mkdir -p "$LOG_DIR"

    # Generate plist from template with actual paths
    sed \
        -e "s|__PROJECT_ROOT__|$PROJECT_ROOT|g" \
        -e "s|__LOG_DIR__|$LOG_DIR|g" \
        "$PLIST_SRC" > "$PLIST_DST"

    # Unload first if already loaded
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true

    # Load the agent
    launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"

    log_info "Installed: $PLIST_DST"
    log_info "Schedule: daily at 03:00"
    log_info "Logs: $LOG_DIR/"
    echo ""
    echo -e "${CYAN}Commands:${NC}"
    echo "  Status:    $0 status"
    echo "  Run now:   $0 run"
    echo "  Uninstall: $0 uninstall"
}

cmd_uninstall() {
    log_info "Uninstalling AOS auto-backup scheduler..."

    if launchctl print "gui/$(id -u)/$LABEL" &>/dev/null; then
        launchctl bootout "gui/$(id -u)/$LABEL"
        log_info "Unloaded LaunchAgent"
    fi

    if [[ -f "$PLIST_DST" ]]; then
        rm -f "$PLIST_DST"
        log_info "Removed: $PLIST_DST"
    else
        log_warn "Plist not found (already removed?)"
    fi

    log_info "Auto-backup disabled. Manual backup still available: ./backup-db.sh"
}

cmd_status() {
    echo -e "${CYAN}=== AOS Auto-Backup Status ===${NC}"
    echo ""

    # Check plist installed
    if [[ -f "$PLIST_DST" ]]; then
        echo -e "  Plist:     ${GREEN}installed${NC} ($PLIST_DST)"
    else
        echo -e "  Plist:     ${RED}not installed${NC}"
        echo ""
        echo "Run '$0 install' to set up auto-backup."
        return
    fi

    # Check agent loaded
    if launchctl print "gui/$(id -u)/$LABEL" &>/dev/null; then
        echo -e "  Agent:     ${GREEN}loaded${NC}"
    else
        echo -e "  Agent:     ${RED}not loaded${NC}"
    fi

    # Show schedule
    echo "  Schedule:  daily at 03:00"

    # Installed plist vs template — an agent installed before a template change keeps
    # running the old copy. A stale CONTAINER_NAME override once skipped every
    # PostgreSQL backup for the full retention window without failing the job.
    EXPECTED=$(sed -e "s|__PROJECT_ROOT__|$PROJECT_ROOT|g" -e "s|__LOG_DIR__|$LOG_DIR|g" "$PLIST_SRC")
    if [[ "$EXPECTED" != "$(cat "$PLIST_DST")" ]]; then
        echo -e "  Template:  ${RED}stale${NC} — installed plist differs from $PLIST_SRC"
        echo -e "             ${YELLOW}Run '$0 install' to regenerate and reload.${NC}"
    else
        echo -e "  Template:  ${GREEN}current${NC}"
    fi

    # Resolve the backup set once, before reporting anything: the per-service verdict
    # and the "latest" line must describe the *same* backup. Reading the `latest`
    # symlink while listing by mtime lets them disagree when a run aborts before
    # updating the symlink — status would show the failed attempt while reporting the
    # previous run's "all ok".
    #
    # Count both layouts: backup-all.sh writes timestamped directories, while the
    # legacy backup-db.sh path (still reachable via the cmd_run fallback) writes
    # aos_backup_*.dump files. Matching only the legacy pattern reported
    # "no backups yet" on every run regardless of how many backups existed.
    # Sort by mtime, not name — a name sort would rank every '20*' directory above
    # every 'aos_backup_*' file regardless of age. `find` exits 0 when nothing
    # matches, unlike ls/grep under `set -e`.
    BACKUP_DIR="$PROJECT_ROOT/infra/backups"
    COUNT=0
    LATEST=""
    if [[ -d "$BACKUP_DIR" ]]; then
        FIND_BACKUPS=(find "$BACKUP_DIR" -maxdepth 1
            \( -type d -name '20*' -o -type f -name 'aos_backup_*.dump' \))
        COUNT=$("${FIND_BACKUPS[@]}" 2>/dev/null | wc -l | tr -d ' ')
        if [[ "$COUNT" -gt 0 ]]; then
            # Guarded by COUNT: `xargs ls` with empty input would list the cwd.
            # Take the first line in the shell instead of piping to `head`, which can
            # close the pipe mid-write and surface as a SIGPIPE failure under pipefail.
            LATEST=$("${FIND_BACKUPS[@]}" -print0 2>/dev/null | xargs -0 ls -td)
            LATEST=${LATEST%%$'\n'*}
        fi
    fi

    # Per-service result of that backup. The job exits 0 even when a service is
    # skipped, so "it ran" is not evidence that anything was backed up.
    if [[ -d "$LATEST" ]]; then
        MANIFEST="$LATEST/manifest.json"
        # Parse the JSON rather than counting matching lines. A manifest truncated
        # after its status lines still yields the expected count by grep while being
        # unusable to restore-all.sh, which would report a broken backup as healthy.
        if [[ ! -f "$MANIFEST" ]]; then
            SERVICE_STATE="nomanifest"
        else
        SERVICE_STATE=$(python3 -c '
import json, sys
try:
    services = json.load(open(sys.argv[1]))["services"]
except Exception:
    print("unparseable"); raise SystemExit
if len(services) != int(sys.argv[2]):
    print("incomplete:%d" % len(services)); raise SystemExit
bad = sorted(k for k, v in services.items() if v.get("status") != "ok")
print("ok" if not bad else "failed:" + ",".join(bad))
' "$MANIFEST" "$EXPECTED_SERVICES" 2>/dev/null || echo "unparseable")
        fi

        case "$SERVICE_STATE" in
            ok)           echo -e "  Services:  ${GREEN}all ok${NC}" ;;
            failed:*)     echo -e "  Services:  ${RED}not backed up: ${SERVICE_STATE#failed:}${NC} — see $MANIFEST" ;;
            incomplete:*) echo -e "  Services:  ${RED}incomplete${NC} — ${SERVICE_STATE#incomplete:}/$EXPECTED_SERVICES entries: $MANIFEST" ;;
            nomanifest)   echo -e "  Services:  ${RED}incomplete${NC} — no manifest in $(basename "$LATEST") (run aborted?)" ;;
            *)            echo -e "  Services:  ${RED}unreadable manifest${NC} — $MANIFEST" ;;
        esac
    elif [[ -n "$LATEST" ]]; then
        echo -e "  Services:  ${YELLOW}n/a${NC} — latest backup is a legacy single-file dump"
    fi

    if [[ -n "$LATEST" ]]; then
        SIZE=$(du -sh "$LATEST" | cut -f1)
        MOD=$(stat -f '%Sm' -t '%Y-%m-%d %H:%M' "$LATEST")
        echo "  Latest:    $(basename "$LATEST") ($SIZE, $MOD)"
    else
        echo "  Latest:    no backups yet"
    fi
    echo "  Total:     $COUNT backup(s)"

    # Show recent log
    if [[ -d "$LOG_DIR" ]]; then
        LATEST_LOG="$LOG_DIR/backup-stdout.log"
        if [[ -f "$LATEST_LOG" ]]; then
            LAST_LINE=$(tail -1 "$LATEST_LOG" 2>/dev/null)
            echo "  Last log:  $LAST_LINE"
        fi
    fi
}

cmd_run() {
    log_info "Triggering backup now..."
    launchctl kickstart "gui/$(id -u)/$LABEL" 2>/dev/null \
        || "$SCRIPT_DIR/backup-db.sh" --verify
}

# Route command
case "${1:-help}" in
    install)    cmd_install ;;
    uninstall)  cmd_uninstall ;;
    status)     cmd_status ;;
    run)        cmd_run ;;
    *)
        echo "Usage: $0 [install|uninstall|status|run]"
        echo ""
        echo "  install    Install daily auto-backup (launchd)"
        echo "  uninstall  Remove auto-backup scheduler"
        echo "  status     Show backup status and recent history"
        echo "  run        Trigger backup immediately"
        exit 1
        ;;
esac
