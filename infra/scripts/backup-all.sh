#!/bin/bash
# Unified Backup — Postgres + Redis + Qdrant into a single timestamped directory
# Usage: ./backup-all.sh [options]
#
# Options:
#   -h, --help              Show this help message
#   -o, --output DIR        Output base directory (default: PROJECT_ROOT/infra/backups)
#   -r, --retention DAYS    Retention period in days (default: 30)
#   --skip-redis            Skip Redis backup
#   --skip-qdrant           Skip Qdrant backup
#   --verify                Verify backups after creation

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Default values
OUTPUT_BASE="$PROJECT_ROOT/infra/backups"
RETENTION_DAYS=30
SKIP_REDIS=false
SKIP_QDRANT=false
VERIFY=false

# Docker container names (shared-infra after migration)
PG_CONTAINER="${CONTAINER_NAME:-shared-postgres}"
REDIS_CONTAINER="${REDIS_CONTAINER:-shared-redis}"
PG_USER="${DB_USER:-postgres}"
PG_DB="${DB_NAME:-aos}"
QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"

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

notify() {
    local title="$1" message="$2"
    osascript -e "display notification \"$message\" with title \"$title\"" 2>/dev/null || true
}

show_help() {
    head -12 "$0" | tail -10 | sed 's/^# //' | sed 's/^#//'
    exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)       show_help ;;
        -o|--output)     OUTPUT_BASE="$2"; shift 2 ;;
        -r|--retention)  RETENTION_DAYS="$2"; shift 2 ;;
        --skip-redis)    SKIP_REDIS=true; shift ;;
        --skip-qdrant)   SKIP_QDRANT=true; shift ;;
        --verify)        VERIFY=true; shift ;;
        *)               log_error "Unknown option: $1"; show_help ;;
    esac
done

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$OUTPUT_BASE/$TIMESTAMP"
mkdir -p "$BACKUP_DIR"

echo ""
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}  AOS Full Backup — $TIMESTAMP${NC}"
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo ""

SERVICES_OK=()
SERVICES_SKIP=()
SERVICES_FAIL=()

# ─────────────────────────────────────────────────
# 1. PostgreSQL
# ─────────────────────────────────────────────────
log_step "1/3 PostgreSQL backup..."
PG_FILE="$BACKUP_DIR/postgres.dump"

if docker inspect -f '{{.State.Running}}' "$PG_CONTAINER" 2>/dev/null | grep -q true; then
    if docker exec "$PG_CONTAINER" \
        pg_dump -U "$PG_USER" -d "$PG_DB" --format=custom --no-owner --no-acl \
        > "$PG_FILE" 2>/dev/null && [[ -s "$PG_FILE" ]]; then

        PG_SIZE=$(du -h "$PG_FILE" | cut -f1)
        log_info "PostgreSQL: OK ($PG_SIZE)"

        if [[ "$VERIFY" == true ]]; then
            if docker exec -i "$PG_CONTAINER" pg_restore --list < "$PG_FILE" > /dev/null 2>&1; then
                log_info "PostgreSQL verify: PASS"
            else
                log_warn "PostgreSQL verify: FAIL (backup may be corrupted)"
            fi
        fi
        SERVICES_OK+=("postgres")
    else
        log_error "PostgreSQL: pg_dump failed"
        rm -f "$PG_FILE"
        SERVICES_FAIL+=("postgres")
    fi
else
    log_warn "PostgreSQL: container '$PG_CONTAINER' not running, skipped"
    SERVICES_SKIP+=("postgres")
fi

# ─────────────────────────────────────────────────
# 2. Redis
# ─────────────────────────────────────────────────
log_step "2/3 Redis backup..."
REDIS_FILE="$BACKUP_DIR/redis.rdb"

if [[ "$SKIP_REDIS" == true ]]; then
    log_info "Redis: skipped (--skip-redis)"
    SERVICES_SKIP+=("redis")
elif docker inspect -f '{{.State.Running}}' "$REDIS_CONTAINER" 2>/dev/null | grep -q true; then
    # Trigger RDB snapshot
    docker exec "$REDIS_CONTAINER" redis-cli BGSAVE > /dev/null 2>&1
    sleep 2  # Wait for BGSAVE to complete

    if docker cp "$REDIS_CONTAINER:/data/dump.rdb" "$REDIS_FILE" 2>/dev/null && [[ -s "$REDIS_FILE" ]]; then
        REDIS_SIZE=$(du -h "$REDIS_FILE" | cut -f1)
        log_info "Redis: OK ($REDIS_SIZE)"
        SERVICES_OK+=("redis")
    else
        log_warn "Redis: copy failed (empty data or no dump.rdb)"
        rm -f "$REDIS_FILE"
        SERVICES_SKIP+=("redis")
    fi
