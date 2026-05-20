#!/usr/bin/env bash
# AUTODEV_DRY_RUN=1일 때 claude -p를 대체한다. 구독 토큰·과금 없이
# 루프 메커니즘을 검증하기 위한 결정론적 대역.
# 사용: mock-claude.sh <prompt-file> <log-file>
set -uo pipefail
prompt="${1:?}"; log="${2:?}"
STATE=/workspace/state
REPO=/workspace/repo

# 최종 리뷰어 호출이면 PASS verdict를 쓴다.
if [[ "$prompt" == *REVIEWER* ]]; then
  echo "FINAL-REVIEW: PASS" > "$STATE/FINAL-REVIEW.md"
  echo "mock reviewer: approved" >> "$STATE/FINAL-REVIEW.md"
  echo '{"type":"result","total_cost_usd":0.005}' | tee "$log"
  exit 0
fi

# orchestrator 호출: 처음 2회는 커밋, 3회째에 DONE.
n=$(cat "$STATE/.mock-counter" 2>/dev/null || echo 0)
n=$((n+1)); echo "$n" > "$STATE/.mock-counter"
cd "$REPO"
if [ "$n" -le 2 ]; then
  echo "mock iteration $n" >> mock-progress.txt
  git add -A && git commit -q -m "chore: mock autodev iteration $n"
  echo "mock orchestrator: committed iteration $n" >&2
else
  touch "$STATE/DONE"
  echo "mock orchestrator: wrote DONE" >&2
fi
echo "{\"type\":\"result\",\"total_cost_usd\":0.01,\"iteration\":$n}" | tee "$log"
