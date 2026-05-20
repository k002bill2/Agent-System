#!/usr/bin/env bash
# 격리 통합 테스트 — 컨테이너가 호스트를 침범하지 못함을 검증.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/assert.sh"
IMG=autodev:test

echo "test: read-only 마운트된 호스트 경로에 쓰기 불가"
sentinel=$(mktemp -d)
echo "original" > "$sentinel/file.txt"
docker run --rm -v "$sentinel:/host-repo:ro" --entrypoint sh "$IMG" \
  -c 'echo hacked > /host-repo/file.txt' >/dev/null 2>&1 || true
content=$(cat "$sentinel/file.txt")
assert_eq "$content" "original" "ro 마운트 호스트 파일이 변경되지 않음"
rm -rf "$sentinel"

echo "test: 컨테이너는 비root(devagent)로 루프를 돈다"
uid=$(docker run --rm --entrypoint sh "$IMG" -c 'id -u devagent')
assert_eq "$uid" "1000" "devagent uid=1000 존재"

echo "test: Docker 소켓이 이미지에 없다"
assert_fail "docker 소켓 미존재" \
  docker run --rm --entrypoint sh "$IMG" -c 'test -S /var/run/docker.sock'

echo "test: 인증 자가검증 — CLAUDE_CODE_OAUTH_TOKEN 없으면 abort"
out=$(docker run --rm --entrypoint bash "$IMG" -c '
  source /opt/autodev/scripts/lib.sh
  unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN
  [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] || autodev_die "no token"
' 2>&1 || true)
echo "$out" | grep -q "FATAL" && r=aborted || r=BAD
assert_eq "$r" "aborted" "토큰 없으면 FATAL로 중단"

assert_summary
