#!/bin/bash

# ============================================================
# AOS (Agent Orchestration Service) - Stop All Services
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PID_DIR="$PROJECT_ROOT/.pids"
COMPOSE_FILE="$PROJECT_ROOT/infra/docker/docker-compose.yml"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Safety guard: warn before volume deletion
COMPOSE_DOWN_FLAGS=""
for arg in "$@"; do
    if [[ "$arg" == "-v" || "$arg" == "--volumes" ]]; then
        echo -e "${RED}WARNING: -v flag will DELETE all database data permanently!${NC}"
        echo -e "${YELLOW}This will destroy your PostgreSQL, Redis, and Qdrant data.${NC}"
        read -p "Are you sure? Type 'yes' to confirm: " confirm
        if [[ "$confirm" != "yes" ]]; then
            echo "Aborted."
            exit 0
        fi
        COMPOSE_DOWN_FLAGS="-v"
        break
    fi
done

echo -e "${YELLOW}Stopping all AOS services...${NC}"
echo ""

# Stop Dashboard
if [ -f "$PID_DIR/dashboard.pid" ]; then
    PID=$(cat "$PID_DIR/dashboard.pid")
    if kill -0 "$PID" 2>/dev/null; then
        echo -e "${GREEN}Stopping Dashboard (PID: $PID)...${NC}"
        kill "$PID" 2>/dev/null || true
    fi
    rm -f "$PID_DIR/dashboard.pid"
else
    echo -e "${YELLOW}Dashboard PID file not found${NC}"
fi
# Always kill remaining vite processes (child processes may survive)
pkill -f "vite.*5173" 2>/dev/null || true

# Stop Backend
if [ -f "$PID_DIR/backend.pid" ]; then
    PID=$(cat "$PID_DIR/backend.pid")
    if kill -0 "$PID" 2>/dev/null; then
        echo -e "${GREEN}Stopping Backend (PID: $PID)...${NC}"
        kill "$PID" 2>/dev/null || true
    fi
    rm -f "$PID_DIR/backend.pid"
else
    echo -e "${YELLOW}Backend PID file not found${NC}"
fi
# Always kill remaining uvicorn processes (workers may survive parent kill)
pkill -f "uvicorn.*8000" 2>/dev/null || true
sleep 1
# Force kill if still running
if pgrep -f "uvicorn.*8000" > /dev/null 2>&1; then
    echo -e "${YELLOW}Force killing remaining backend processes...${NC}"
    pkill -9 -f "uvicorn.*8000" 2>/dev/null || true
fi

# Auto-backup before shutdown (if postgres is running)
if docker ps --filter "name=aos-postgres" --filter "status=running" -q | grep -q .; then
    echo -e "${YELLOW}Creating pre-shutdown backup...${NC}"
    BACKUP_DIR="$PROJECT_ROOT/infra/docker/data/backups"
    mkdir -p "$BACKUP_DIR"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    docker exec aos-postgres pg_dump -U aos aos | gzip > "$BACKUP_DIR/pre_shutdown_${TIMESTAMP}.sql.gz" 2>/dev/null && \
        echo -e "${GREEN}Backup saved: $BACKUP_DIR/pre_shutdown_${TIMESTAMP}.sql.gz${NC}" || \
        echo -e "${YELLOW}Backup skipped (non-critical)${NC}"
    # Keep only last 5 pre-shutdown backups
    ls -t "$BACKUP_DIR"/pre_shutdown_*.sql.gz 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null || true
fi

# Stop Infrastructure
echo -e "${GREEN}Stopping Infrastructure (Docker)...${NC}"
docker compose -f "$COMPOSE_FILE" down ${COMPOSE_DOWN_FLAGS} 2>/dev/null || true

echo ""
echo -e "${GREEN}All services stopped.${NC}"
