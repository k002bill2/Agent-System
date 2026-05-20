#!/usr/bin/env bash
# 기계적 품질 게이트. 모든 게이트가 exit 0이면 0, 아니면 1.
# LLM 판단이 필요한 리뷰는 포함하지 않는다 (ralph.sh가 독립 재실행하므로).
set -uo pipefail
source /opt/autodev/scripts/lib.sh 2>/dev/null \
  || source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# 테스트는 WORKSPACE_OVERRIDE로 작업공간을 바꾼다.
WS="${WORKSPACE_OVERRIDE:-/workspace}"
autodev_load_config "$WS/autodev.config.sh" || exit 1
cd "$WS/repo" 2>/dev/null || cd "$WS"

run_gate() {  # $1=name $2=cmd
  local name="$1" cmd="$2"
  if [ -z "$cmd" ]; then autodev_log "게이트 $name: 건너뜀"; return 0; fi
  autodev_log "게이트 $name: 실행..."
  if bash -c "$cmd"; then autodev_log "게이트 $name: PASS"; return 0
  else autodev_log "게이트 $name: FAIL"; return 1; fi
}

fail=0
run_gate typecheck "${GATE_TYPECHECK:-}" || fail=1
run_gate lint      "${GATE_LINT:-}"      || fail=1
run_gate test      "${GATE_TEST:-}"      || fail=1
run_gate build     "${GATE_BUILD:-}"     || fail=1

# 커버리지 게이트
if [ -n "${GATE_COVERAGE_CMD:-}" ]; then
  autodev_log "게이트 coverage: 실행..."
  pct=$(bash -c "$GATE_COVERAGE_CMD" 2>&1 \
        | grep -oE 'TOTAL[^0-9]*[0-9]+%' | grep -oE '[0-9]+%' | tr -d '%' | tail -1)
  if [ -z "$pct" ]; then
    autodev_log "게이트 coverage: FAIL (커버리지 수치 파싱 실패)"; fail=1
  elif [ "$pct" -lt "${COVERAGE_THRESHOLD:-80}" ]; then
    autodev_log "게이트 coverage: FAIL ($pct% < ${COVERAGE_THRESHOLD}%)"; fail=1
  else
    autodev_log "게이트 coverage: PASS ($pct%)"
  fi
fi

[ "$fail" -eq 0 ] && autodev_log "모든 게이트 통과." || autodev_log "게이트 실패."
exit "$fail"
