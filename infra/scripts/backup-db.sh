#!/bin/bash
# Database Backup Script (Docker-based)
# Usage: ./backup-db.sh [options]
#
# Options:
#   -h, --help              Show this help message
#   -o, --output DIR        Output directory (default: PROJECT_ROOT/infra/backups)
#   -r, --retention DAYS    Retention period in days (default: 30)
#   --verify                Verify backup after creation
#
# Environment variables:
#   CONTAINER_NAME          Docker container name (default: shared-postgres)
#   DB_USER                 Database user (default: postgres)
#   DB_NAME                 Database name (default: aos)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Default values
OUTPUT_DIR="$PROJECT_ROOT/infra/backups"
RETENTION_DAYS=30
VERIFY=false
CONTAINER_NAME="${CONTAINER_NAME:-shared-postgres}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-aos}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# macOS notification helper
notify() {
    local title="$1" message="$2"
    osascript -e "display notification \"$message\" with title \"$title\"" 2>/dev/null || true
}

show_help() {
    head -16 "$0" | tail -14 | sed 's/^# //' | sed 's/^#//'
    exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)    show_help ;;
        -o|--output)  OUTPUT_DIR="$2"; shift 2 ;;
        -r|--retention) RETENTION_DAYS="$2"; shift 2 ;;
        --verify)     VERIFY=true; shift ;;
        *)            log_error "Unknown option: $1"; show_help ;;
    esac
done

# Check Docker container is running
if ! docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null | grep -q true; then
    log_error "Docker container '$CONTAINER_NAME' is not running."
    log_error "Start it with: cd ~/Work/shared-infra && docker compose up -d"
    notify "AOS Backup Failed" "Docker container '$CONTAINER_NAME' is not running."
    exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Generate backup filename
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${OUTPUT_DIR}/aos_backup_${TIMESTAMP}.dump"

log_info "Starting database backup..."
log_info "Container: $CONTAINER_NAME"
log_info "Database: $DB_NAME (user: $DB_USER)"
log_info "Output: $BACKUP_FILE"

# Create backup using Docker exec (custom format for pg_restore compatibility)
docker exec "$CONTAINER_NAME" \
    pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom --no-owner --no-acl \
    > "$BACKUP_FILE"

if [[ ! -s "$BACKUP_FILE" ]]; then
    log_error "Backup file is empty. pg_dump may have failed."
    notify "AOS Backup Failed" "pg_dump produced empty file."
    rm -f "$BACKUP_FILE"
    exit 1
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log_info "Backup created: $BACKUP_FILE ($BACKUP_SIZE)"

# Verify backup
if [[ "$VERIFY" == true ]]; then
    log_info "Verifying backup integrity..."
    if docker exec -i "$CONTAINER_NAME" pg_restore --list < "$BACKUP_FILE" > /dev/null 2>&1; then
        TABLE_COUNT=$(docker exec -i "$CONTAINER_NAME" pg_restore --list < "$BACKUP_FILE" 2>/dev/null | grep -c "TABLE" || echo "0")
        log_info "Backup verification: OK ($TABLE_COUNT tables)"
    else
        log_error "Backup verification: FAILED"
        notify "AOS Backup Failed" "Backup verification failed."
        exit 1
    fi
fi

# Cleanup old backups
if [[ "$RETENTION_DAYS" -gt 0 ]]; then
    log_info "Cleaning up backups older than $RETENTION_DAYS days..."
    DELETED=0
    while IFS= read -r file; do
        log_info "Deleted old backup: $file"
        DELETED=$((DELETED + 1))
    done < <(find "$OUTPUT_DIR" -name "aos_backup_*.dump" -type f -mtime +"$RETENTION_DAYS" -print -delete 2>/dev/null)
    if [[ "$DELETED" -eq 0 ]]; then
        log_info "No old backups to clean up."
    fi
fi

# Also maintain a latest symlink for quick access
ln -sf "$(basename "$BACKUP_FILE")" "${OUTPUT_DIR}/latest.dump"

notify "AOS Backup Complete" "DB backup $BACKUP_SIZE saved. ($TIMESTAMP)"
log_info "Backup completed successfully!"
echo ""
echo "Summary:"
echo "  File:      $BACKUP_FILE"
echo "  Size:      $BACKUP_SIZE"
echo "  Timestamp: $TIMESTAMP"
echo ""
echo "Restore with:"
echo "  docker exec -i $CONTAINER_NAME pg_restore --clean --if-exists --no-owner -U $DB_USER -d $DB_NAME < $BACKUP_FILE"
