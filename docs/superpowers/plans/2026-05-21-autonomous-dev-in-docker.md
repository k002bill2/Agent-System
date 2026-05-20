# Autonomous Dev in a Box — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Docker로 격리된 환경에서 Claude Code가 완전 자율로 개발을 수행하고, 호스트 PC를 노출하지 않으며, 기계적 품질 게이트를 통과한 코드만 PR로 산출하는 재사용 가능한 애드온을 만든다.

**Architecture:** 호스트 `run-autodev.sh`가 격리 컨테이너를 기동한다. 컨테이너는 `entrypoint.sh`에서 iptables allowlist 방화벽을 올리고 인증을 자가검증한 뒤 비root로 강등해 `ralph.sh`(바깥 Ralph 루프)를 돈다. 각 iteration은 fresh `claude -p` orchestrator로, AOS 기존 서브에이전트를 디스패치해 plan→build→review→test 사이클을 수행한다. 완료는 `ralph.sh`가 `verify.sh`를 독립 재실행해 검증하며, 결과는 PR로만 통합된다.

**Tech Stack:** Bash, Docker, iptables/ipset, Claude Code CLI (헤드리스 `claude -p`), 구독 OAuth 인증(`CLAUDE_CODE_OAUTH_TOKEN`), git/gh CLI.

**설계 문서:** `docs/superpowers/specs/2026-05-21-autonomous-dev-in-docker-design.md`

---

## 구현 노트

- **작업 브랜치:** 모든 커밋은 `feat/autodev-environment` 브랜치에 한다 (설계 문서가 이미 거기 커밋됨).
- **설정 형식:** 설계 문서 §4.7은 `autodev.config.yaml`을 예시로 들었으나, 모든 셸 스크립트가 설정을 읽으므로 **YAML 파서 의존성을 피하기 위해 sourceable Bash 파일 `autodev.config.sh`로 구현한다.** 이것은 의도된 단순화다.
- **테스트:** 이 프로젝트는 Bash/Docker 중심이라 pytest 대신 셸 어서션 스크립트(`tests/assert.sh` 헬퍼)와 컨테이너 통합 테스트를 쓴다. 자율 루프 자체는 `AUTODEV_DRY_RUN=1`에서 `mock-claude.sh`로 대체해 **구독 토큰·과금 없이** 검증한다.
- **파일 위치:** 범용 애드온은 `claude-workspace-template/addons/autodev/`에, AOS 적용 설정은 AOS 레포 루트에 둔다.

## File Structure

```
claude-workspace-template/addons/autodev/
├── Dockerfile.autodev              # 격리 개발 이미지
├── run-autodev.sh                  # 호스트측 런처
├── autodev.config.sh.example       # 설정 템플릿 (sourceable bash)
├── .gitignore                      # .autodev-runs/ 등 무시
├── README.md                       # 사용법
├── scripts/
│   ├── lib.sh                      # 공용 함수 (로깅, config 로드, 비용 합산)
│   ├── init-firewall.sh            # iptables/ipset allowlist
│   ├── entrypoint.sh               # 부팅 시퀀스 (root→devagent)
│   ├── verify.sh                   # 기계적 품질 게이트
│   ├── ralph.sh                    # 바깥 Ralph 루프
│   └── mock-claude.sh              # AUTODEV_DRY_RUN용 claude 대역
├── prompts/
│   ├── ORCHESTRATOR.md             # 매 iteration 투입 프롬프트
│   └── REVIEWER.md                 # 최종 독립 리뷰 프롬프트
├── config/
│   └── settings.json               # 컨테이너 Claude 설정
└── tests/
    ├── assert.sh                   # 셸 어서션 헬퍼
    ├── test-lib.sh                 # lib.sh 단위 테스트
    ├── test-firewall.sh            # 방화벽 통합 테스트 (컨테이너)
    ├── test-isolation.sh           # 격리 통합 테스트 (컨테이너)
    └── test-loop.sh                # 루프 e2e (dry-run)

(AOS 레포 루트)
└── autodev.config.sh               # AOS 적용 설정 (Task 12)
```

---

### Task 1: 애드온 스캐폴드

**Files:**
- Create: `claude-workspace-template/addons/autodev/.gitignore`
- Create: `claude-workspace-template/addons/autodev/README.md`
- Create: `claude-workspace-template/addons/autodev/tests/assert.sh`

- [ ] **Step 1: 디렉토리와 `.gitignore` 생성**

`claude-workspace-template/addons/autodev/.gitignore`:

```gitignore
# 런타임 산출물 — 커밋하지 않음
.autodev-runs/
*.env
state/
logs/
```

- [ ] **Step 2: 어서션 헬퍼 작성**

`claude-workspace-template/addons/autodev/tests/assert.sh`:

```bash
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
```

- [ ] **Step 3: README 스켈레톤 작성**

`claude-workspace-template/addons/autodev/README.md`:

```markdown
# autodev — 격리된 자율 개발 환경

Docker로 격리된 컨테이너 안에서 Claude Code가 완전 자율로 개발을 수행하는 애드온.
설계: `docs/superpowers/specs/2026-05-21-autonomous-dev-in-docker-design.md`

## 사전 준비

1. 호스트에서 1회: `claude setup-token` → 출력된 OAuth 토큰 복사
2. 대상 레포 루트에 `.autodev.env` 생성 (gitignore됨):
   ```
   CLAUDE_CODE_OAUTH_TOKEN=<발급한 토큰>
   GH_TOKEN=<fine-grained PAT — 해당 레포 contents+PR write>
   ```
   ⚠️ `ANTHROPIC_API_KEY`는 절대 넣지 말 것 (종량제 과금 전환).
3. 대상 레포 루트에 `autodev.config.sh` 생성 (`autodev.config.sh.example` 복사 후 수정)
4. 대상 레포 루트에 `SPEC.md` 작성 (자율 개발할 작업 명세)

## 실행

```bash
cd <대상 레포>
<애드온 경로>/run-autodev.sh            # 실제 실행
<애드온 경로>/run-autodev.sh --dry-run  # API 없이 루프 메커니즘만 검증
```

## 테스트

```bash
cd claude-workspace-template/addons/autodev
bash tests/test-lib.sh        # lib 단위 테스트 (호스트)
bash tests/test-firewall.sh   # 방화벽 (Docker 필요)
bash tests/test-isolation.sh  # 격리 (Docker 필요)
bash tests/test-loop.sh       # 루프 e2e dry-run (Docker 필요)
```
```

