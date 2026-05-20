#!/usr/bin/env bash
# 바깥 Ralph 루프. devagent로 실행된다.
set -uo pipefail
source /opt/autodev/scripts/lib.sh
autodev_load_config /workspace/autodev.config.sh

REPO=/workspace/repo
STATE=/workspace/state
LOGS=/workspace/logs
mkdir -p "$STATE" "$LOGS"
cd "$REPO"
git rev-parse HEAD > "$STATE/branch-base"

# claude 호출 (dry-run이면 mock으로 대체). $1=프롬프트파일 $2=로그파일
claude_run() {
  if [ "${AUTODEV_DRY_RUN:-0}" = "1" ]; then
    bash /opt/autodev/scripts/mock-claude.sh "$1" "$2"; return $?
  fi
  timeout "$ITERATION_TIMEOUT" claude -p "$(cat "$1")" \
    --output-format stream-json \
    --dangerously-skip-permissions \
    --max-turns "$MAX_TURNS" \
    --model "$AUTODEV_MODEL" \
    --settings /opt/autodev/config/settings.json \
    2>&1 | tee "$2"
}

iter=0
stall=0
prev=$(git rev-parse HEAD)

while [ "$iter" -lt "$MAX_ITERATIONS" ]; do
  [ -f "$STATE/DONE" ]    && { autodev_log "DONE 발견 — 루프 종료"; break; }
  [ -f "$STATE/BLOCKED" ] && { autodev_log "BLOCKED — 루프 종료"; break; }

  iter=$((iter+1))
  log="$LOGS/iter-$(printf '%03d' "$iter").jsonl"
  autodev_log "=== iteration $iter / $MAX_ITERATIONS ==="
  claude_run /opt/autodev/prompts/ORCHESTRATOR.md "$log"

  # 비용 cap
  cost=$(autodev_total_cost "$LOGS")
  autodev_log "누적 비용 추정: \$$cost (cap \$$COST_CAP_USD)"
  if awk "BEGIN{exit !($cost > $COST_CAP_USD)}"; then
    autodev_log "비용 cap 초과"; touch "$STATE/BLOCKED"; break
  fi

  # 가짜 완료 가드 — DONE을 신뢰하지 않고 verify.sh 독립 재실행
  if [ -f "$STATE/DONE" ]; then
    autodev_log "DONE 주장됨 — verify.sh 독립 검증..."
    if ! /opt/autodev/scripts/verify.sh; then
      autodev_log "verify.sh 실패 — DONE 거부, 루프 계속"
      rm -f "$STATE/DONE"
    fi
  fi

  # 정체 감지
  cur=$(git rev-parse HEAD)
  if [ "$cur" = "$prev" ]; then
    stall=$((stall+1))
    autodev_log "이번 iteration 커밋 없음 (정체 $stall/$STALL_LIMIT)"
    if [ "$stall" -ge "$STALL_LIMIT" ]; then
      autodev_log "정체 한도 도달"; touch "$STATE/BLOCKED"; break
    fi
  else
    stall=0; prev=$cur
  fi
done

# 완료 처리
if [ -f "$STATE/DONE" ] && /opt/autodev/scripts/verify.sh; then
  autodev_log "최종 독립 리뷰어 실행..."
  claude_run /opt/autodev/prompts/REVIEWER.md "$LOGS/final-review.jsonl"
  if head -1 "$STATE/FINAL-REVIEW.md" 2>/dev/null | grep -q '^FINAL-REVIEW: PASS'; then
    autodev_log "리뷰어 PASS — PR 생성"
    branch=$(cat "$STATE/branch")
    if [ "${AUTODEV_DRY_RUN:-0}" = "1" ]; then
      autodev_log "[dry-run] PR 생성 생략 — branch=$branch"
      touch "$STATE/COMPLETED"
    elif git push "$GIT_REMOTE" "$branch" \
         && gh pr create --fill --base "$BASE_BRANCH" --head "$branch"; then
      autodev_log "PR 생성 완료"
      touch "$STATE/COMPLETED"
    else
      autodev_log "push/PR 실패 — GH_TOKEN 권한 확인"
      touch "$STATE/BLOCKED"
    fi
  else
    autodev_log "최종 리뷰어 PASS 아님 — BLOCKED"
    touch "$STATE/BLOCKED"
  fi
else
  autodev_log "검증된 완료 없이 루프 종료"
fi
autodev_log "Ralph 루프 종료 — $iter iteration 수행."
