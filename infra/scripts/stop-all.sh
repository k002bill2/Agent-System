#!/bin/bash

# ============================================================
# AOS (Agent Orchestration Service) - Stop All Services
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PID_DIR="$PROJECT_ROOT/.pids"
COMPOSE_FILE="$HOME/Work/shared-infra/docker-compose.yml"

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
# Always kill whatever still holds the dashboard port. A pattern kill cannot
# work here: vite's argv is just `node .../node_modules/.bin/vite` with no port
# in it, so the old `pkill -f "vite.*5173"` never matched anything.
# -sTCP:LISTEN: never kill a client merely connected to the port.
for pid in $(lsof -ti :5173 -sTCP:LISTEN 2>/dev/null); do
    # 5173 is vite's default port, so a sibling project may legitimately hold it.
    # vite's argv carries the project's absolute path (that is why a port-pattern
    # kill cannot work, and why a path check can) - only kill what is ours.
    CMD=$(ps -ww -o command= -p "$pid" 2>/dev/null | tr -d '\n')
    case "$CMD" in
        *"$PROJECT_ROOT/src/dashboard/"*) ;;
        *)
            echo -e "${YELLOW}Port 5173 held by another project (PID $pid): $CMD${NC}"
            echo -e "${YELLOW}Leaving it alone - not an AOS dashboard.${NC}"
            continue
            ;;
    esac
    PARENT_PID=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
    if [ -n "$PARENT_PID" ] && ps -ww -o command= -p "$PARENT_PID" 2>/dev/null | grep -q "npm"; then
        kill -9 "$PARENT_PID" 2>/dev/null || true
    fi
    kill -9 "$pid" 2>/dev/null || true
done

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
# Match AOS backend regardless of whether --port 8000 flag is present
pkill -f "uvicorn.*api\.app:app" 2>/dev/null || true
sleep 1
# Force kill if still running
if pgrep -f "uvicorn.*api\.app:app" > /dev/null 2>&1; then
    echo -e "${YELLOW}Force killing remaining backend processes...${NC}"
    pkill -9 -f "uvicorn.*api\.app:app" 2>/dev/null || true
fi

# Stop Infrastructure (shared-infra: Postgres, Redis, Qdrant — shared across projects)
echo -e "${GREEN}Stopping Infrastructure (shared-infra)...${NC}"
docker compose -f "$COMPOSE_FILE" down ${COMPOSE_DOWN_FLAGS} 2>/dev/null || true

echo ""
echo -e "${GREEN}All services stopped.${NC}"