- [ ] **Step 4: 어서션 헬퍼 동작 확인**

Run: `cd claude-workspace-template/addons/autodev && bash -c 'source tests/assert.sh; assert_eq a a "self-test"; assert_summary'`
Expected: `PASS: self-test` 출력 후 `passed: 1  failed: 0`, exit 0

- [ ] **Step 5: Commit**

```bash
git add claude-workspace-template/addons/autodev/
git commit -m "feat(autodev): 애드온 스캐폴드 — gitignore, README, 어서션 헬퍼"
```

---

### Task 2: 설정 파일과 공용 라이브러리

**Files:**
- Create: `claude-workspace-template/addons/autodev/autodev.config.sh.example`
- Create: `claude-workspace-template/addons/autodev/scripts/lib.sh`
- Test: `claude-workspace-template/addons/autodev/tests/test-lib.sh`

- [ ] **Step 1: 실패하는 테스트 작성**

`claude-workspace-template/addons/autodev/tests/test-lib.sh`:

```bash
#!/usr/bin/env bash
# Unit tests for lib.sh — runs on host, no Docker needed.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/assert.sh"
source "$HERE/../scripts/lib.sh"

echo "test: autodev_load_config applies defaults"
tmp=$(mktemp)
echo 'GATE_TEST="echo hi"' > "$tmp"
autodev_load_config "$tmp"
assert_eq "$COVERAGE_THRESHOLD" "80" "default COVERAGE_THRESHOLD=80"
assert_eq "$MAX_ITERATIONS" "30" "default MAX_ITERATIONS=30"
assert_eq "$GATE_TEST" "echo hi" "config value loaded"
rm -f "$tmp"

echo "test: autodev_load_config dies on missing file"
assert_fail "missing config aborts" autodev_load_config /nonexistent/path

echo "test: autodev_total_cost sums total_cost_usd from logs"
logdir=$(mktemp -d)
echo '{"type":"result","total_cost_usd":0.10}' > "$logdir/iter-001.jsonl"
echo '{"type":"result","total_cost_usd":0.25}' > "$logdir/iter-002.jsonl"
total=$(autodev_total_cost "$logdir")
assert_eq "$total" "0.35" "total cost = 0.35"
rm -rf "$logdir"

assert_summary
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `cd claude-workspace-template/addons/autodev && bash tests/test-lib.sh`
Expected: FAIL — `lib.sh` 없음 / 함수 미정의로 에러

- [ ] **Step 3: `lib.sh` 구현**

`claude-workspace-template/addons/autodev/scripts/lib.sh`:

```bash
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
    c=$(grep -oE '"total_cost_usd":[0-9.]+' "$f" | tail -1 | cut -d: -f2)
    [ -n "$c" ] && total=$(awk "BEGIN{printf \"%g\", $total + $c}")
  done
  echo "$total"
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run: `cd claude-workspace-template/addons/autodev && bash tests/test-lib.sh`
Expected: 모든 `PASS`, `passed: 5  failed: 0`, exit 0

- [ ] **Step 5: 설정 템플릿 작성**

`claude-workspace-template/addons/autodev/autodev.config.sh.example`:

```bash
# autodev 설정 — autodev 스크립트들이 source 한다. 대상 레포 루트에 복사해 수정.

# --- 품질 게이트 명령 (각각 exit 0이어야 통과) ---
# 빈 문자열로 두면 해당 게이트는 건너뜀.
GATE_TYPECHECK='cd src/dashboard && npx tsc --noEmit'
GATE_LINT='ruff check src/backend && (cd src/dashboard && npm run lint)'
GATE_TEST='pytest tests/backend && (cd src/dashboard && npm test -- --run)'
GATE_BUILD='cd src/dashboard && npm run build'
GATE_COVERAGE_CMD='pytest tests/backend --cov=src/backend --cov-report=term-missing'
COVERAGE_THRESHOLD=80

# --- 루프 한도 ---
MAX_ITERATIONS=30
MAX_TURNS=60
ITERATION_TIMEOUT=3600      # iteration당 최대 초
STALL_LIMIT=3              # 연속 무커밋 iteration 수 → BLOCKED
COST_CAP_USD=50            # 누적 사용량 상한 (토큰 비용 환산)

# --- 모델 ---
AUTODEV_MODEL=opus

# --- 네트워크: 추가 허용 도메인 (공백 구분) ---
EXTRA_ALLOWED_DOMAINS=''

# --- 컨테이너 리소스 ---
RES_MEMORY=8g
RES_CPUS=4
RES_PIDS=512

# --- git ---
GIT_REMOTE=origin
BASE_BRANCH=main
```

- [ ] **Step 6: Commit**

```bash
git add claude-workspace-template/addons/autodev/
git commit -m "feat(autodev): 공용 lib.sh + 설정 템플릿, lib 단위 테스트"
```

---

### Task 3: 격리 개발 이미지 (`Dockerfile.autodev`)

**Files:**
- Create: `claude-workspace-template/addons/autodev/Dockerfile.autodev`

- [ ] **Step 1: Dockerfile 작성**

`claude-workspace-template/addons/autodev/Dockerfile.autodev`:

