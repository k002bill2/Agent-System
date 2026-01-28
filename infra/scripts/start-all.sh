#!/bin/bash

# ============================================================
# AOS (Agent Orchestration Service) - All Services Startup
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# PID file location
PID_DIR="$PROJECT_ROOT/.pids"
mkdir -p "$PID_DIR"

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}   Agent Orchestration Service - Starting All Services${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""

# Check .env
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo -e "${YELLOW}Creating .env from .env.example...${NC}"
    cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
fi

# Check Docker
echo -e "${GREEN}[1/3] Starting Infrastructure (Docker)...${NC}"
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Docker is not running. Please start Docker Desktop.${NC}"
    exit 1
fi

cd "$PROJECT_ROOT/infra/docker"
docker-compose up -d postgres redis

echo -e "${GREEN}      Waiting for PostgreSQL and Redis...${NC}"
sleep 3

# Check if services are healthy
if docker-compose ps | grep -q "Up"; then
    echo -e "${GREEN}      Infrastructure is running${NC}"
else
    echo -e "${RED}      Failed to start infrastructure${NC}"
    exit 1
fi

# Start Backend
echo ""
echo -e "${GREEN}[2/3] Starting Backend (FastAPI)...${NC}"
cd "$PROJECT_ROOT/src/backend"

# Check if venv exists
if [ ! -d ".venv" ]; then
    echo -e "${YELLOW}      Creating virtual environment...${NC}"
    python3 -m venv .venv
fi

source .venv/bin/activate

# Install dependencies if needed
if ! python -c "import fastapi" 2>/dev/null; then
    echo -e "${YELLOW}      Installing dependencies...${NC}"
    pip install -e . -q
fi

# Kill existing backend if running
if [ -f "$PID_DIR/backend.pid" ]; then
    OLD_PID=$(cat "$PID_DIR/backend.pid")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        echo -e "${YELLOW}      Stopping existing backend (PID: $OLD_PID)...${NC}"
        kill "$OLD_PID" 2>/dev/null || true
        sleep 1
    fi
fi

# Load specific environment variables from .env
export GITHUB_TOKEN=$(grep "^GITHUB_TOKEN=" "$PROJECT_ROOT/.env" | cut -d'=' -f2-)
export GOOGLE_API_KEY=$(grep "^GOOGLE_API_KEY=" "$PROJECT_ROOT/.env" | cut -d'=' -f2-)
export ANTHROPIC_API_KEY=$(grep "^ANTHROPIC_API_KEY=" "$PROJECT_ROOT/.env" | cut -d'=' -f2-)

# Start backend in background
USE_DATABASE=true nohup uvicorn api.app:app --host 0.0.0.0 --port 8000 --reload > "$PROJECT_ROOT/logs/backend.log" 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > "$PID_DIR/backend.pid"
echo -e "${GREEN}      Backend started (PID: $BACKEND_PID)${NC}"

# Start Dashboard
echo ""
echo -e "${GREEN}[3/3] Starting Dashboard (React)...${NC}"
cd "$PROJECT_ROOT/src/dashboard"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}      Installing npm dependencies...${NC}"
    npm install --silent
fi

# Kill existing dashboard if running
if [ -f "$PID_DIR/dashboard.pid" ]; then
    OLD_PID=$(cat "$PID_DIR/dashboard.pid")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        echo -e "${YELLOW}      Stopping existing dashboard (PID: $OLD_PID)...${NC}"
        kill "$OLD_PID" 2>/dev/null || true
        sleep 1
    fi
fi

# Create logs directory
mkdir -p "$PROJECT_ROOT/logs"

# Start dashboard in background
nohup npm run dev > "$PROJECT_ROOT/logs/dashboard.log" 2>&1 &
DASHBOARD_PID=$!
echo $DASHBOARD_PID > "$PID_DIR/dashboard.pid"
echo -e "${GREEN}      Dashboard started (PID: $DASHBOARD_PID)${NC}"

# Wait for services to be ready
echo ""
echo -e "${YELLOW}Waiting for services to be ready...${NC}"
sleep 3

# Summary
echo ""
echo -e "${BLUE}============================================================${NC}"
echo -e "${GREEN}All services are running!${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""
echo -e "${YELLOW}Service URLs:${NC}"
echo -e "  Backend API:  ${GREEN}http://localhost:8000${NC}"
echo -e "  Dashboard:    ${GREEN}http://localhost:5173${NC}"
echo -e "  API Docs:     ${GREEN}http://localhost:8000/docs${NC}"
echo ""
echo -e "${YELLOW}Logs:${NC}"
echo -e "  Backend:   tail -f $PROJECT_ROOT/logs/backend.log"
echo -e "  Dashboard: tail -f $PROJECT_ROOT/logs/dashboard.log"
echo ""
echo -e "${YELLOW}To stop all services:${NC}"
echo -e "  $SCRIPT_DIR/stop-all.sh"
echo ""
