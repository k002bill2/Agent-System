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

    # Show recent backups
    BACKUP_DIR="$PROJECT_ROOT/infra/backups"
    if [[ -d "$BACKUP_DIR" ]]; then
        LATEST=$(find "$BACKUP_DIR" -maxdepth 1 -name "aos_backup_*.dump" -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1 || true)
        if [[ -n "$LATEST" ]]; then
            SIZE=$(du -h "$LATEST" | cut -f1)
            MOD=$(stat -f '%Sm' -t '%Y-%m-%d %H:%M' "$LATEST")
            echo "  Latest:    $(basename "$LATEST") ($SIZE, $MOD)"
        else
            echo "  Latest:    no backups yet"
        fi
        COUNT=$(find "$BACKUP_DIR" -name "aos_backup_*.dump" -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')
        echo "  Total:     $COUNT backup(s)"
    fi

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