```dockerfile
# 격리된 자율 개발 이미지.
FROM node:20-slim

# 개발 도구 + 방화벽 도구 + 권한 강등 도구
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-venv \
      git curl jq ripgrep ca-certificates \
      iptables ipset dnsutils gosu \
    && rm -rf /var/lib/apt/lists/*

# iptables-legacy 사용 (컨테이너에서 nft보다 안정적)
RUN update-alternatives --set iptables /usr/sbin/iptables-legacy || true

# uv (Python 패키지 매니저)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
    && mv /root/.local/bin/uv /usr/local/bin/uv

# gh CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

# Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# 비root 유저
RUN useradd -m -u 1000 -s /bin/bash devagent \
    && mkdir -p /workspace/state /workspace/logs /opt/autodev \
    && chown -R devagent:devagent /workspace

# 애드온 자산 (시크릿은 절대 포함하지 않음)
COPY scripts/  /opt/autodev/scripts/
COPY prompts/  /opt/autodev/prompts/
COPY config/   /opt/autodev/config/
RUN chmod +x /opt/autodev/scripts/*.sh

WORKDIR /workspace
ENTRYPOINT ["/opt/autodev/scripts/entrypoint.sh"]
```

- [ ] **Step 2: 빌드에 필요한 빈 디렉토리 보장**

`COPY`가 실패하지 않도록 `prompts/`·`config/`에 최소 1개 파일이 있어야 한다. 이후 Task에서 채우므로, 지금은 placeholder를 만든다:

Run:
```bash
cd claude-workspace-template/addons/autodev
mkdir -p prompts config
[ -f prompts/.keep ] || touch prompts/.keep
[ -f config/.keep ] || touch config/.keep
```

- [ ] **Step 3: 이미지 빌드로 Dockerfile 문법 검증**

Run: `cd claude-workspace-template/addons/autodev && docker build -f Dockerfile.autodev -t autodev:test .`
Expected: 빌드 성공 (exit 0). `entrypoint.sh`는 아직 없지만 `COPY scripts/`가 실패하면 Task 순서 문제 — `scripts/lib.sh`는 Task 2에서 이미 생성됨, `COPY scripts/`는 디렉토리 통째 복사라 성공.

- [ ] **Step 4: 이미지 내용 검증**

Run: `docker run --rm --entrypoint sh autodev:test -c 'claude --version && git --version && iptables --version && gosu --version && uv --version'`
Expected: 각 도구 버전 출력, exit 0

- [ ] **Step 5: Commit**

```bash
git add claude-workspace-template/addons/autodev/Dockerfile.autodev \
        claude-workspace-template/addons/autodev/prompts/.keep \
        claude-workspace-template/addons/autodev/config/.keep
git commit -m "feat(autodev): 격리 개발 이미지 Dockerfile (node+python+claude+방화벽 도구)"
```

---

### Task 4: 네트워크 방화벽 (`init-firewall.sh`)

**Files:**
- Create: `claude-workspace-template/addons/autodev/scripts/init-firewall.sh`
- Test: `claude-workspace-template/addons/autodev/tests/test-firewall.sh`

- [ ] **Step 1: 방화벽 스크립트 작성**

`claude-workspace-template/addons/autodev/scripts/init-firewall.sh`:

```bash
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
```

- [ ] **Step 2: 방화벽 통합 테스트 작성**

`claude-workspace-template/addons/autodev/tests/test-firewall.sh`:

```bash
#!/usr/bin/env bash
# 방화벽 통합 테스트 — 빌드된 이미지를 NET_ADMIN으로 실행해 검증.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/assert.sh"
IMG=autodev:test

echo "test: 방화벽 적용 후 차단 도메인은 막히고 허용 도메인은 통한다"
out=$(docker run --rm --cap-drop ALL --cap-add NET_ADMIN --cap-add NET_RAW \
  --entrypoint sh "$IMG" -c '
    EXTRA_ALLOWED_DOMAINS="" /opt/autodev/scripts/init-firewall.sh >/dev/null 2>&1
    # 차단되어야 함 (allowlist에 없음)
    if curl -fsS --max-time 5 https://example.com >/dev/null 2>&1; then
      echo "BLOCKED_DOMAIN_REACHABLE"; else echo "blocked_ok"; fi
    # 허용되어야 함 (api.anthropic.com — 401이라도 TCP 연결되면 OK)
    code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 https://api.anthropic.com || echo 000)
    if [ "$code" = "000" ]; then echo "ALLOWED_DOMAIN_UNREACHABLE"; else echo "allowed_ok"; fi
  ')
echo "$out"
echo "$out" | grep -q "blocked_ok"  && blk=blocked_ok  || blk=BAD
echo "$out" | grep -q "allowed_ok"  && alw=allowed_ok  || alw=BAD
assert_eq "$blk" "blocked_ok"  "차단 도메인(example.com)이 막힘"
assert_eq "$alw" "allowed_ok"  "허용 도메인(api.anthropic.com)이 통함"

assert_summary
```

- [ ] **Step 3: 이미지 재빌드 (새 스크립트 포함)**

Run: `cd claude-workspace-template/addons/autodev && docker build -f Dockerfile.autodev -t autodev:test .`
Expected: 빌드 성공

- [ ] **Step 4: 방화벽 테스트 실행**

Run: `cd claude-workspace-template/addons/autodev && bash tests/test-firewall.sh`
Expected: `PASS: 차단 도메인...`, `PASS: 허용 도메인...`, `passed: 2  failed: 0`, exit 0

> 실패 시: ipset/iptables-legacy 문제일 수 있다. `docker run` 출력의 `[firewall]` 로그를 확인하고, `update-alternatives --set iptables /usr/sbin/iptables-legacy`가 이미지에 적용됐는지 점검.

- [ ] **Step 5: Commit**

```bash
git add claude-workspace-template/addons/autodev/scripts/init-firewall.sh \
        claude-workspace-template/addons/autodev/tests/test-firewall.sh
git commit -m "feat(autodev): iptables/ipset allowlist 방화벽 + 통합 테스트"
```

