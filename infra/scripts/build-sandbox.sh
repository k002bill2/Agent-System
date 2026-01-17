#!/bin/bash
# Build the sandbox Docker image for secure command execution
#
# Usage: ./build-sandbox.sh [--no-cache]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DOCKER_DIR="$PROJECT_ROOT/infra/docker"

IMAGE_NAME="ags-sandbox"
IMAGE_TAG="latest"

echo "=== Building AGS Sandbox Image ==="
echo "Project root: $PROJECT_ROOT"
echo "Docker dir: $DOCKER_DIR"
echo ""

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed or not in PATH"
    exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    echo "Error: Docker daemon is not running"
    exit 1
fi

# Parse arguments
NO_CACHE=""
if [ "$1" == "--no-cache" ]; then
    NO_CACHE="--no-cache"
    echo "Building without cache..."
fi

# Build the image
echo "Building $IMAGE_NAME:$IMAGE_TAG..."
docker build \
    $NO_CACHE \
    -t "$IMAGE_NAME:$IMAGE_TAG" \
    -f "$DOCKER_DIR/Dockerfile.sandbox" \
    "$DOCKER_DIR"

# Verify the image
echo ""
echo "=== Verifying Image ==="

# Test 1: Check user is non-root
echo -n "1. Non-root user check: "
USER_CHECK=$(docker run --rm "$IMAGE_NAME:$IMAGE_TAG" whoami 2>&1)
if [ "$USER_CHECK" == "sandbox" ]; then
    echo "PASS (user: sandbox)"
else
    echo "FAIL (user: $USER_CHECK)"
    exit 1
fi

# Test 2: Check working directory
echo -n "2. Working directory check: "
PWD_CHECK=$(docker run --rm "$IMAGE_NAME:$IMAGE_TAG" pwd 2>&1)
if [ "$PWD_CHECK" == "/workspace" ]; then
    echo "PASS (pwd: /workspace)"
else
    echo "FAIL (pwd: $PWD_CHECK)"
    exit 1
fi

# Test 3: Check Python is available
echo -n "3. Python availability check: "
PYTHON_CHECK=$(docker run --rm "$IMAGE_NAME:$IMAGE_TAG" python --version 2>&1)
if [[ "$PYTHON_CHECK" == Python* ]]; then
    echo "PASS ($PYTHON_CHECK)"
else
    echo "FAIL (Python not found)"
    exit 1
fi

# Test 4: Check network isolation (when run with --network=none)
echo -n "4. Network isolation check: "
NETWORK_CHECK=$(docker run --rm --network=none "$IMAGE_NAME:$IMAGE_TAG" \
    bash -c "curl -s --connect-timeout 2 https://google.com 2>&1 || echo 'blocked'" 2>&1)
if [[ "$NETWORK_CHECK" == *"blocked"* ]] || [[ "$NETWORK_CHECK" == *"Could not resolve"* ]]; then
    echo "PASS (network blocked)"
else
    echo "WARNING (network not blocked - ensure --network=none at runtime)"
fi

echo ""
echo "=== Build Complete ==="
echo "Image: $IMAGE_NAME:$IMAGE_TAG"
echo ""
echo "To test the sandbox manually:"
echo "  docker run --rm -it --network=none --memory=512m $IMAGE_NAME:$IMAGE_TAG bash"
