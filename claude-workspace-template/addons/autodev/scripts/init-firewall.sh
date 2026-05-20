#!/usr/bin/env bash
# 네트워크 allowlist: 승인된 도메인 외 모든 egress 차단.
# root로 실행되며 권한 강등 전에 호출된다. NET_ADMIN capability 필요.
set -euo pipefail

EXTRA_ALLOWED_DOMAINS="${EXTRA_ALLOWED_DOMAINS:-}"

ALLOWED_DOMAINS=(
  api.anthropic.com
  registry.npmjs.org
  pypi.org
  files.pythonhosted.org
  github.com
  api.github.com
  codeload.github.com
  objects.githubusercontent.com
)
# shellcheck disable=SC2206
ALLOWED_DOMAINS+=( ${EXTRA_ALLOWED_DOMAINS} )

echo "[firewall] 기본 정책 DROP 설정..."
iptables -F
iptables -X 2>/dev/null || true
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

# loopback
iptables -A INPUT  -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# 기설정 연결
iptables -A INPUT  -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# DNS (허용 도메인 해석에 필요)
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT
iptables -A INPUT  -p udp --sport 53 -j ACCEPT
iptables -A INPUT  -p tcp --sport 53 -j ACCEPT

# IPv6 전면 차단 (allowlist는 IPv4 전용 — v6 egress는 유출 경로)
sysctl -w net.ipv6.conf.all.disable_ipv6=1     >/dev/null 2>&1 || true
sysctl -w net.ipv6.conf.default.disable_ipv6=1 >/dev/null 2>&1 || true
if command -v ip6tables >/dev/null 2>&1; then
  ip6tables -F 2>/dev/null || true
  for chain in INPUT FORWARD OUTPUT; do
    ip6tables -P "$chain" DROP 2>/dev/null || true
  done
  ip6tables -A INPUT  -i lo -j ACCEPT 2>/dev/null || true
  ip6tables -A OUTPUT -o lo -j ACCEPT 2>/dev/null || true
fi
echo "[firewall] IPv6 egress 차단."

# allowlist ipset
ipset destroy autodev-allow 2>/dev/null || true
ipset create autodev-allow hash:ip

for domain in "${ALLOWED_DOMAINS[@]}"; do
  [ -z "$domain" ] && continue
  ips=$(getent ahostsv4 "$domain" | awk '{print $1}' | sort -u)
  if [ -z "$ips" ]; then
    echo "[firewall] FATAL: '$domain' 해석 실패" >&2
    exit 1
  fi
  for ip in $ips; do
    ipset add autodev-allow "$ip" 2>/dev/null || true
    echo "[firewall] allow $domain -> $ip"
  done
done

iptables -A OUTPUT -p tcp --dport 443 -m set --match-set autodev-allow dst -j ACCEPT
iptables -A OUTPUT -p tcp --dport 80  -m set --match-set autodev-allow dst -j ACCEPT

echo "[firewall] allowlist 적용 완료 (${#ALLOWED_DOMAINS[@]} 도메인)."
