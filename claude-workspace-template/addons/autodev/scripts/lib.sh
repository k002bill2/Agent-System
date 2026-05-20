#!/usr/bin/env bash
# Shared helpers for autodev scripts. Source this; do not execute.

autodev_log() { printf '[autodev %s] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
autodev_die() { autodev_log "FATAL: $*"; exit 1; }

# Load a sourceable bash config file and apply defaults for unset values.
autodev_load_config() {
  local cfg="${1:-}"
  [ -n "$cfg" ] && [ -f "$cfg" ] || { autodev_log "FATAL: config not found: $cfg"; return 1; }
  # shellcheck disable=SC1090
  source "$cfg"
  : "${COVERAGE_THRESHOLD:=80}"
  : "${MAX_ITERATIONS:=30}"
  : "${MAX_TURNS:=60}"
  : "${ITERATION_TIMEOUT:=3600}"
  : "${STALL_LIMIT:=3}"
  : "${COST_CAP_USD:=50}"
  : "${AUTODEV_MODEL:=opus}"
  : "${GIT_REMOTE:=origin}"
  : "${BASE_BRANCH:=main}"
  : "${EXTRA_ALLOWED_DOMAINS:=}"
  : "${RES_MEMORY:=8g}"
  : "${RES_CPUS:=4}"
  : "${RES_PIDS:=512}"
}

# Sum every total_cost_usd value across iteration JSONL logs.
autodev_total_cost() {
  local logs="$1" total=0 c f
  for f in "$logs"/iter-*.jsonl "$logs"/final-review.jsonl; do
    [ -f "$f" ] || continue
    c=$(grep -oE '"total_cost_usd":[0-9.eE+-]+' "$f" | tail -1 | cut -d: -f2)
    [ -n "$c" ] && total=$(awk "BEGIN{printf \"%g\", $total + $c}")
  done
  echo "$total"
}