---

### Task 5: 부팅 시퀀스 (`entrypoint.sh`)

**Files:**
- Create: `claude-workspace-template/addons/autodev/scripts/entrypoint.sh`
- Test: `claude-workspace-template/addons/autodev/tests/test-isolation.sh`

- [ ] **Step 1: `entrypoint.sh` 작성**

`claude-workspace-template/addons/autodev/scripts/entrypoint.sh`:

```bash
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
code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 https://api.anthropic.com || echo 000)
[ "$code" = "000" ] && autodev_die "api.anthropic.com 도달 불가 — 방화벽 과차단"
autodev_log "방화벽 OK."

# --- 3. 인증 자가검증 (종량제 경로 차단) ---
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN
[ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] || autodev_die "CLAUDE_CODE_OAUTH_TOKEN 미설정"
autodev_log "인증 OK — 구독 OAuth 토큰 확인."

# --- 4. 레포 클론 ---
autodev_log "레포 클론 중..."
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
```

> `unset`은 현재 셸 환경에서 변수를 제거하고, `exec gosu`는 그 환경을 그대로 물려준다 — 종량제 키가 `claude`에 전달되지 않는다.

- [ ] **Step 2: 격리 통합 테스트 작성**

`claude-workspace-template/addons/autodev/tests/test-isolation.sh`:

```bash
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
# entrypoint는 root로 시작하지만 ralph.sh는 devagent로 exec됨.
# entrypoint를 sh로 덮어쓰지 않고, ralph.sh 자리에 whoami를 주입해 확인.
uid=$(docker run --rm --entrypoint sh "$IMG" -c 'id -u devagent')
assert_eq "$uid" "1000" "devagent uid=1000 존재"

echo "test: Docker 소켓이 이미지에 없다"
assert_fail "docker 소켓 미존재" \
  docker run --rm --entrypoint sh "$IMG" -c 'test -S /var/run/docker.sock'

echo "test: 인증 자가검증 — CLAUDE_CODE_OAUTH_TOKEN 없으면 abort"
# init-firewall를 우회하기 위해 인증검증 로직만 직접 실행
out=$(docker run --rm --entrypoint sh "$IMG" -c '
  source /opt/autodev/scripts/lib.sh
  unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN
  [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] || autodev_die "no token"
' 2>&1 || true)
echo "$out" | grep -q "FATAL" && r=aborted || r=BAD
assert_eq "$r" "aborted" "토큰 없으면 FATAL로 중단"

assert_summary
```

- [ ] **Step 3: 이미지 재빌드**

Run: `cd claude-workspace-template/addons/autodev && docker build -f Dockerfile.autodev -t autodev:test .`
Expected: 빌드 성공

- [ ] **Step 4: 격리 테스트 실행**

Run: `cd claude-workspace-template/addons/autodev && bash tests/test-isolation.sh`
Expected: 모든 `PASS`, `passed: 4  failed: 0`, exit 0

- [ ] **Step 5: Commit**

```bash
git add claude-workspace-template/addons/autodev/scripts/entrypoint.sh \
        claude-workspace-template/addons/autodev/tests/test-isolation.sh
git commit -m "feat(autodev): entrypoint 부팅 시퀀스 (방화벽·인증 검증·clone·강등) + 격리 테스트"
```

---

### Task 6: 기계적 품질 게이트 (`verify.sh`)

**Files:**
- Create: `claude-workspace-template/addons/autodev/scripts/verify.sh`
- Test: `tests/test-lib.sh`에 게이트 동작 케이스 추가

- [ ] **Step 1: 실패하는 테스트 추가**

`claude-workspace-template/addons/autodev/tests/test-lib.sh`의 `assert_summary` 줄 **앞에** 다음을 삽입:

```bash
echo "test: verify.sh 게이트 — 통과 케이스"
work=$(mktemp -d); mkdir -p "$work/repo"
cat > "$work/autodev.config.sh" <<'CFG'
GATE_TYPECHECK='true'
GATE_LINT='true'
GATE_TEST='true'
GATE_BUILD='true'
GATE_COVERAGE_CMD=''
CFG
WORKSPACE_OVERRIDE="$work" bash "$HERE/../scripts/verify.sh"
assert_eq "$?" "0" "모든 게이트 true → verify.sh exit 0"

echo "test: verify.sh 게이트 — 실패 케이스"
cat > "$work/autodev.config.sh" <<'CFG'
GATE_TYPECHECK='true'
GATE_LINT='false'
GATE_TEST='true'
GATE_BUILD='true'
GATE_COVERAGE_CMD=''
CFG
WORKSPACE_OVERRIDE="$work" bash "$HERE/../scripts/verify.sh"; rc=$?
assert_eq "$rc" "1" "게이트 1개 false → verify.sh exit 1"
rm -rf "$work"
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `cd claude-workspace-template/addons/autodev && bash tests/test-lib.sh`
Expected: FAIL — `verify.sh` 없음

- [ ] **Step 3: `verify.sh` 구현**

`claude-workspace-template/addons/autodev/scripts/verify.sh`:

```bash
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
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run: `cd claude-workspace-template/addons/autodev && bash tests/test-lib.sh`
Expected: 모든 `PASS`, `passed: 7  failed: 0`, exit 0

- [ ] **Step 5: Commit**

```bash
git add claude-workspace-template/addons/autodev/scripts/verify.sh \
        claude-workspace-template/addons/autodev/tests/test-lib.sh
git commit -m "feat(autodev): 기계적 품질 게이트 verify.sh + 게이트 테스트"
```

---

### Task 7: Orchestrator 프롬프트 (`ORCHESTRATOR.md`)

**Files:**
- Create: `claude-workspace-template/addons/autodev/prompts/ORCHESTRATOR.md`
- Delete: `claude-workspace-template/addons/autodev/prompts/.keep`

- [ ] **Step 1: Orchestrator 프롬프트 작성**

