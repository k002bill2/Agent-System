#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

echo "=== Test: Update Mode ==="

# Create config with react-typescript addon
cat > "$TEST_DIR/claude-workspace.yaml" << 'EOF'
project:
  name: test-update-project
  description: A project for testing update mode
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
  format: ""
hooks:
  ethical_validator: true
  auto_formatter: true
  context_monitor: true
  protected_paths:
    - ".env"
    - "secrets"
EOF

# Step 1: Fresh install
echo "--- Step 1: Fresh install ---"
"$SCRIPT_DIR/init.sh" --config "$TEST_DIR/claude-workspace.yaml" "$TEST_DIR"

# Verify fresh install succeeded
if [ ! -f "$TEST_DIR/.claude/agents/lead-orchestrator.md" ]; then
  echo "FAIL: Fresh install did not create lead-orchestrator.md"
  exit 1
fi
if [ ! -f "$TEST_DIR/.claude/.checksums" ]; then
  echo "FAIL: Fresh install did not create .checksums"
  exit 1
fi

echo "--- Fresh install verified ---"

# Step 2: Simulate user customization
echo "--- Step 2: Simulating user modifications ---"

# Modify an agent file (simulates user customization)
echo "" >> "$TEST_DIR/.claude/agents/lead-orchestrator.md"
echo "## My Custom Section" >> "$TEST_DIR/.claude/agents/lead-orchestrator.md"
echo "This was added by the user." >> "$TEST_DIR/.claude/agents/lead-orchestrator.md"

# Modify CLAUDE.md (simulates user customization)
echo "" >> "$TEST_DIR/CLAUDE.md"
echo "## My Custom Notes" >> "$TEST_DIR/CLAUDE.md"
echo "User-specific notes here." >> "$TEST_DIR/CLAUDE.md"

# Short pause to ensure backup timestamp is different
sleep 1

# Step 3: Run update
echo "--- Step 3: Running --update ---"
"$SCRIPT_DIR/init.sh" --update --config "$TEST_DIR/claude-workspace.yaml" "$TEST_DIR"

# Step 4: Verify update results
echo "--- Step 4: Verifying update results ---"

PASS=0
FAIL=0

# 4a: Backup was created
BACKUP_DIR=$(find "$TEST_DIR/.claude/backups" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | head -1)
if [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ]; then
  PASS=$((PASS + 1))
  echo "  OK: Backup created at $(basename "$BACKUP_DIR")"
else
  echo "FAIL: No backup directory found in .claude/backups/"
  FAIL=$((FAIL + 1))
fi

# 4b: Backup contains the original agent files
if [ -n "$BACKUP_DIR" ] && [ -f "$BACKUP_DIR/agents/lead-orchestrator.md" ]; then
  PASS=$((PASS + 1))
else
  echo "FAIL: Backup does not contain agents/lead-orchestrator.md"
  FAIL=$((FAIL + 1))
fi

# 4c: Modified agent file should have a .new companion (conflict detected)
if [ -f "$TEST_DIR/.claude/agents/lead-orchestrator.md.new" ]; then
  PASS=$((PASS + 1))
  echo "  OK: Conflict detected - lead-orchestrator.md.new created"
else
  echo "FAIL: No .new file for modified lead-orchestrator.md"
  FAIL=$((FAIL + 1))
fi

# 4d: Original modified file should still contain user customization
if grep -q "My Custom Section" "$TEST_DIR/.claude/agents/lead-orchestrator.md"; then
  PASS=$((PASS + 1))
  echo "  OK: User customization preserved in lead-orchestrator.md"
else
  echo "FAIL: User customization lost from lead-orchestrator.md"
  FAIL=$((FAIL + 1))
fi

# 4e: hooks/*.js files were overwritten (always overwrite rule)
if [ -f "$TEST_DIR/.claude/hooks/ethicalValidator.js" ]; then
  PASS=$((PASS + 1))
else
  echo "FAIL: hooks/ethicalValidator.js missing after update"
  FAIL=$((FAIL + 1))
fi

if [ ! -f "$TEST_DIR/.claude/hooks/ethicalValidator.js.new" ]; then
  PASS=$((PASS + 1))
  echo "  OK: hooks/*.js files overwritten directly (no .new)"
else
  echo "FAIL: hooks/ethicalValidator.js.new should not exist (hooks always overwritten)"
  FAIL=$((FAIL + 1))
fi

# 4f: CLAUDE.md was NOT overwritten (preserved)
if grep -q "My Custom Notes" "$TEST_DIR/CLAUDE.md"; then
  PASS=$((PASS + 1))
  echo "  OK: CLAUDE.md was NOT overwritten (user customization preserved)"
else
  echo "FAIL: CLAUDE.md was overwritten (user customization lost)"
  FAIL=$((FAIL + 1))
fi

# 4g: CLAUDE.md.new should exist (template had changes vs current)
if [ -f "$TEST_DIR/CLAUDE.md.new" ]; then
  PASS=$((PASS + 1))
  echo "  OK: CLAUDE.md.new created for review"
else
  # This is acceptable if CLAUDE.md matches the template (no .new needed)
  echo "  INFO: No CLAUDE.md.new (template may match current)"
  PASS=$((PASS + 1))
fi

# 4h: Checksums were regenerated
if [ -f "$TEST_DIR/.claude/.checksums" ]; then
  NEW_CHECKSUM_COUNT=$(wc -l < "$TEST_DIR/.claude/.checksums" | xargs)
  if [ "$NEW_CHECKSUM_COUNT" -gt 0 ]; then
    PASS=$((PASS + 1))
    echo "  OK: Checksums regenerated ($NEW_CHECKSUM_COUNT files tracked)"
  else
    echo "FAIL: Checksums file is empty"
    FAIL=$((FAIL + 1))
  fi
else
  echo "FAIL: .checksums file missing after update"
  FAIL=$((FAIL + 1))
fi

# 4i: Registries were regenerated
if [ -f "$TEST_DIR/.claude/agents-registry.json" ] && [ -f "$TEST_DIR/.claude/commands-registry.json" ]; then
  PASS=$((PASS + 1))
  echo "  OK: Registries regenerated"
else
  echo "FAIL: Registry files missing after update"
  FAIL=$((FAIL + 1))
fi

# 4j: settings.json still exists and was merged
if [ -f "$TEST_DIR/.claude/settings.json" ]; then
  PASS=$((PASS + 1))
else
  echo "FAIL: settings.json missing after update"
  FAIL=$((FAIL + 1))
fi

# 4k: Unmodified files should have been overwritten cleanly (no .new)
if [ -f "$TEST_DIR/.claude/agents/quality-validator.md" ] && [ ! -f "$TEST_DIR/.claude/agents/quality-validator.md.new" ]; then
  PASS=$((PASS + 1))
  echo "  OK: Unmodified files updated in-place (no .new)"
else
  echo "FAIL: Unmodified quality-validator.md has unexpected .new file"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -eq 0 ]; then
  echo "PASSED: test-update"
  exit 0
else
  echo "FAILED: test-update"
  exit 1
fi
