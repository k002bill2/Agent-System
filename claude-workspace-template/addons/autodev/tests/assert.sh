#!/usr/bin/env bash
# Minimal shell assertion helpers. Source this in test scripts.
ASSERT_PASS=0
ASSERT_FAIL=0

assert_eq() {  # $1=actual $2=expected $3=label
  if [ "$1" = "$2" ]; then
    ASSERT_PASS=$((ASSERT_PASS+1)); echo "  PASS: $3"
  else
    ASSERT_FAIL=$((ASSERT_FAIL+1)); echo "  FAIL: $3 (got '$1', want '$2')"
  fi
}

assert_ok() {  # $1=label ; runs remaining args as command
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then
    ASSERT_PASS=$((ASSERT_PASS+1)); echo "  PASS: $label"
  else
    ASSERT_FAIL=$((ASSERT_FAIL+1)); echo "  FAIL: $label (command failed: $*)"
  fi
}

assert_fail() {  # $1=label ; expects remaining args to FAIL
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then
    ASSERT_FAIL=$((ASSERT_FAIL+1)); echo "  FAIL: $label (command unexpectedly succeeded)"
  else
    ASSERT_PASS=$((ASSERT_PASS+1)); echo "  PASS: $label"
  fi
}

assert_summary() {
  echo "---"
  echo "passed: $ASSERT_PASS  failed: $ASSERT_FAIL"
  [ "$ASSERT_FAIL" -eq 0 ]
}
