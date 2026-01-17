#!/bin/bash

# Stop all services script
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "🛑 Stopping Agent Orchestration System..."

cd "$PROJECT_ROOT/infra/docker"
docker-compose down

echo "✅ All services stopped."