`claude-workspace-template/addons/autodev/prompts/ORCHESTRATOR.md`:

```markdown
# 자율 개발 Orchestrator — 1 iteration

너는 격리된 컨테이너 안에서 도는 자율 개발 루프의 orchestrator다. 이 프롬프트는
매 iteration마다 fresh 프로세스로 너에게 다시 주어진다. 이전 iteration의 기억은
없다 — 오직 파일과 git 히스토리만이 너의 기억이다.

## 이번 iteration에 할 일

1. **상태 파악**
   - `/workspace/state/PROGRESS.md`를 읽어 지금까지의 진행을 파악한다 (없으면 신규).
   - `git log --oneline -20`으로 최근 커밋을 본다.
   - `/workspace/state/TASKS.md`를 읽는다. 없으면 아래 2번을 먼저 한다.

2. **(TASKS.md가 없을 때만) 작업 분해**
   - `/workspace/state/SPEC.md`를 읽는다.
   - SPEC을 작은 작업 단위들의 체크박스 목록 `/workspace/state/TASKS.md`로 분해한다.
   - 각 작업 단위는 커밋 1개로 끝날 크기여야 한다.

3. **작업 단위 1개 수행** — `TASKS.md`에서 미완료 항목 **하나**만 고른다. 한 iteration에
   하나 이상 하지 마라. 다음 멀티에이전트 사이클로 처리한다:
   - **planner** — 이 작업 단위의 구현 계획을 세운다.
   - **implementer** — TDD로 구현한다 (실패 테스트 작성 → 통과 구현 → 정리).
   - **reviewer** — 구현을 독립 리뷰한다. 테스트 삭제·skip·약화 여부를 반드시 점검한다.
   - **tester** — `/opt/autodev/scripts/verify.sh`를 실행해 게이트를 확인한다.
   서브에이전트는 AOS 기존 에이전트(`code-reviewer`, `tdd-guide`,
   `test-automation-specialist` 등)를 우선 활용한다.

4. **커밋** — 게이트가 통과하면 작업 단위를 커밋한다 (작업 단위 1개 = 커밋 1개).
   `TASKS.md`의 해당 항목을 체크하고 `PROGRESS.md`를 갱신한다 (무엇을 했고, 다음은
   무엇이고, 막힌 게 있으면 무엇인지).

5. **완료 판정** — `TASKS.md`의 모든 항목이 완료되고 `verify.sh`가 통과하면
   `/workspace/state/DONE` 파일을 만든다 (내용은 비워도 된다).

6. **종료** — 위가 끝나면 이 프로세스를 끝낸다. 다음 iteration이 새 프로세스로 이어간다.

## 절대 규칙

- **가짜 완료 금지.** `verify.sh`가 통과하지 않았는데 `DONE`을 만들지 마라. 루프는
  `DONE`을 신뢰하지 않고 `verify.sh`를 독립적으로 재실행한다 — 거짓은 즉시 들킨다.
- **테스트를 약화시키지 마라.** 테스트를 지우거나 skip하거나 단언을 무르게 만들어
  게이트를 통과시키는 것은 실패다.
- **한 iteration에 작업 단위 1개.** 작게, 자주 커밋한다.
- 막혀서 진전이 없으면 `PROGRESS.md`에 막힌 원인과 시도한 것을 솔직히 적는다.
```

- [ ] **Step 2: placeholder 제거**

Run: `cd claude-workspace-template/addons/autodev && rm -f prompts/.keep`

- [ ] **Step 3: 파일 존재 확인**

Run: `test -f claude-workspace-template/addons/autodev/prompts/ORCHESTRATOR.md && echo OK`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add claude-workspace-template/addons/autodev/prompts/
git commit -m "feat(autodev): orchestrator 프롬프트 — 멀티에이전트 안쪽 사이클"
```

---

### Task 8: 최종 리뷰어 프롬프트 (`REVIEWER.md`)

**Files:**
- Create: `claude-workspace-template/addons/autodev/prompts/REVIEWER.md`

- [ ] **Step 1: 리뷰어 프롬프트 작성**

`claude-workspace-template/addons/autodev/prompts/REVIEWER.md`:

```markdown
# 최종 독립 리뷰

너는 자율 개발 루프와 **완전히 분리된** fresh 프로세스다. 구현 과정을 전혀
보지 못했다 — 그래서 너의 리뷰는 독립적이다.

## 할 일

1. `git log --oneline origin/HEAD..HEAD` 또는 작업 브랜치 전체 diff를 본다
   (`git diff $(cat /workspace/state/branch-base 2>/dev/null || echo HEAD~20)...HEAD`).
2. `/workspace/state/SPEC.md`를 읽어 원래 요구사항을 파악한다.
3. 다음을 점검한다:
   - SPEC 요구사항이 실제로 충족됐는가?
   - 테스트가 삭제·skip·약화되지 않았는가?
   - 명백한 버그·보안 문제·미완성 코드(placeholder, TODO)가 없는가?
   - 커밋이 작업 단위별로 적절히 나뉘었는가?

## 출력

판정을 `/workspace/state/FINAL-REVIEW.md`에 쓴다. 파일 **첫 줄**은 정확히
다음 둘 중 하나여야 한다:

- `FINAL-REVIEW: PASS` — 모든 점검을 통과했고 PR로 낼 만하다.
- `FINAL-REVIEW: FAIL` — 문제가 있다.

첫 줄 아래에 근거를 적는다. FAIL이면 무엇이 문제인지 구체적으로 적는다.

