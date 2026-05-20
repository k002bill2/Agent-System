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

assert_summary
