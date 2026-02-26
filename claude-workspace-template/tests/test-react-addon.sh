#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

echo "=== Test: Core + react-typescript Addon Installation ==="

# Create config with react-typescript addon
cat > "$TEST_DIR/claude-workspace.yaml" << 'EOF'
project:
  name: test-react-project
  description: A React TypeScript test project
  language: en
addons:
  - react-typescript
paths:
  src: src
  tests: tests
  docs: docs
commands:
  typecheck: "npx tsc --noEmit"
  lint: "npx eslint ."
  test: "npx vitest run"
  build: "npm run build"
  format: "npx prettier --write ."
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

# Verify
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

# === Core files still present ===
echo "--- Checking core files ---"

# Core agents
check "$TEST_DIR/.claude/agents/lead-orchestrator.md"
check "$TEST_DIR/.claude/agents/quality-validator.md"
check -d "$TEST_DIR/.claude/agents/shared"

# Core hooks
check "$TEST_DIR/.claude/hooks/ethicalValidator.js"
check "$TEST_DIR/.claude/hooks/autoFormatter.js"
check "$TEST_DIR/.claude/hooks/contextMonitor.js"

# Core commands
for cmd in check-health verify-app config-backup dev-docs save-and-compact resume review draft-commits; do
  check "$TEST_DIR/.claude/commands/$cmd.md"
done

# Core skills
for skill in verification-loop hook-creator skill-creator slash-command-creator subagent-creator agent-improvement agent-observability external-memory; do
  check -d "$TEST_DIR/.claude/skills/$skill"
done

# === React-typescript addon files ===
echo "--- Checking react-typescript addon files ---"

# React agents
check "$TEST_DIR/.claude/agents/web-ui-specialist.md"
check "$TEST_DIR/.claude/agents/performance-optimizer.md"
check "$TEST_DIR/.claude/agents/test-automation-specialist.md"

# React hook
check "$TEST_DIR/.claude/hooks/prettierFormatter.js"

# React commands
check "$TEST_DIR/.claude/commands/test-coverage.md"
check "$TEST_DIR/.claude/commands/start-dev-server.md"

# React skills
check -d "$TEST_DIR/.claude/skills/react-web-development"
check -d "$TEST_DIR/.claude/skills/test-automation"
check -d "$TEST_DIR/.claude/skills/verify-ui"
check "$TEST_DIR/.claude/skills/react-web-development/SKILL.md"
check "$TEST_DIR/.claude/skills/test-automation/SKILL.md"
check "$TEST_DIR/.claude/skills/verify-ui/SKILL.md"

# === Settings and registries ===
echo "--- Checking settings and registries ---"

check "$TEST_DIR/.claude/settings.json"
check "$TEST_DIR/.claude/.checksums"
check "$TEST_DIR/.claude/agents-registry.json"
check "$TEST_DIR/.claude/commands-registry.json"

# === CLAUDE.md checks ===
echo "--- Checking CLAUDE.md content ---"

check "$TEST_DIR/CLAUDE.md"

# Verify project name in CLAUDE.md
if grep -q "test-react-project" "$TEST_DIR/CLAUDE.md"; then
  PASS=$((PASS + 1))
else
  echo "FAIL: project name not in CLAUDE.md"
  FAIL=$((FAIL + 1))
fi

# Verify react-typescript conditional section IS present
if grep -q "React/TypeScript Specifics" "$TEST_DIR/CLAUDE.md"; then
  PASS=$((PASS + 1))
else
  echo "FAIL: react-typescript conditional section missing from CLAUDE.md"
  FAIL=$((FAIL + 1))
fi

# Verify react path alias mention
if grep -q "@/components" "$TEST_DIR/CLAUDE.md"; then
  PASS=$((PASS + 1))
else
  echo "FAIL: react path alias (@/components) not in CLAUDE.md"
  FAIL=$((FAIL + 1))
fi

# Verify eval-system section is NOT present (not installed)
if grep -q "Eval System" "$TEST_DIR/CLAUDE.md"; then
  echo "FAIL: eval-system section found but addon not installed"
  FAIL=$((FAIL + 1))
else
  PASS=$((PASS + 1))
fi

# Verify the commands in CLAUDE.md include the test command from config
if grep -q "npx vitest run" "$TEST_DIR/CLAUDE.md"; then
  PASS=$((PASS + 1))
else
  echo "FAIL: configured test command not in CLAUDE.md"
  FAIL=$((FAIL + 1))
fi

# === Registry content checks ===
echo "--- Checking registry content ---"

# agents-registry should include react agents
if grep -q "web-ui-specialist" "$TEST_DIR/.claude/agents-registry.json"; then
  PASS=$((PASS + 1))
else
  echo "FAIL: web-ui-specialist not in agents-registry.json"
  FAIL=$((FAIL + 1))
fi

# commands-registry should include react commands
if grep -q "test-coverage" "$TEST_DIR/.claude/commands-registry.json"; then
  PASS=$((PASS + 1))
else
  echo "FAIL: test-coverage not in commands-registry.json"
  FAIL=$((FAIL + 1))
fi

# === Settings.json hooks patch check ===
echo "--- Checking settings.json hooks merge ---"

# The prettierFormatter hook-patch should be merged into settings.json
if grep -q "prettierFormatter" "$TEST_DIR/.claude/settings.json"; then
  PASS=$((PASS + 1))
else
  echo "FAIL: prettierFormatter hook not merged into settings.json"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -eq 0 ]; then
  echo "PASSED: test-react-addon"
  exit 0
else
  echo "FAILED: test-react-addon"
  exit 1
fi
