#!/bin/bash

# ============================================================
# PostgreSQL Data Migration: Named Volume → Bind Mount
# One-time migration tool
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TARGET_DIR="$PROJECT_ROOT/infra/docker/data/postgres"
COMPOSE_FILE="$PROJECT_ROOT/infra/docker/docker-compose.yml"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}PostgreSQL Data Migration: Named Volume → Bind Mount${NC}"
echo ""

# Detect which volumes have data
echo "Checking existing Docker volumes..."
VOLUMES=()
for vol in docker_postgres_data agent-system_postgres_data aos_postgres_data; do
    if docker volume inspect "$vol" >/dev/null 2>&1; then
        VOLUMES+=("$vol")
        echo -e "  Found: ${GREEN}$vol${NC}"
    fi
done

if [ ${#VOLUMES[@]} -eq 0 ]; then
    echo -e "${RED}No postgres volumes found. Nothing to migrate.${NC}"
    exit 0
fi

# Let user pick if multiple
SOURCE_VOL=""
if [ ${#VOLUMES[@]} -eq 1 ]; then
    SOURCE_VOL="${VOLUMES[0]}"
else
    echo ""
    echo "Multiple volumes found. Which one to migrate?"
    select vol in "${VOLUMES[@]}"; do
        if [ -n "$vol" ]; then
            SOURCE_VOL="$vol"
            break
        fi
    done
fi

echo ""
echo -e "Source: ${GREEN}$SOURCE_VOL${NC}"
echo -e "Target: ${GREEN}$TARGET_DIR${NC}"
echo ""

# Stop postgres if running
if docker ps --filter "name=aos-postgres" --filter "status=running" -q | grep -q .; then
    echo -e "${YELLOW}Stopping aos-postgres...${NC}"
    docker compose -f "$COMPOSE_FILE" stop postgres 2>/dev/null || \
        docker stop aos-postgres 2>/dev/null || true
    sleep 2
fi

# Create target directory
mkdir -p "$TARGET_DIR"

# Check if target already has data
if [ -f "$TARGET_DIR/PG_VERSION" ]; then
    echo -e "${RED}Target directory already contains PostgreSQL data.${NC}"
    read -p "Overwrite? (yes/no): " confirm
    if [[ "$confirm" != "yes" ]]; then
        echo "Aborted."
        exit 0
    fi
    rm -rf "${TARGET_DIR:?}"/*
fi

# Copy data using a temporary container
echo -e "${YELLOW}Copying data from volume to bind mount...${NC}"
docker run --rm \
    -v "$SOURCE_VOL":/source:ro \
    -v "$TARGET_DIR":/target \
    alpine sh -c "cp -a /source/. /target/"

# Verify
if [ -f "$TARGET_DIR/PG_VERSION" ]; then
    echo ""
    echo -e "${GREEN}Migration successful!${NC}"
    echo -e "PG_VERSION: $(cat "$TARGET_DIR/PG_VERSION")"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "  1. Start services: ./start-all.sh or ./dev.sh"
    echo "  2. Verify data is intact"
    echo "  3. Optionally remove old volumes:"
    for vol in "${VOLUMES[@]}"; do
        echo "     docker volume rm $vol"
    done
else
    echo -e "${RED}Migration may have failed. Check $TARGET_DIR${NC}"
    exit 1
fi