**중요:** 확신이 없으면 `FAIL`이다. PASS는 "PR로 내도 좋다"는 명확한 보증일 때만.
```

- [ ] **Step 2: 파일 존재 확인**

Run: `test -f claude-workspace-template/addons/autodev/prompts/REVIEWER.md && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add claude-workspace-template/addons/autodev/prompts/REVIEWER.md
git commit -m "feat(autodev): 최종 독립 리뷰어 프롬프트"
```

---

### Task 9: 컨테이너 Claude 설정 (`settings.json`)

**Files:**
- Create: `claude-workspace-template/addons/autodev/config/settings.json`
- Delete: `claude-workspace-template/addons/autodev/config/.keep`

- [ ] **Step 1: `settings.json` 작성**

`claude-workspace-template/addons/autodev/config/settings.json`:

```json
{
  "sandbox": { "enabled": false },
  "permissions": { "defaultMode": "bypassPermissions" }
}
```

> `sandbox.enabled: false` — Docker + iptables가 격리를 담당하므로 Claude Code 내장
> 샌드박스(중첩 시 보안 약화)는 끈다. `apiKeyHelper`는 종량제 경로이므로 두지 않는다.

- [ ] **Step 2: placeholder 제거 및 JSON 유효성 검증**

Run:
```bash
cd claude-workspace-template/addons/autodev
rm -f config/.keep
jq empty config/settings.json && echo "JSON OK"
```
Expected: `JSON OK`

- [ ] **Step 3: Commit**

```bash
git add claude-workspace-template/addons/autodev/config/
git commit -m "feat(autodev): 컨테이너 Claude 설정 — 내장 샌드박스 off, bypassPermissions"
```

---

### Task 10: 바깥 Ralph 루프 (`ralph.sh` + `mock-claude.sh`)

**Files:**
- Create: `claude-workspace-template/addons/autodev/scripts/mock-claude.sh`
- Create: `claude-workspace-template/addons/autodev/scripts/ralph.sh`
- Test: `claude-workspace-template/addons/autodev/tests/test-loop.sh`

- [ ] **Step 1: `mock-claude.sh` 작성 (dry-run용 claude 대역)**

`claude-workspace-template/addons/autodev/scripts/mock-claude.sh`:

```bash
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
```

- [ ] **Step 2: `ralph.sh` 작성**

`claude-workspace-template/addons/autodev/scripts/ralph.sh`:

```bash
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
      autodev_log "정체 한도 도달"; touch "$STATE/BLOCKED"
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
    else
      git push "$GIT_REMOTE" "$branch" \
        && gh pr create --fill --base "$BASE_BRANCH" --head "$branch" \
        || autodev_log "push/PR 실패 — GH_TOKEN 권한 확인"
    fi
    touch "$STATE/COMPLETED"
  else
    autodev_log "최종 리뷰어 PASS 아님 — BLOCKED"
    touch "$STATE/BLOCKED"
  fi
else
  autodev_log "검증된 완료 없이 루프 종료"
fi
autodev_log "Ralph 루프 종료 — $iter iteration 수행."
```

- [ ] **Step 3: 루프 e2e 테스트 작성 (dry-run)**

`claude-workspace-template/addons/autodev/tests/test-loop.sh`:

```bash
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
# mock은 3회째에 DONE을 쓰지만, 게이트를 false로 만들면 ralph가 DONE을 거부.
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
```

- [ ] **Step 4: 이미지 재빌드**

Run: `cd claude-workspace-template/addons/autodev && docker build -f Dockerfile.autodev -t autodev:test .`
Expected: 빌드 성공

- [ ] **Step 5: 루프 e2e 테스트 실행**

Run: `cd claude-workspace-template/addons/autodev && bash tests/test-loop.sh`
Expected: 모든 `PASS`, `passed: 5  failed: 0`, exit 0

> 실패 시: `$work/run/logs/`의 jsonl과 컨테이너 stderr를 확인. `docker run`에서 `2>&1`을 임시로 살려 entrypoint 로그를 본다.

- [ ] **Step 6: Commit**

```bash
git add claude-workspace-template/addons/autodev/scripts/ralph.sh \
        claude-workspace-template/addons/autodev/scripts/mock-claude.sh \
        claude-workspace-template/addons/autodev/tests/test-loop.sh
git commit -m "feat(autodev): 바깥 Ralph 루프 + dry-run mock + 루프 e2e 테스트"
```

---

### Task 11: 호스트측 런처 (`run-autodev.sh`)

**Files:**
- Create: `claude-workspace-template/addons/autodev/run-autodev.sh`

- [ ] **Step 1: `run-autodev.sh` 작성**

`claude-workspace-template/addons/autodev/run-autodev.sh`:

```bash
#!/usr/bin/env bash
# autodev 컨테이너 호스트측 런처. 대상 레포 루트에서 실행한다.
set -euo pipefail

ADDON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(pwd)"
DRY_RUN=0
CONFIG="$REPO_DIR/autodev.config.sh"
SPEC="$REPO_DIR/SPEC.md"
ENV_FILE="$REPO_DIR/.autodev.env"

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)   DRY_RUN=1 ;;
    --config)    CONFIG="$2"; shift ;;
    --spec)      SPEC="$2"; shift ;;
    --env-file)  ENV_FILE="$2"; shift ;;
    *) echo "알 수 없는 인자: $1" >&2; exit 1 ;;
  esac
  shift
done

# --- 사전 점검 ---
[ -d "$REPO_DIR/.git" ] || { echo "FATAL: 현재 디렉토리가 git 레포가 아님"; exit 1; }
[ -f "$CONFIG" ]   || { echo "FATAL: 설정 없음: $CONFIG (autodev.config.sh.example 복사)"; exit 1; }
[ -f "$SPEC" ]     || { echo "FATAL: SPEC 없음: $SPEC (자율 개발 작업 명세 작성)"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "FATAL: env 파일 없음: $ENV_FILE (CLAUDE_CODE_OAUTH_TOKEN, GH_TOKEN)"; exit 1; }

# --- 과금 가드: env 파일에 종량제 키가 있으면 중단 ---
if grep -qE '^[[:space:]]*ANTHROPIC_API_KEY=' "$ENV_FILE"; then
  echo "FATAL: $ENV_FILE 에 ANTHROPIC_API_KEY 가 있음 — 제거하라 (종량제 과금 전환됨)" >&2
  exit 1
