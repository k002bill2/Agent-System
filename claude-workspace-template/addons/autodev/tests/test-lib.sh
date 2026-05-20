#!/usr/bin/env bash
# Unit tests for lib.sh — runs on host, no Docker needed.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/assert.sh"
source "$HERE/../scripts/lib.sh"

echo "test: autodev_load_config applies defaults"
tmp=$(mktemp)
echo 'GATE_TEST="echo hi"' > "$tmp"
autodev_load_config "$tmp"
assert_eq "$COVERAGE_THRESHOLD" "80" "default COVERAGE_THRESHOLD=80"
assert_eq "$MAX_ITERATIONS" "30" "default MAX_ITERATIONS=30"
assert_eq "$GATE_TEST" "echo hi" "config value loaded"
rm -f "$tmp"

echo "test: autodev_load_config dies on missing file"
assert_fail "missing config aborts" autodev_load_config /nonexistent/path

echo "test: autodev_total_cost sums total_cost_usd from logs"
logdir=$(mktemp -d)
echo '{"type":"result","total_cost_usd":0.10}' > "$logdir/iter-001.jsonl"
echo '{"type":"result","total_cost_usd":0.25}' > "$logdir/iter-002.jsonl"
total=$(autodev_total_cost "$logdir")
assert_eq "$total" "0.35" "total cost = 0.35"
rm -rf "$logdir"

echo "test: autodev_total_cost on empty dir returns 0"
emptydir=$(mktemp -d)
empty_total=$(autodev_total_cost "$emptydir")
assert_eq "$empty_total" "0" "empty log dir → cost 0"
rm -rf "$emptydir"

echo "test: verify.sh 게이트 — 통과 케이스"
work=$(mktemp -d); mkdir -p "$work/repo"
cat > "$work/autodev.config.sh" <<'CFG'
GATE_TYPECHECK='true'
GATE_LINT='true'
GATE_TEST='true'
GATE_BUILD='true'
GATE_COVERAGE_CMD=''
CFG
WORKSPACE_OVERRIDE="$work" bash "$HERE/../scripts/verify.sh"
assert_eq "$?" "0" "모든 게이트 true → verify.sh exit 0"

echo "test: verify.sh 게이트 — 실패 케이스"
cat > "$work/autodev.config.sh" <<'CFG'
GATE_TYPECHECK='true'
GATE_LINT='false'
GATE_TEST='true'
GATE_BUILD='true'
GATE_COVERAGE_CMD=''
CFG
WORKSPACE_OVERRIDE="$work" bash "$HERE/../scripts/verify.sh"; rc=$?
assert_eq "$rc" "1" "게이트 1개 false → verify.sh exit 1"
rm -rf "$work"

echo "test: verify.sh 커버리지 게이트 — 임계값 이상 통과 (소수 포함)"
covwork=$(mktemp -d); mkdir -p "$covwork/repo"
cat > "$covwork/autodev.config.sh" <<'CFG'
GATE_TYPECHECK='true'
GATE_LINT='true'
GATE_TEST='true'
GATE_BUILD='true'
GATE_COVERAGE_CMD='printf "Name  Stmts  Miss  Cover\nTOTAL   245    41   83.5%%\n"'
COVERAGE_THRESHOLD=80
CFG
WORKSPACE_OVERRIDE="$covwork" bash "$HERE/../scripts/verify.sh"; rc=$?
assert_eq "$rc" "0" "커버리지 83.5% ≥ 80% → exit 0"

echo "test: verify.sh 커버리지 게이트 — 임계값 미만 실패"
cat > "$covwork/autodev.config.sh" <<'CFG'
GATE_TYPECHECK='true'
GATE_LINT='true'
GATE_TEST='true'
GATE_BUILD='true'
GATE_COVERAGE_CMD='printf "Name  Stmts  Miss  Cover\nTOTAL   245   200   18%%\n"'
COVERAGE_THRESHOLD=80
CFG
WORKSPACE_OVERRIDE="$covwork" bash "$HERE/../scripts/verify.sh"; rc=$?
assert_eq "$rc" "1" "커버리지 18% < 80% → exit 1"
rm -rf "$covwork"

assert_summary
