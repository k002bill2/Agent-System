#!/usr/bin/env bash
# 루프 e2e — AUTODEV_DRY_RUN=1로 mock-claude를 써서 구독 토큰/과금 없이
# 루프 메커니즘 전체(iteration, 가짜완료 가드, 완료 처리)를 검증한다.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/assert.sh"
IMG=autodev:test

# 더미 대상 레포 준비 (git 레포 + 통과하는 게이트)
work=$(mktemp -d)
git -C "$work" init -q
git -C "$work" config user.email t@t; git -C "$work" config user.name t
echo "# dummy" > "$work/README.md"
git -C "$work" add -A && git -C "$work" commit -q -m "init"
cat > "$work/autodev.config.sh" <<'CFG'
GATE_TYPECHECK='true'
GATE_LINT='true'
GATE_TEST='true'
GATE_BUILD='true'
GATE_COVERAGE_CMD=''
MAX_ITERATIONS=10
STALL_LIMIT=3
COST_CAP_USD=100
CFG
mkdir -p "$work/run/state" "$work/run/logs"
echo "dummy spec" > "$work/run/state/SPEC.md"

echo "test: dry-run 루프가 완료까지 돈다"
docker run --rm \
  --cap-drop ALL --cap-add NET_ADMIN --cap-add NET_RAW \
  -e AUTODEV_DRY_RUN=1 \
  -e CLAUDE_CODE_OAUTH_TOKEN=dummy-token \
  -v "$work:/host-repo:ro" \
  -v "$work/run/state:/workspace/state" \
  -v "$work/run/logs:/workspace/logs" \
  -v "$work/autodev.config.sh:/workspace/autodev.config.sh:ro" \
  "$IMG" >/dev/null 2>&1 || true

assert_ok "COMPLETED sentinel 생성됨" test -f "$work/run/state/COMPLETED"
assert_ok "DONE sentinel 생성됨"      test -f "$work/run/state/DONE"
assert_ok "iteration 로그 존재"        test -f "$work/run/logs/iter-001.jsonl"
verdict=$(head -1 "$work/run/state/FINAL-REVIEW.md" 2>/dev/null || echo MISSING)
assert_eq "$verdict" "FINAL-REVIEW: PASS" "최종 리뷰 PASS 기록됨"

echo "test: 가짜 완료 가드 — 게이트 실패 시 DONE 거부"
work2=$(mktemp -d)
git -C "$work2" init -q
git -C "$work2" config user.email t@t; git -C "$work2" config user.name t
echo x > "$work2/README.md"
git -C "$work2" add -A && git -C "$work2" commit -q -m init
cat > "$work2/autodev.config.sh" <<'CFG'
GATE_TYPECHECK='true'
GATE_LINT='false'
GATE_TEST='true'
GATE_BUILD='true'
GATE_COVERAGE_CMD=''
MAX_ITERATIONS=5
STALL_LIMIT=10
COST_CAP_USD=100
CFG
mkdir -p "$work2/run/state" "$work2/run/logs"
echo spec > "$work2/run/state/SPEC.md"
docker run --rm --cap-drop ALL --cap-add NET_ADMIN --cap-add NET_RAW \
  -e AUTODEV_DRY_RUN=1 -e CLAUDE_CODE_OAUTH_TOKEN=dummy \
  -v "$work2:/host-repo:ro" \
  -v "$work2/run/state:/workspace/state" \
  -v "$work2/run/logs:/workspace/logs" \
  -v "$work2/autodev.config.sh:/workspace/autodev.config.sh:ro" \
  "$IMG" >/dev/null 2>&1 || true
assert_fail "게이트 실패 시 COMPLETED 미생성" test -f "$work2/run/state/COMPLETED"

rm -rf "$work" "$work2"
assert_summary
