#!/usr/bin/env bash
# 컨테이너 부팅 시퀀스: 방화벽 → 자가검증 → 인증검증 → clone → 권한강등.
set -euo pipefail
source /opt/autodev/scripts/lib.sh
autodev_load_config /workspace/autodev.config.sh

# --- 1. 방화벽 ---
autodev_log "방화벽 적용 중..."
EXTRA_ALLOWED_DOMAINS="${EXTRA_ALLOWED_DOMAINS:-}" /opt/autodev/scripts/init-firewall.sh

# --- 2. 방화벽 자가검증 ---
autodev_log "방화벽 검증 중..."
if curl -fsS --max-time 5 https://example.com >/dev/null 2>&1; then
  autodev_die "방화벽 미적용 — example.com 도달 가능"
fi
code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 https://api.anthropic.com 2>/dev/null) || code="000"
[ "$code" = "000" ] && autodev_die "api.anthropic.com 도달 불가 — 방화벽 과차단"
autodev_log "방화벽 OK."

# --- 3. 인증 자가검증 (종량제 경로 차단) ---
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN
[ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] || autodev_die "CLAUDE_CODE_OAUTH_TOKEN 미설정"
autodev_log "인증 OK — 구독 OAuth 토큰 확인."

# --- 4. 레포 클론 ---
autodev_log "레포 클론 중..."
mkdir -p /workspace/state /workspace/logs
[ -d /host-repo/.git ] || autodev_die "/host-repo가 git 레포가 아님"
git clone /host-repo /workspace/repo
cd /workspace/repo
branch="autodev/$(date -u +%Y%m%d-%H%M%S)"
git checkout -b "$branch"
git config user.name  "autodev"
git config user.email "autodev@local"
echo "$branch" > /workspace/state/branch
autodev_log "작업 브랜치: $branch"

# --- 5. 권한 강등 후 루프 시작 ---
chown -R devagent:devagent /workspace/repo /workspace/state /workspace/logs
autodev_log "devagent로 강등, 루프 시작..."
exec gosu devagent /opt/autodev/scripts/ralph.sh
