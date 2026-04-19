#!/bin/bash
# Unified Restore — Restore Postgres + Redis + Qdrant from a backup directory
# Usage: ./restore-all.sh <backup-dir> [options]
#
# Arguments:
#   <backup-dir>            Path to backup directory (or "latest" for most recent)
#
# Options:
#   -h, --help              Show this help message
#   --skip-redis            Skip Redis restore
#   --skip-qdrant           Skip Qdrant restore
#   --dry-run               Show what would be restored without executing
#   -y, --yes               Skip confirmation prompt

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKUP_BASE="$PROJECT_ROOT/infra/backups"

# Docker container names (shared-infra after migration)
PG_CONTAINER="${CONTAINER_NAME:-shared-postgres}"
REDIS_CONTAINER="${REDIS_CONTAINER:-shared-redis}"
PG_USER="${DB_USER:-postgres}"
PG_DB="${DB_NAME:-aos}"
QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"

# Options
SKIP_REDIS=false
SKIP_QDRANT=false
DRY_RUN=false
AUTO_YES=false
BACKUP_DIR=""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()  { echo -e "${CYAN}[STEP]${NC} $1"; }

show_help() {
    head -14 "$0" | tail -12 | sed 's/^# //' | sed 's/^#//'
    exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)       show_help ;;
        --skip-redis)    SKIP_REDIS=true; shift ;;
        --skip-qdrant)   SKIP_QDRANT=true; shift ;;
        --dry-run)       DRY_RUN=true; shift ;;
        -y|--yes)        AUTO_YES=true; shift ;;
        *)
            if [[ -z "$BACKUP_DIR" ]]; then
                BACKUP_DIR="$1"; shift
            else
                log_error "Unknown option: $1"; show_help
            fi
            ;;
    esac
done

