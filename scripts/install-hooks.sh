#!/usr/bin/env bash
# Git hooks 설치 스크립트
# .git/hooks/pre-push에 심볼릭 링크를 생성합니다.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$(cd "$(dirname "$0")/.." && pwd)")"
HOOK_SOURCE="$REPO_ROOT/scripts/pre-push.sh"
HOOK_TARGET="$REPO_ROOT/.git/hooks/pre-push"

if [ ! -f "$HOOK_SOURCE" ]; then
    echo "[hooks] ERROR: $HOOK_SOURCE not found"
    exit 1
fi

if [ ! -d "$REPO_ROOT/.git/hooks" ]; then
    mkdir -p "$REPO_ROOT/.git/hooks"
fi

ln -sf "$HOOK_SOURCE" "$HOOK_TARGET"
chmod +x "$HOOK_SOURCE"
chmod +x "$HOOK_TARGET"

echo "[hooks] pre-push hook installed -> scripts/pre-push.sh"