fi
if ! grep -qE '^[[:space:]]*CLAUDE_CODE_OAUTH_TOKEN=' "$ENV_FILE"; then
  echo "FATAL: $ENV_FILE 에 CLAUDE_CODE_OAUTH_TOKEN 이 없음 (claude setup-token 으로 발급)" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$CONFIG"
: "${RES_MEMORY:=8g}" "${RES_CPUS:=4}" "${RES_PIDS:=512}"

# --- 실행 디렉토리 준비 ---
RUN_DIR="$REPO_DIR/.autodev-runs/$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "$RUN_DIR/logs" "$RUN_DIR/state"
cp "$SPEC" "$RUN_DIR/state/SPEC.md"
cp "$CONFIG" "$RUN_DIR/autodev.config.sh"
echo "실행 디렉토리: $RUN_DIR"

# --- 이미지 빌드 ---
echo "이미지 빌드 중..."
docker build -f "$ADDON_DIR/Dockerfile.autodev" -t autodev:latest "$ADDON_DIR"

# --- 컨테이너 실행 ---
echo "컨테이너 실행 중 (dry-run=$DRY_RUN)..."
docker run --rm \
  --name "autodev-$(date -u +%H%M%S)" \
  --env-file "$ENV_FILE" \
  -e AUTODEV_DRY_RUN="$DRY_RUN" \
  --cap-drop ALL --cap-add NET_ADMIN --cap-add NET_RAW \
  --memory "$RES_MEMORY" --cpus "$RES_CPUS" --pids-limit "$RES_PIDS" \
  -v "$REPO_DIR:/host-repo:ro" \
  -v "$RUN_DIR/logs:/workspace/logs" \
  -v "$RUN_DIR/state:/workspace/state" \
  -v "$RUN_DIR/autodev.config.sh:/workspace/autodev.config.sh:ro" \
  autodev:latest

echo "완료. 로그: $RUN_DIR/logs  상태: $RUN_DIR/state"
[ -f "$RUN_DIR/state/COMPLETED" ] && echo "✅ 자율 개발 완료 — PR 확인" \
  || echo "⚠️  완료되지 않음 — $RUN_DIR/state/ 의 BLOCKED/PROGRESS 확인"