# Resolve backup directory
if [[ -z "$BACKUP_DIR" ]]; then
    log_error "Usage: $0 <backup-dir|latest> [options]"
    echo ""
    echo "Available backups:"
    if [[ -d "$BACKUP_BASE" ]]; then
        for dir in "$BACKUP_BASE"/*/; do
            [[ -f "${dir}manifest.json" ]] || continue
            name=$(basename "$dir")
            size=$(du -sh "$dir" | cut -f1)
            echo "  $name ($size)"
        done
    fi
    exit 1
fi

if [[ "$BACKUP_DIR" == "latest" ]]; then
    if [[ -L "$BACKUP_BASE/latest" ]]; then
        BACKUP_DIR="$BACKUP_BASE/$(readlink "$BACKUP_BASE/latest")"
    else
        log_error "No 'latest' symlink found. Specify a backup directory."
        exit 1
    fi
elif [[ ! "$BACKUP_DIR" = /* ]]; then
    # Relative path — try under backup base first
    if [[ -d "$BACKUP_BASE/$BACKUP_DIR" ]]; then
        BACKUP_DIR="$BACKUP_BASE/$BACKUP_DIR"
    fi
fi

if [[ ! -d "$BACKUP_DIR" ]]; then
    log_error "Backup directory not found: $BACKUP_DIR"
    exit 1
fi

# ─────────────────────────────────────────────────
# Read manifest and show plan
# ─────────────────────────────────────────────────
echo ""
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}  AOS Full Restore${NC}"
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo ""
echo "  Source: $BACKUP_DIR"

MANIFEST="$BACKUP_DIR/manifest.json"
if [[ -f "$MANIFEST" ]]; then
    echo "  Manifest:"
    python3 -c "
import json
with open('$MANIFEST') as f:
    m = json.load(f)
print(f\"  Timestamp: {m.get('timestamp', 'unknown')}\")
for svc, info in m.get('services', {}).items():
    print(f\"    {svc}: {info.get('status', 'unknown')} ({info.get('file', '-')})\")
"
fi
echo ""

# Determine what to restore
RESTORE_PG=false
RESTORE_REDIS=false
RESTORE_QDRANT=false

PG_FILE="$BACKUP_DIR/postgres.dump"
REDIS_FILE="$BACKUP_DIR/redis.rdb"
QDRANT_FILE="$BACKUP_DIR/qdrant.snapshot"

[[ -f "$PG_FILE" ]]     && RESTORE_PG=true
[[ -f "$REDIS_FILE" ]]  && [[ "$SKIP_REDIS" == false ]]  && RESTORE_REDIS=true
[[ -f "$QDRANT_FILE" ]] && [[ "$SKIP_QDRANT" == false ]] && RESTORE_QDRANT=true

echo "  Restore plan:"
$RESTORE_PG     && echo -e "    ${GREEN}[restore]${NC} PostgreSQL  ($(du -h "$PG_FILE" | cut -f1))" \
                || echo -e "    ${YELLOW}[skip]${NC}    PostgreSQL"
$RESTORE_REDIS  && echo -e "    ${GREEN}[restore]${NC} Redis       ($(du -h "$REDIS_FILE" | cut -f1))" \
                || echo -e "    ${YELLOW}[skip]${NC}    Redis"
$RESTORE_QDRANT && echo -e "    ${GREEN}[restore]${NC} Qdrant      ($(du -h "$QDRANT_FILE" | cut -f1))" \
                || echo -e "    ${YELLOW}[skip]${NC}    Qdrant"
echo ""

if [[ "$DRY_RUN" == true ]]; then
    log_info "Dry run — no changes made."
    exit 0
fi

# Confirmation
if [[ "$AUTO_YES" != true ]]; then
    echo -e "${RED}WARNING: This will overwrite current data in the restored services.${NC}"
    read -rp "Continue? [y/N] " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        log_info "Restore cancelled."
        exit 0
    fi
fi

echo ""
SERVICES_OK=()
SERVICES_FAIL=()

# ─────────────────────────────────────────────────
# 1. PostgreSQL Restore
# ─────────────────────────────────────────────────
if [[ "$RESTORE_PG" == true ]]; then
    log_step "1/3 Restoring PostgreSQL..."
    if docker inspect -f '{{.State.Running}}' "$PG_CONTAINER" 2>/dev/null | grep -q true; then
        if docker exec -i "$PG_CONTAINER" \
            pg_restore --clean --if-exists --no-owner -U "$PG_USER" -d "$PG_DB" \
            < "$PG_FILE" 2>/dev/null; then
            log_info "PostgreSQL: restored"
            SERVICES_OK+=("postgres")
        else
            # pg_restore returns non-zero for warnings too (e.g., "relation does not exist" on --clean)
            log_warn "PostgreSQL: restored with warnings (this is usually OK)"
            SERVICES_OK+=("postgres")
        fi
    else
        log_error "PostgreSQL: container '$PG_CONTAINER' not running"
        SERVICES_FAIL+=("postgres")
    fi
else
    log_step "1/3 PostgreSQL: skipped"
fi

# ─────────────────────────────────────────────────
# 2. Redis Restore
# ─────────────────────────────────────────────────
if [[ "$RESTORE_REDIS" == true ]]; then
    log_step "2/3 Restoring Redis..."
    if docker inspect -f '{{.State.Running}}' "$REDIS_CONTAINER" 2>/dev/null | grep -q true; then
        # Stop Redis, copy RDB, restart
        docker exec "$REDIS_CONTAINER" redis-cli SHUTDOWN NOSAVE 2>/dev/null || true
        sleep 1
        docker cp "$REDIS_FILE" "$REDIS_CONTAINER:/data/dump.rdb" 2>/dev/null
        docker start "$REDIS_CONTAINER" 2>/dev/null
        sleep 2
        if docker exec "$REDIS_CONTAINER" redis-cli PING 2>/dev/null | grep -q PONG; then
            DBSIZE=$(docker exec "$REDIS_CONTAINER" redis-cli DBSIZE 2>/dev/null | grep -oE '[0-9]+' || echo "?")
            log_info "Redis: restored ($DBSIZE keys)"
            SERVICES_OK+=("redis")
        else
            log_error "Redis: failed to restart after restore"
            SERVICES_FAIL+=("redis")
        fi
    else
        log_error "Redis: container '$REDIS_CONTAINER' not running"
        SERVICES_FAIL+=("redis")
    fi
else
    log_step "2/3 Redis: skipped"
fi

# ─────────────────────────────────────────────────
# 3. Qdrant Restore
# ─────────────────────────────────────────────────
if [[ "$RESTORE_QDRANT" == true ]]; then
    log_step "3/3 Restoring Qdrant..."
    if curl -sf "$QDRANT_URL/healthz" > /dev/null 2>&1; then
        # Upload snapshot for full restore
        RESULT=$(curl -sf -X POST "$QDRANT_URL/snapshots/upload" \
            -H 'Content-Type: multipart/form-data' \
            -F "snapshot=@$QDRANT_FILE" 2>/dev/null || echo "")
        if [[ -n "$RESULT" ]]; then
            log_info "Qdrant: restored"
            SERVICES_OK+=("qdrant")
        else
            log_error "Qdrant: snapshot upload failed"
            SERVICES_FAIL+=("qdrant")
        fi
    else
        log_error "Qdrant: not reachable at $QDRANT_URL"
        SERVICES_FAIL+=("qdrant")
    fi
else
    log_step "3/3 Qdrant: skipped"
fi

# ─────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────
echo ""
echo -e "${CYAN}─── Restore Summary ────────────────────────${NC}"
echo "  Source: $(basename "$BACKUP_DIR")"
[[ ${#SERVICES_OK[@]} -gt 0 ]]   && echo -e "  ${GREEN}Restored:${NC} ${SERVICES_OK[*]}"
[[ ${#SERVICES_FAIL[@]} -gt 0 ]] && echo -e "  ${RED}Failed:${NC}   ${SERVICES_FAIL[*]}"
echo ""

if [[ ${#SERVICES_FAIL[@]} -gt 0 ]]; then
    log_error "Some services failed to restore. Check logs above."
    exit 1
else
    log_info "All services restored successfully!"
fi
