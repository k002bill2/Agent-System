#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

echo "=== Test: Core Only Installation ==="

# Create config
cat > "$TEST_DIR/claude-workspace.yaml" << 'EOF'
project:
  name: test-core-project
  description: A test project for core-only installation
  language: en
addons: []
paths:
  src: src
  tests: tests
  docs: docs
commands:
  typecheck: ""
  lint: ""
  test: "echo test-passing"
  build: ""
  format: ""
hooks:
  ethical_validator: true
  auto_formatter: true
  context_monitor: true
  protected_paths:
    - ".env"
    - "secrets"
EOF

# Run init
"$SCRIPT_DIR/init.sh" --config "$TEST_DIR/claude-workspace.yaml" "$TEST_DIR"

# Verify core files exist
PASS=0
FAIL=0

check() {
  if [ "$1" = "-d" ]; then
    if [ -d "$2" ]; then
      PASS=$((PASS + 1))
    else
      echo "FAIL: directory missing: $2"
      FAIL=$((FAIL + 1))
    fi
  else
    if [ -f "$1" ]; then
      PASS=$((PASS + 1))
    else
      echo "FAIL: file missing: $1"
      FAIL=$((FAIL + 1))
    fi
  fi
}

# Core agents
check "$TEST_DIR/.claude/agents/lead-orchestrator.md"
check "$TEST_DIR/.claude/agents/quality-validator.md"
check -d "$TEST_DIR/.claude/agents/shared"

# Core hooks
check "$TEST_DIR/.claude/hooks/ethicalValidator.js"
check "$TEST_DIR/.claude/hooks/autoFormatter.js"
check "$TEST_DIR/.claude/hooks/contextMonitor.js"

# Core commands (8)
for cmd in check-health verify-app config-backup dev-docs save-and-compact resume review draft-commits; do
  check "$TEST_DIR/.claude/commands/$cmd.md"
done

# Core skills (8)
for skill in verification-loop hook-creator skill-creator slash-command-creator subagent-creator agent-improvement agent-observability external-memory; do
  check -d "$TEST_DIR/.claude/skills/$skill"
done

# Settings and checksums
check "$TEST_DIR/.claude/settings.json"
check "$TEST_DIR/.claude/.checksums"

# Registries
check "$TEST_DIR/.claude/agents-registry.json"
check "$TEST_DIR/.claude/commands-registry.json"

# Checklists
check "$TEST_DIR/.claude/checklists/code-review.md"
check "$TEST_DIR/.claude/checklists/deployment.md"

# CLAUDE.md
check "$TEST_DIR/CLAUDE.md"

# Verify CLAUDE.md contains project name
if grep -q "test-core-project" "$TEST_DIR/CLAUDE.md"; then
  PASS=$((PASS + 1))
else
  echo "FAIL: project name not in CLAUDE.md"
  FAIL=$((FAIL + 1))
fi

# Verify CLAUDE.md contains project description
if grep -q "A test project for core-only installation" "$TEST_DIR/CLAUDE.md"; then
  PASS=$((PASS + 1))
else
  echo "FAIL: project description not in CLAUDE.md"
  FAIL=$((FAIL + 1))
fi

# Verify CLAUDE.md does NOT contain react-typescript conditional sections
if grep -q "React/TypeScript Specifics" "$TEST_DIR/CLAUDE.md"; then
  echo "FAIL: react-typescript conditional section found in core-only CLAUDE.md"
  FAIL=$((FAIL + 1))
else
  PASS=$((PASS + 1))
fi

# Verify NO addon files exist
if [ -f "$TEST_DIR/.claude/agents/web-ui-specialist.md" ]; then
  echo "FAIL: addon agent found in core-only install"
  FAIL=$((FAIL + 1))
else
  PASS=$((PASS + 1))
fi

if [ -f "$TEST_DIR/.claude/hooks/prettierFormatter.js" ]; then
  echo "FAIL: addon hook found in core-only install"
  FAIL=$((FAIL + 1))
else
  PASS=$((PASS + 1))
fi

if [ -f "$TEST_DIR/.claude/commands/test-coverage.md" ]; then
  echo "FAIL: addon command found in core-only install"
  FAIL=$((FAIL + 1))
else
  PASS=$((PASS + 1))
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -eq 0 ]; then
  echo "PASSED: test-core-only"
  exit 0
else
  echo "FAILED: test-core-only"
  exit 1
fi