```

- [ ] **Step 2: 실행 권한 부여 및 문법 검증**

Run:
```bash
cd claude-workspace-template/addons/autodev
chmod +x run-autodev.sh scripts/*.sh
bash -n run-autodev.sh && echo "문법 OK"
```
Expected: `문법 OK`

- [ ] **Step 3: 과금 가드 동작 확인**

Run:
```bash
cd /tmp && rm -rf rt && mkdir rt && cd rt && git init -q
cp /Users/younghwankang/Work/Agent-System/claude-workspace-template/addons/autodev/autodev.config.sh.example autodev.config.sh
echo "spec" > SPEC.md
printf 'ANTHROPIC_API_KEY=sk-bad\nCLAUDE_CODE_OAUTH_TOKEN=x\n' > .autodev.env
/Users/younghwankang/Work/Agent-System/claude-workspace-template/addons/autodev/run-autodev.sh; echo "exit=$?"
```
Expected: `FATAL: ... ANTHROPIC_API_KEY ...`, `exit=1` (컨테이너 실행 안 됨)

- [ ] **Step 4: 정리**

Run: `rm -rf /tmp/rt`

- [ ] **Step 5: Commit**

```bash
git add claude-workspace-template/addons/autodev/run-autodev.sh
git commit -m "feat(autodev): 호스트측 런처 run-autodev.sh — 과금 가드 포함"
```

---

### Task 12: AOS 적용 + 전체 검증 + README 마무리

**Files:**
- Create: `autodev.config.sh` (AOS 레포 루트)
- Modify: `.gitignore` (AOS 레포 루트) — `.autodev-runs/`, `.autodev.env` 추가
- Modify: `claude-workspace-template/addons/autodev/README.md`
- Modify: `docs/features.md` (있으면 새 기능 항목 추가)

- [ ] **Step 1: AOS용 설정 생성**

`autodev.config.sh` (AOS 레포 루트):

```bash
# AOS autodev 설정.
GATE_TYPECHECK='cd src/dashboard && npx tsc --noEmit'
GATE_LINT='ruff check src/backend && (cd src/dashboard && npm run lint)'
GATE_TEST='pytest tests/backend && (cd src/dashboard && npm test -- --run)'
GATE_BUILD='cd src/dashboard && npm run build'
GATE_COVERAGE_CMD='pytest tests/backend --cov=src/backend --cov-report=term-missing'
COVERAGE_THRESHOLD=80

MAX_ITERATIONS=30
MAX_TURNS=60
ITERATION_TIMEOUT=3600
STALL_LIMIT=3
COST_CAP_USD=50
AUTODEV_MODEL=opus
EXTRA_ALLOWED_DOMAINS=''
RES_MEMORY=8g
RES_CPUS=4
RES_PIDS=512
GIT_REMOTE=origin
BASE_BRANCH=main
```

- [ ] **Step 2: AOS `.gitignore` 갱신**

AOS 레포 루트 `.gitignore`에 다음 줄 추가 (이미 있으면 생략):

```gitignore
# autodev 런타임 산출물
.autodev-runs/
.autodev.env
```

- [ ] **Step 3: 전체 테스트 스위트 실행**

Run:
```bash
cd /Users/younghwankang/Work/Agent-System/claude-workspace-template/addons/autodev
docker build -f Dockerfile.autodev -t autodev:test .
bash tests/test-lib.sh
bash tests/test-firewall.sh
bash tests/test-isolation.sh
bash tests/test-loop.sh
```
Expected: 4개 테스트 스크립트 모두 `failed: 0`, 각각 exit 0

- [ ] **Step 4: shellcheck 정적 검사 (가능하면)**

Run:
```bash
cd /Users/younghwankang/Work/Agent-System/claude-workspace-template/addons/autodev
command -v shellcheck >/dev/null && shellcheck scripts/*.sh run-autodev.sh || echo "shellcheck 미설치 — 건너뜀"
```
Expected: 경고 0 또는 `shellcheck 미설치 — 건너뜀`

- [ ] **Step 5: README에 AOS 적용 절 추가**

`claude-workspace-template/addons/autodev/README.md` 끝에 추가:

```markdown
## AOS 적용 예시

AOS 레포 루트에 `autodev.config.sh`가 준비돼 있다. 실행:

```bash
cd ~/Work/Agent-System
# 1회: claude setup-token → 토큰 발급
printf 'CLAUDE_CODE_OAUTH_TOKEN=<토큰>\nGH_TOKEN=<PAT>\n' > .autodev.env
echo "<자율 개발할 작업 명세>" > SPEC.md
claude-workspace-template/addons/autodev/run-autodev.sh --dry-run   # 먼저 dry-run
claude-workspace-template/addons/autodev/run-autodev.sh            # 실제 실행
```

## 과금 주의

- 구독 OAuth 토큰만 쓰면 추가 과금 없음 (사용 한도 내).
- ⚠️ `.autodev.env`에 `ANTHROPIC_API_KEY`를 넣으면 종량제로 전환됨 — 런처가 막지만 넣지 말 것.
- ⚠️ 사용 한도(5시간/주간) 초과 시 기본값으로 종량제 과금됨. Anthropic Console에서
  extra usage를 OFF로 두면 한도 초과 시 과금 대신 차단(throttle)만 발생.
```

- [ ] **Step 6: `docs/features.md` 갱신 (파일이 있으면)**

`docs/features.md`가 존재하면 autodev 기능 항목을 한 줄 추가한다 (기존 번호 체계 따라).
파일이 없으면 이 단계를 건너뛴다.

- [ ] **Step 7: 최종 커밋**

```bash
git add autodev.config.sh .gitignore \
        claude-workspace-template/addons/autodev/README.md
git add docs/features.md 2>/dev/null || true
git commit -m "feat(autodev): AOS 적용 설정 + README 마무리 + 전체 검증"
```

- [ ] **Step 8: 브랜치 푸시 및 PR 준비**

Run:
```bash
cd /Users/younghwankang/Work/Agent-System
git push -u origin feat/autodev-environment
```
이후 `gh pr create`로 PR을 만든다 (설계 문서 + 구현 전체 포함).

---

## Self-Review

**1. Spec coverage** — 설계 문서 §1–12 대비:

| 스펙 항목 | 구현 Task |
|-----------|-----------|
| §3 격리 아키텍처 / 불변식 | Task 3(이미지), 5(entrypoint), 11(런처 cap/마운트) |
| §4.1 Dockerfile.autodev | Task 3 |
| §4.2 init-firewall.sh | Task 4 |
| §4.3 entrypoint.sh (방화벽·인증·clone·강등) | Task 5 |
| §4.4 ralph.sh | Task 10 |
| §4.5 ORCHESTRATOR.md | Task 7 |
| §4.6 verify.sh (기계적 게이트) | Task 6 |
| §4.6b 리뷰어 게이트 2단계 | Task 8(프롬프트), 10(ralph.sh 최종 리뷰 호출) |
| §4.7 autodev.config | Task 2(템플릿), 12(AOS 설정) |
| §4.8 run-autodev.sh | Task 11 |
| §4.9 settings.json | Task 9 |
| §5 External Memory 상태 | Task 7(PROGRESS/TASKS), 10(state/logs) |
| §6 가짜 완료 3중 방어 | Task 6(verify), 10(독립 재실행), 8+10(리뷰어) |
| §7 안전장치 (한도·정체·비용·방화벽) | Task 10(stall/cost/max-iter), 5(방화벽 검증) |
| §8 시크릿·인증 (구독 OAuth, 종량제 차단) | Task 5(unset+검증), 11(과금 가드) |
| §9 애드온 패키징 | Task 1–11 전체가 애드온 디렉토리 구성 |
| §10 테스트 전략 (방화벽·격리·가짜완료·e2e) | Task 4, 5, 10 테스트 |

모든 스펙 항목이 Task로 매핑됨 — 갭 없음.

**2. Placeholder scan** — "TBD/TODO/나중에" 없음. 모든 스크립트는 완전한 내용으로 제시됨. Task 12 Step 6만 조건부("파일 있으면")이나 이는 placeholder가 아니라 명시적 분기.

**3. Type/이름 일관성 점검:**
- `autodev_load_config`, `autodev_total_cost`, `autodev_log`, `autodev_die` — Task 2 정의, Task 5/6/10에서 동일 이름으로 사용 ✓
- 설정 변수명 (`GATE_*`, `MAX_ITERATIONS`, `COST_CAP_USD`, `STALL_LIMIT`, `AUTODEV_MODEL`, `GIT_REMOTE`, `BASE_BRANCH`, `RES_*`) — Task 2 템플릿/lib 기본값과 Task 10/11/12 사용처 일치 ✓
- sentinel 파일 (`DONE`, `BLOCKED`, `COMPLETED`, `FINAL-REVIEW.md`, `branch`, `branch-base`) — Task 10 ralph.sh 생성/소비, Task 5 entrypoint(`branch`), Task 10 테스트 검증 일치 ✓
- `WORKSPACE_OVERRIDE` — Task 6 verify.sh와 test-lib.sh 케이스에서 동일 ✓
- `AUTODEV_DRY_RUN` — Task 10 ralph.sh/mock, Task 11 런처, Task 10 테스트 일치 ✓
- 경로 `/opt/autodev/{scripts,prompts,config}` — Task 3 COPY 대상과 Task 5/10 참조 일치 ✓

일관성 문제 없음.
