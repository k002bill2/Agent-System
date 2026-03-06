#!/usr/bin/env bash
# AOS Quick Setup Script
# Usage: ./setup.sh [--dev]
#   --dev   Use development compose with hot-reload (default: production)

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DEV_MODE=false
if [[ "${1:-}" == "--dev" ]]; then
    DEV_MODE=true
fi

echo -e "${CYAN}=== Agent Orchestration Service Setup ===${NC}"
echo ""

# --- 1. Docker check ---
if ! command -v docker &>/dev/null; then
    echo -e "${RED}Error: Docker is not installed.${NC}"
    echo "Install Docker Desktop: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! docker info &>/dev/null; then
    echo -e "${RED}Error: Docker daemon is not running. Start Docker Desktop first.${NC}"
    exit 1
fi

echo -e "${GREEN}[OK]${NC} Docker is running"

# --- 2. .env setup ---
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env from .env.example...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}  >> Edit .env to add your API keys (GOOGLE_API_KEY or ANTHROPIC_API_KEY)${NC}"
else
    echo -e "${GREEN}[OK]${NC} .env exists"
fi

# --- 3. Port conflict detection ---
check_port() {
    local port=$1
    local name=$2
    local env_var=$3
    if lsof -i :"$port" -sTCP:LISTEN &>/dev/null; then
        echo -e "${YELLOW}Warning: Port $port ($name) is already in use.${NC}"
        echo -e "  Override with: ${CYAN}${env_var}=$((port + 1)) ./setup.sh${NC}"
        return 1
    fi
    return 0
}

PORT_CONFLICT=false
check_port "${PG_PORT:-5432}" "PostgreSQL" "PG_PORT" || PORT_CONFLICT=true
check_port "${REDIS_PORT:-6379}" "Redis" "REDIS_PORT" || PORT_CONFLICT=true
check_port "${BACKEND_PORT:-8000}" "Backend" "BACKEND_PORT" || PORT_CONFLICT=true
check_port "${DASHBOARD_PORT:-5173}" "Dashboard" "DASHBOARD_PORT" || PORT_CONFLICT=true
check_port "${QDRANT_PORT:-6333}" "Qdrant" "QDRANT_PORT" || PORT_CONFLICT=true

if [ "$PORT_CONFLICT" = true ]; then
    echo ""
    echo -e "${YELLOW}Port conflicts detected. Continue anyway? [y/N]${NC}"
    read -r answer
    if [[ ! "$answer" =~ ^[Yy]$ ]]; then
        echo "Aborted. Fix port conflicts and try again."
        exit 1
    fi
fi

# --- 4. Start services ---
echo ""
if [ "$DEV_MODE" = true ]; then
    echo -e "${GREEN}Starting services (development mode with hot-reload)...${NC}"
    COMPOSE_FILE="docker-compose.dev.yml"
else
    echo -e "${GREEN}Starting services (production mode)...${NC}"
    COMPOSE_FILE="docker-compose.yml"
fi

docker compose -f "$COMPOSE_FILE" up -d --build

# --- 5. Wait for health ---
echo ""
echo -e "${CYAN}Waiting for services to be healthy...${NC}"

MAX_WAIT=120
WAITED=0
BACKEND_PORT="${BACKEND_PORT:-8000}"

while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -sf "http://localhost:${BACKEND_PORT}/health" &>/dev/null; then
        break
    fi
    sleep 2
    WAITED=$((WAITED + 2))
    printf "."
done
echo ""

if [ $WAITED -ge $MAX_WAIT ]; then
    echo -e "${YELLOW}Backend not yet healthy after ${MAX_WAIT}s. Check logs:${NC}"
    echo "  docker compose -f $COMPOSE_FILE logs backend"
else
    echo -e "${GREEN}[OK]${NC} Backend is healthy"
fi

# --- 6. Summary ---
DASH_PORT="${DASHBOARD_PORT:-5173}"
PG_P="${PG_PORT:-5432}"
REDIS_P="${REDIS_PORT:-6379}"
QDRANT_P="${QDRANT_PORT:-6333}"

echo ""
echo -e "${CYAN}=== AOS is running ===${NC}"
echo -e "  Dashboard:  ${GREEN}http://localhost:${DASH_PORT}${NC}"
echo -e "  Backend:    ${GREEN}http://localhost:${BACKEND_PORT}${NC}"
echo -e "  PostgreSQL: postgresql://aos:aos@localhost:${PG_P}/aos"
echo -e "  Redis:      redis://localhost:${REDIS_P}"
echo -e "  Qdrant:     http://localhost:${QDRANT_P}"
echo ""
echo -e "Stop:    ${CYAN}docker compose -f $COMPOSE_FILE down${NC}"
echo -e "Logs:    ${CYAN}docker compose -f $COMPOSE_FILE logs -f${NC}"

if [ "$DEV_MODE" = true ]; then
    echo ""
    echo -e "${GREEN}Dev mode: code changes auto-reload.${NC}"
fi
