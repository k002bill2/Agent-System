#!/usr/bin/env bash
# 방화벽 통합 테스트 — 빌드된 이미지를 NET_ADMIN으로 실행해 검증.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/assert.sh"
IMG=autodev:test

echo "test: 방화벽 적용 후 차단 도메인은 막히고 허용 도메인은 통한다"
out=$(docker run --rm --cap-drop ALL --cap-add NET_ADMIN --cap-add NET_RAW \
  --entrypoint sh "$IMG" -c '
    if ! EXTRA_ALLOWED_DOMAINS="" /opt/autodev/scripts/init-firewall.sh >/dev/null 2>&1; then
      echo "FIREWALL_INIT_FAILED"; exit 1
    fi
    # 차단되어야 함 (allowlist에 없음)
    if curl -fsS --max-time 5 https://example.com >/dev/null 2>&1; then
      echo "BLOCKED_DOMAIN_REACHABLE"; else echo "blocked_ok"; fi
    # 허용되어야 함 (api.anthropic.com — 401이라도 TCP 연결되면 OK)
    code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 https://api.anthropic.com || echo 000)
    if [ "$code" = "000" ]; then echo "ALLOWED_DOMAIN_UNREACHABLE"; else echo "allowed_ok"; fi
    # ICMP egress는 차단되어야 함 (OUTPUT 기본정책 DROP)
    if ping -c1 -W2 1.1.1.1 >/dev/null 2>&1; then echo "icmp_reachable"; else echo "icmp_blocked"; fi
  ')
echo "$out"
echo "$out" | grep -q "blocked_ok"  && blk=blocked_ok  || blk=BAD
echo "$out" | grep -q "allowed_ok"  && alw=allowed_ok  || alw=BAD
assert_eq "$blk" "blocked_ok"  "차단 도메인(example.com)이 막힘"
assert_eq "$alw" "allowed_ok"  "허용 도메인(api.anthropic.com)이 통함"
echo "$out" | grep -q "icmp_blocked" && icmp=icmp_blocked || icmp=BAD
assert_eq "$icmp" "icmp_blocked"  "ICMP egress가 차단됨"

assert_summary
