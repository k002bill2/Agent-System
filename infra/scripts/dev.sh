#!/bin/bash

# Development environment startup script
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting Agent Orchestration System${NC}"

# Check if .env file exists
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo -e "${YELLOW}⚠️  .env file not found. Creating from .env.example...${NC}"
    cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
    echo -e "${YELLOW}⚠️  Please edit .env and add your ANTHROPIC_API_KEY${NC}"
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo -e "${GREEN}📋 Checking prerequisites...${NC}"

if ! command_exists docker; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    exit 1
fi

if ! command_exists docker-compose; then
    echo -e "${RED}❌ Docker Compose is not installed${NC}"
    exit 1
fi

# Start infrastructure services
echo -e "${GREEN}🐳 Starting infrastructure (PostgreSQL, Redis, Qdrant)...${NC}"
cd "$PROJECT_ROOT/infra/docker"
docker-compose up -d postgres redis qdrant

# Wait for services
echo -e "${GREEN}⏳ Waiting for services to be ready...${NC}"
sleep 5

# Check service health
echo -e "${GREEN}🔍 Checking service health...${NC}"
docker-compose ps

echo ""
echo -e "${GREEN}✅ Infrastructure services are running!${NC}"
echo ""
echo -e "${YELLOW}To start the backend:${NC}"
echo "  cd $PROJECT_ROOT/src/backend"
echo "  uv pip install -e ."
echo "  uvicorn api.app:app --reload --reload-exclude '.claude/*' --reload-exclude '.temp/*' --reload-exclude '*.json'"
echo ""
echo -e "${YELLOW}To start the dashboard:${NC}"
echo "  cd $PROJECT_ROOT/src/dashboard"
echo "  npm install"
echo "  npm run dev"
echo ""
echo -e "${YELLOW}Service URLs:${NC}"
echo "  Backend API:  http://localhost:8000"
echo "  Dashboard:    http://localhost:5173"
echo "  PostgreSQL:   postgresql://aos:aos@localhost:5432/aos"
echo "  Redis:        redis://localhost:6379"
echo "  Qdrant:       http://localhost:6333"
echo ""