else
    log_warn "Redis: container '$REDIS_CONTAINER' not running, skipped"
    SERVICES_SKIP+=("redis")
fi

# ─────────────────────────────────────────────────
# 3. Qdrant
# ─────────────────────────────────────────────────
log_step "3/3 Qdrant backup..."
QDRANT_FILE="$BACKUP_DIR/qdrant.snapshot"

if [[ "$SKIP_QDRANT" == true ]]; then
    log_info "Qdrant: skipped (--skip-qdrant)"
    SERVICES_SKIP+=("qdrant")
elif curl -sf "$QDRANT_URL/healthz" > /dev/null 2>&1; then
    # Create full snapshot
    SNAP_RESPONSE=$(curl -sf -X POST "$QDRANT_URL/snapshots" 2>/dev/null || echo "")
    if [[ -n "$SNAP_RESPONSE" ]]; then
        SNAP_NAME=$(echo "$SNAP_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['name'])" 2>/dev/null || echo "")
        if [[ -n "$SNAP_NAME" ]]; then
            if curl -sf -o "$QDRANT_FILE" "$QDRANT_URL/snapshots/$SNAP_NAME" 2>/dev/null && [[ -s "$QDRANT_FILE" ]]; then
                QDRANT_SIZE=$(du -h "$QDRANT_FILE" | cut -f1)
                log_info "Qdrant: OK ($QDRANT_SIZE)"
                SERVICES_OK+=("qdrant")
                # Clean up remote snapshot
                curl -sf -X DELETE "$QDRANT_URL/snapshots/$SNAP_NAME" > /dev/null 2>&1 || true
            else
                log_warn "Qdrant: snapshot download failed"
                rm -f "$QDRANT_FILE"
                SERVICES_FAIL+=("qdrant")
            fi
        else
            log_warn "Qdrant: snapshot creation returned no name"
            SERVICES_FAIL+=("qdrant")
        fi
    else
        log_warn "Qdrant: snapshot API call failed"
        SERVICES_FAIL+=("qdrant")
    fi
else
    log_warn "Qdrant: not reachable at $QDRANT_URL, skipped"
    SERVICES_SKIP+=("qdrant")
fi

# ─────────────────────────────────────────────────
# Manifest
# ─────────────────────────────────────────────────
python3 -c "
import json, os
manifest = {
    'timestamp': '$TIMESTAMP',
    'services': {
        'postgres': {'file': 'postgres.dump', 'status': 'ok' if os.path.isfile('$PG_FILE') else 'missing'},
        'redis': {'file': 'redis.rdb', 'status': 'ok' if os.path.isfile('$REDIS_FILE') else 'skipped'},
        'qdrant': {'file': 'qdrant.snapshot', 'status': 'ok' if os.path.isfile('$QDRANT_FILE') else 'skipped'},
    },
}
with open('$BACKUP_DIR/manifest.json', 'w') as f:
    json.dump(manifest, f, indent=2)
"

# Symlink latest
ln -sfn "$TIMESTAMP" "$OUTPUT_BASE/latest"

# ─────────────────────────────────────────────────
# Retention cleanup
# ─────────────────────────────────────────────────
if [[ "$RETENTION_DAYS" -gt 0 ]]; then
    DELETED=0
    while IFS= read -r dir; do
        rm -rf "$dir"
        DELETED=$((DELETED + 1))
    done < <(find "$OUTPUT_BASE" -maxdepth 1 -mindepth 1 -type d -mtime +"$RETENTION_DAYS" -not -name "logs" -print 2>/dev/null)
    # Also clean legacy single-file backups
    find "$OUTPUT_BASE" -maxdepth 1 -name "aos_backup_*.dump" -type f -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
    [[ "$DELETED" -gt 0 ]] && log_info "Cleaned up $DELETED old backup(s)"
fi

# ─────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────
echo ""
echo -e "${CYAN}─── Summary ───────────────────────────────${NC}"
echo "  Directory: $BACKUP_DIR"
[[ ${#SERVICES_OK[@]} -gt 0 ]]   && echo -e "  ${GREEN}OK:${NC}      ${SERVICES_OK[*]}"
[[ ${#SERVICES_SKIP[@]} -gt 0 ]] && echo -e "  ${YELLOW}Skipped:${NC} ${SERVICES_SKIP[*]}"
[[ ${#SERVICES_FAIL[@]} -gt 0 ]] && echo -e "  ${RED}Failed:${NC}  ${SERVICES_FAIL[*]}"
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
echo "  Total:     $TOTAL_SIZE"
echo ""

RESULT="${#SERVICES_OK[@]} OK, ${#SERVICES_SKIP[@]} skipped, ${#SERVICES_FAIL[@]} failed"
notify "AOS Backup" "$RESULT ($TOTAL_SIZE)"

# Exit with error if any required service failed
[[ ${#SERVICES_FAIL[@]} -eq 0 ]]
