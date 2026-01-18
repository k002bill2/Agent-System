#!/bin/bash

# ============================================================
# AOS (Agent Orchestration Service) - Stop All Services
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PID_DIR="$PROJECT_ROOT/.pids"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Stopping all AOS services...${NC}"
echo ""

# Stop Dashboard
if [ -f "$PID_DIR/dashboard.pid" ]; then
    PID=$(cat "$PID_DIR/dashboard.pid")
    if kill -0 "$PID" 2>/dev/null; then
        echo -e "${GREEN}Stopping Dashboard (PID: $PID)...${NC}"
        kill "$PID" 2>/dev/null || true
        # Also kill any node processes started by npm
        pkill -f "vite.*5173" 2>/dev/null || true
    fi
    rm -f "$PID_DIR/dashboard.pid"
else
    echo -e "${YELLOW}Dashboard PID file not found${NC}"
    pkill -f "vite.*5173" 2>/dev/null || true
fi

# Stop Backend
if [ -f "$PID_DIR/backend.pid" ]; then
    PID=$(cat "$PID_DIR/backend.pid")
    if kill -0 "$PID" 2>/dev/null; then
        echo -e "${GREEN}Stopping Backend (PID: $PID)...${NC}"
        kill "$PID" 2>/dev/null || true
        # Also kill any uvicorn processes
        pkill -f "uvicorn.*8000" 2>/dev/null || true
    fi
    rm -f "$PID_DIR/backend.pid"
else
    echo -e "${YELLOW}Backend PID file not found${NC}"
    pkill -f "uvicorn.*8000" 2>/dev/null || true
fi

# Stop Infrastructure
echo -e "${GREEN}Stopping Infrastructure (Docker)...${NC}"
cd "$PROJECT_ROOT/infra/docker"
docker-compose down 2>/dev/null || true

echo ""
echo -e "${GREEN}All services stopped.${NC}"
