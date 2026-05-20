# 격리된 자율 개발 환경 — "Autonomous Dev in a Box" 설계

- **작성일**: 2026-05-21
- **상태**: 설계 승인 대기
- **목표**: Claude Code를 Docker로 격리한 환경에서 완전 자율(비대화형)로 개발을 수행하되, 호스트 PC가 절대 노출되지 않고 완성도 높은 코드를 산출한다.

---

## 1. 개요와 목표

호스트 Mac을 위험에 노출하지 않으면서 Claude Code가 스스로 개발을 끝까지 진행하는 환경을 만든다. 두 가지를 동시에 충족한다.

1. **격리 (Isolation)** — Claude Code 프로세스 전체가 Docker 컨테이너 안에서 돈다. 악성 의존성, 프롬프트 인젝션, 실수로 인한 `rm` 등 어떤 경로로도 호스트 파일시스템·시크릿·다른 프로세스에 닿지 못한다.
2. **완성도 (Quality)** — 기계적으로 검증 가능한 품질 게이트(타입체크·린트·테스트·커버리지·빌드·독립 리뷰)를 모두 통과해야만 "완료"로 인정한다. Claude의 자기 선언은 완료 근거가 아니다.

산출물은 두 가지다.

- **범용 도구**: 어떤 레포에든 붙일 수 있는 `autodev` 애드온 (`claude-workspace-template/addons/autodev/`)
- **AOS 적용**: 첫 검증 대상으로 AOS 레포에 실제 적용

## 2. 핵심 결정 요약

| 항목 | 결정 | 근거 |
|------|------|------|
| 개발 대상 | 범용 도구 + AOS 적용 | 재사용성 + 실전 검증 |
| 네트워크 격리 | iptables/ipset allowlist 방화벽 | 유출 경로 차단하면서 npm·pip·git은 허용 |
| 루프 구조 | 하이브리드 (Ralph 바깥 루프 + 멀티에이전트 안쪽 사이클) | 끈기 + 품질 동시 확보 |
| 실행 메커니즘 | Approach A — 외부 bash 루프 + 헤드리스 `claude -p` | fresh 컨텍스트 매 iteration, 공식적으로도 권장 |
| 품질 게이트 | 풀 게이트 + 독립 reviewer, 커버리지 80% | "완성도 높은 코드" 정의, AOS 기존 기준과 일치 |
| 결과물 통합 | PR 기반 (격리 브랜치 push, 사람이 merge) | main 자동 변경 0 — 격리의 마지막 한 겹 |
| 레포 공급 | 호스트 레포 read-only 마운트 + 컨테이너 내부 클론 | 미커밋 변경 반영 + 호스트 원본 불변 |
| 안쪽 서브에이전트 | AOS 기존 에이전트 재사용 | 이미 검증된 자산 활용 |
| 인증·과금 | 구독 OAuth 토큰(`CLAUDE_CODE_OAUTH_TOKEN`), `ANTHROPIC_API_KEY` 차단 | 정액제 — 종량제 과금 회피 |

## 3. 격리 아키텍처

```
┌─ 호스트 Mac ──────────────────────────────────────────────┐
│  run-autodev.sh  ──docker run──▶                           │
│   --env-file (구독 OAuth 토큰, GitHub PAT)                          │
│   --cap-drop ALL  +필수 cap 7종 (아래 불변식 3 참조)        │
│   --memory --cpus --pids-limit                             │
│   -v <repo>:/host-repo:ro       (read-only)                │
│   -v <out>/logs:/workspace/logs (쓰기 — 로그 회수용)        │
│   Docker 소켓 마운트 절대 없음                              │
└────────────────────────────┬───────────────────────────────┘
                             ▼
┌─ 컨테이너 (격리된 box) ─────────────────────────────────────┐
│  entrypoint.sh  (root, 최소 시간만)                         │
│   1. init-firewall.sh — iptables/ipset allowlist 적용       │
│   2. 방화벽 자가검증: 차단 도메인 curl → 실패해야 정상       │
│   3. /host-repo → /workspace/repo 로 git clone (쓰기가능)   │
│   4. devagent(non-root, uid 1000)로 권한 강등 (gosu)        │
│        ▼                                                     │
│  ralph.sh  ── 바깥 Ralph 루프 ──────────────────────┐       │
│   while iter < MAX_ITER and not DONE and not BLOCKED:│       │
│     timeout <T> claude -p "$(cat ORCHESTRATOR.md)" \ │       │
│       --output-format stream-json \                  │       │
│       --dangerously-skip-permissions \               │       │
│       --max-turns <N> --model opus \                 │       │
│       --settings /etc/autodev/settings.json          │       │
│     ralph.sh가 verify.sh 독립 재실행 → sentinel 검증 │       │
│   done                                               │       │
│        ▼ 완료: PR 생성 (origin 브랜치로만 push)      │       │
└──────────────────────────────────────────────────────┴──────┘
```

### 격리 불변식 (Invariants)

이 4가지가 깨지면 설계가 무효다.

1. **호스트 레포는 read-only 마운트만.** 컨테이너는 `/host-repo`를 읽어 `/workspace/repo`로 클론한다. 호스트 원본은 변경 불가능하다.
2. **Docker 소켓 미마운트.** `/var/run/docker.sock`을 주면 컨테이너가 호스트 권한으로 컨테이너를 띄울 수 있어 격리가 즉시 무너진다. 절대 마운트하지 않는다.
3. **capability 최소화.** `--cap-drop ALL` 후 꼭 필요한 7종만 재부여한다 — 방화벽용 `NET_ADMIN`·`NET_RAW`, gosu 권한 강등용 `SETUID`·`SETGID`, 클론 파일 소유권 변경용 `CHOWN`·`DAC_OVERRIDE`·`FOWNER`. `SYS_ADMIN`·`SYS_PTRACE`·`SYS_MODULE` 등 위험 cap은 drop 유지. `--privileged` 금지. (구현 중 확인: `NET_ADMIN`/`NET_RAW`만으로는 컨테이너 내 `gosu` 권한 강등과 `chown`이 실패한다.)
4. **결과는 PR로만.** 루프는 origin의 작업 브랜치로 push하고 PR을 생성할 뿐, main을 직접 바꾸지 않는다.

`--dangerously-skip-permissions`(= `--permission-mode bypassPermissions`)는 권한 프롬프트만 제거하며, `rm -rf /` 류 회로 차단기는 그대로 유지된다. 위 격리 불변식이 성립하는 컨테이너 안에서만 이 플래그를 쓴다 — 이것이 이 플래그가 설계된 용도다.

## 4. 컴포넌트 명세

모든 신규 파일은 `infra/docker/autodev/`(이미지·런타임) 및 `claude-workspace-template/addons/autodev/`(범용 애드온)에 둔다.

### 4.1 `Dockerfile.autodev` — 자율 개발 이미지

- 베이스: `node:20-slim` (Claude Code는 npm 패키지)
- 추가: Python 3.11 + `uv`, `git`, `gh` CLI, `jq`, `ripgrep`, `iptables`, `ipset`, `dnsutils`, `gosu`
- `npm i -g @anthropic-ai/claude-code`
- non-root 유저 `devagent` (uid 1000), `/workspace` 소유
- `ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]`
- 시크릿은 절대 baking하지 않는다 (런타임 env로만 주입)
- 기존 `infra/docker/Dockerfile.sandbox`의 non-root 패턴을 계승한다

### 4.2 `init-firewall.sh` — 네트워크 allowlist (root 실행)

iptables 기본 정책을 DROP으로 두고 다음만 허용한다.

- **아웃바운드 허용 도메인** (ipset으로 IP 동적 해석):
  - `api.anthropic.com` — Claude API (필수)
  - `registry.npmjs.org` — npm
  - `pypi.org`, `files.pythonhosted.org` — PyPI
  - `github.com`, `api.github.com`, `codeload.github.com` — git/PR
  - `autodev.config.yaml`의 `extra_allowed_domains`로 프로젝트별 추가
- **DNS(53)**: 컨테이너 resolver만 허용
- **루프백**: 허용
- **그 외 전부**: DROP (인바운드·아웃바운드)

공식 `anthropics/claude-code` devcontainer의 `init-firewall.sh`는 현재 공개 레포에 없으므로 직접 작성한다. ipset에 도메인 IP를 해석해 채우고, 해석 실패 시 컨테이너를 abort한다.

### 4.3 `entrypoint.sh` — 부팅 시퀀스 (root → devagent)

1. `init-firewall.sh` 실행
2. **방화벽 자가검증**: 차단되어야 할 도메인(예: `example.com`)에 `curl --max-time 5` → 성공하면 방화벽 미적용으로 판단하고 컨테이너 abort. 허용 도메인 1개는 성공 확인.
3. **인증 자가검증**: `unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN` 실행 (종량제 전환 경로 차단). 이어서 `CLAUDE_CODE_OAUTH_TOKEN`이 비어 있으면 컨테이너 abort.
4. `/host-repo`(ro) → `/workspace/repo` git clone, 작업 브랜치 생성 (`autodev/<spec-slug>-<timestamp>`)
5. `gosu devagent ralph.sh`로 권한 강등 후 루프 시작

### 4.4 `ralph.sh` — 바깥 Ralph 루프 (devagent 실행)

```
iter=0
while iter < MAX_ITER:
  if [ -f state/DONE ] or [ -f state/BLOCKED ]: break
  timeout $ITER_TIMEOUT claude -p "$(cat ORCHESTRATOR.md)" \
    --output-format stream-json --dangerously-skip-permissions \
    --max-turns $MAX_TURNS --model opus \
    --settings /etc/autodev/settings.json \
    | tee logs/iter-$(printf %03d $iter).jsonl
  # 완료 주장 독립 검증
  if [ -f state/DONE ]:
    if ! verify.sh: rm state/DONE   # 가짜 완료 거부
  # 정체 감지
  if 최근 STALL_LIMIT iteration 커밋 0: touch state/BLOCKED
  # 비용 cap
  if 누적 cost > COST_CAP: touch state/BLOCKED
  iter=iter+1
완료 시 (state/DONE + verify.sh 통과):
  claude -p (reviewer 전용, 전체 diff 독립 검증)
  if FINAL-REVIEW PASS: gh pr create
  else: touch state/BLOCKED
```

- `--bare`는 **쓰지 않는다.** 두 가지 이유: (1) orchestrator는 `CLAUDE.md`·서브에이전트·스킬을 모두 로드해야 한다, (2) `--bare`는 `CLAUDE_CODE_OAUTH_TOKEN`(구독 인증)을 읽지 않는다 (8.3 참조).
- exit code는 max-turns 초과·실패가 모두 1로 모호하므로, 완료 판정은 exit code가 아니라 `state/DONE` sentinel + `verify.sh` 독립 재실행에 의존한다.

### 4.5 `ORCHESTRATOR.md` — 매 iteration 투입 프롬프트

각 `claude -p`는 최상위 orchestrator 프로세스다(서브에이전트가 아니다 — 서브에이전트는 또 다른 서브에이전트를 소환할 수 없으므로 orchestrator는 반드시 최상위여야 한다). 한 iteration의 작업:

1. `state/PROGRESS.md` + `git log`를 읽어 현재 위치 파악 (external-memory 패턴)
2. `state/TASKS.md`에서 미완료 작업 단위 **1개** 선택
3. 안쪽 멀티에이전트 사이클 디스패치:
   - `planner` — 작업 계획
   - `implementer` — TDD 구현 (RED → GREEN → IMPROVE)
   - `reviewer` — **독립** 코드 리뷰 (fresh 컨텍스트)
   - `tester` — 품질 게이트 실행
4. 게이트 통과 → 작업 단위 1개 = 커밋 1개, `PROGRESS.md`·`TASKS.md` 갱신
5. 모든 TASKS 완료 + 전체 게이트 통과 → `state/DONE` sentinel 작성
6. 프로세스 종료 (다음 iteration은 새 프로세스 = fresh 컨텍스트)

iteration 0의 특수 작업: `SPEC.md`가 있고 `TASKS.md`가 없으면 `SPEC.md`를 체크박스 작업 목록 `TASKS.md`로 분해한다.

### 4.6 `verify.sh` — 기계적 품질 게이트

`autodev.config.yaml`의 명령들을 순서대로 실행하고 **전부 exit 0**이어야 통과한다. **순수 기계적 게이트만** 담당한다 (LLM 판단 불필요 — 그래야 `ralph.sh`가 독립 재실행할 수 있다).

- `tsc --noEmit` (dashboard)
- `lint` — eslint + ruff
- `pytest` + `npm test`
- 커버리지 ≥ **80%**
- `npm run build`

`ralph.sh`가 sentinel 검증 시 이 스크립트를 **독립적으로 재실행**한다. Claude가 만든 `state/DONE`을 신뢰하지 않고 직접 관찰된 exit 0만 완료 근거로 인정한다.

### 4.6b 리뷰어 게이트 — 2단계 적용

reviewer는 LLM 판단이 필요하므로 `verify.sh`에 넣지 않고 별도 2단계로 적용한다.

1. **사이클 내부** — orchestrator가 안쪽 사이클 4단계에서 `reviewer` 서브에이전트를 돌리고, PASS여야만 해당 작업 단위를 커밋한다.
2. **최종 독립 검증** — `ralph.sh`가 PR 생성 직전, 작업 브랜치 전체 diff에 대해 **새 `claude -p` reviewer 전용 호출**을 독립 실행한다 (구현 프로세스와 완전 분리된 fresh 프로세스). 이 호출이 PASS verdict를 `state/FINAL-REVIEW.md`에 쓰지 않으면 PR을 생성하지 않고 `BLOCKED` 처리한다.

### 4.7 `autodev.config.yaml` — 프로젝트별 설정

```yaml
gates:
  typecheck: "cd src/dashboard && npx tsc --noEmit"
  lint: "ruff check src/backend && cd src/dashboard && npm run lint"
  test: "pytest tests/backend && cd src/dashboard && npm test"
  build: "cd src/dashboard && npm run build"
coverage_threshold: 80
extra_allowed_domains: []
limits:
  max_iterations: 30
  max_turns_per_iteration: 60
  iteration_timeout_seconds: 3600
  stall_limit: 3            # 연속 커밋 0 iteration 수
  cost_cap_usd: 50
resources:
  memory: "8g"
  cpus: "4"
  pids_limit: 512
```

### 4.8 `run-autodev.sh` — 호스트측 런처

호스트에서 한 줄로 컨테이너를 기동한다. 이미지 빌드/실행, `--env-file`, read-only 레포 마운트, 로그 출력 볼륨, `autodev.config.yaml` 기반 리소스/cap 설정을 적용한다.

### 4.9 `/etc/autodev/settings.json` — 컨테이너 Claude 설정

```json
{
  "sandbox": { "enabled": false },
  "permissions": { "defaultMode": "bypassPermissions" }
}
```

`sandbox.enabled: false` — Docker 안에서 Claude Code 내장 샌드박스를 켜면 `enableWeakerNestedSandbox`(보안 약화)가 필요하다. 격리는 Docker(프로세스·FS·리소스) + iptables(네트워크)가 담당하므로 내장 샌드박스는 끈다.

## 5. 데이터 흐름과 상태 (External Memory)

매 iteration이 fresh 프로세스이므로 iteration 간 상태는 전부 파일·git로 전달된다. 이것은 버그가 아니라 설계다 — 컨텍스트 오염을 원천 차단한다.

| 경로 | 역할 |
|------|------|
| `/workspace/repo` | 작업 클론 (작업 브랜치 체크아웃) |
| `/workspace/state/SPEC.md` | 사용자가 제공한 작업 명세 (입력) |
| `/workspace/state/TASKS.md` | SPEC에서 분해된 체크박스 작업 목록 |
| `/workspace/state/PROGRESS.md` | iteration 간 진행 상황·결정·막힌 점 |
| `/workspace/state/loop-state.json` | iteration 카운터, 누적 토큰/비용, 타임스탬프 |
| `/workspace/state/DONE` / `BLOCKED` | 종료 sentinel |
| `/workspace/logs/iter-NNN.jsonl` | iteration별 stream-json 로그 (호스트 볼륨으로 회수) |
| git 커밋 히스토리 | 핵심 기억 — 작업 단위 1개 = 커밋 1개 |

## 6. 품질 게이트와 "가짜 완료" 방지

자율 루프의 최대 실패 모드는 **가짜 완료**다: Claude가 루프를 탈출하려고 완료를 거짓 선언하거나, 테스트를 약화시켜 통과시키는 것. 3중 방어:

1. **sentinel ≠ 완료.** `state/DONE`은 Claude가 쓰지만, `ralph.sh`가 `verify.sh`(기계적 게이트)를 독립 재실행해 확인한다. 게이트가 실패하면 `DONE`을 삭제하고 루프를 계속한다.
2. **독립 reviewer 2단계.** 사이클 내부에서 `implementer`와 분리된 `reviewer` 서브에이전트가 리뷰하고(자기 코드 자기 승인 불가), PR 생성 직전 `ralph.sh`가 전체 diff에 대해 fresh `claude -p` reviewer 호출을 독립 실행한다 (4.6b 참조).
3. **테스트 약화 감지.** reviewer 프롬프트에 "테스트 삭제·skip·약화 여부 점검"을 명시하고, `verify.sh`가 커버리지 임계값을 강제한다.

## 7. 에러 처리와 안전장치

| 위험 | 안전장치 |
|------|----------|
| 무한 루프 | `max_iterations` hard cap |
| 정체 (진전 없음) | `stall_limit` 연속 iteration 커밋 0 → `BLOCKED` sentinel + STOP |
| iteration 멈춤 | `--max-turns` + bash `timeout` 이중 |
| 토큰 소비 폭주 | `loop-state.json` 누적 usage 추적, `cost_cap_usd` 초과 → STOP |
| 의도치 않은 종량제 과금 | `ANTHROPIC_API_KEY` 미주입 + entrypoint `unset` + Console extra usage OFF 권장 (§8.2·§8.4) |
| 인증 누락 | entrypoint가 `CLAUDE_CODE_OAUTH_TOKEN` 부재 시 컨테이너 abort |
| 방화벽 미적용 | entrypoint 자가검증 실패 시 컨테이너 abort |
| 잘못된 결과가 main 오염 | 결과는 PR로만, main 자동 변경 0 |
| 컨테이너 탈취 | read-only 마운트 + 소켓 미마운트 + cap 최소화 + non-root |

막혔을 때 orchestrator는 `BLOCKED.md`에 시도한 것·막힌 원인·대안을 기록한다 (사람이 아침에 읽을 수 있도록).

## 8. 시크릿·인증 관리

이 프로젝트는 **Claude 정액제 구독**으로 동작한다. 인증 방식이 과금 구조를 직접 결정하므로 가장 신중히 다룬다.

### 8.1 구독 인증 (추가 과금 없는 경로)

- 사용자가 호스트에서 1회 `claude setup-token` 실행 → **1년 유효 OAuth 토큰** 발급 (Pro/Max 모두 지원, Free는 미지원)
- 컨테이너에 `CLAUDE_CODE_OAUTH_TOKEN` 환경변수로 `--env-file` 주입 — `~/.claude/.credentials.json` 마운트보다 권장 (컨테이너 uid/gid·파일 권한 문제 없음, macOS Keychain은 애초에 마운트 불가)
- 이 경로로 쓰면 **구독 요금에 포함, 토큰당 추가 과금 없음** (사용 한도 내에서)

### 8.2 종량제 전환 차단 — 핵심 안전장치

Claude Code 인증 우선순위에서 `ANTHROPIC_API_KEY`가 `CLAUDE_CODE_OAUTH_TOKEN`보다 **높다.** 컨테이너 환경에 `ANTHROPIC_API_KEY`가 새어들면 구독이 무시되고 **종량제(API 과금)로 전환**된다. 자율 루프는 다수 iteration을 돌리므로 이 사고는 비용이 크다. 3중 차단:

1. `ANTHROPIC_API_KEY`를 컨테이너에 **절대 주입하지 않는다** (`--env-file`·`-e`에서 제외). 호스트 `.env`에 그 키가 있으므로 `--env-file`은 OAuth 토큰·GitHub PAT만 담은 전용 파일을 쓴다.
2. `entrypoint.sh`가 부팅 시 `unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN` 실행 후, `CLAUDE_CODE_OAUTH_TOKEN`이 비어 있으면 컨테이너 abort.
3. `/etc/autodev/settings.json`에 `apiKeyHelper`를 두지 않는다 (이 또한 API 과금 경로).

### 8.3 `--bare` 금지 — 인증 호환성

`--bare` 모드는 `CLAUDE_CODE_OAUTH_TOKEN`을 **읽지 않으며** `ANTHROPIC_API_KEY`/`apiKeyHelper`를 요구한다. 즉 `--bare`를 쓰면 구독 인증이 동작하지 않는다. §4.4의 "`--bare` 미사용" 결정은 컨텍스트 로딩 이유에 더해 **구독 인증 호환성**이라는 두 번째 이유를 갖는다.

### 8.4 사용 한도와 과금 위험

구독은 5시간 rolling window + 주간 한도 + (2026-06-15부터) 월간 Agent SDK 크레딧(Pro $20 / Max 5x $100 / Max 20x $200)을 갖는다. 한도 도달 시:

- 5시간 윈도우 초과 → HTTP 429 throttle → Claude Code가 재시도
- 주간/월간 크레딧 소진 → **usage credits 자동 차감 → 표준 API 가격 종량 청구** (기본값 ON)

따라서 "정액제 = 절대 과금 없음"이 아니다. **사용자 조치 권장**: Anthropic Console의 extra usage / usage credits를 **OFF**로 설정하면 한도 도달 시 과금 대신 throttle(차단)만 발생한다. 설계의 `cost_cap_usd`·`max_iterations`는 토큰 소비 자체를 제한하는 보조 장치다 (`--output-format json`의 `cost` 필드로 누적 추적).

### 8.5 기타 시크릿

- GitHub PAT — fine-grained, **단일 레포**, contents + pull-requests write 권한만. OAuth 토큰과 함께 전용 `--env-file`에 담는다.
- DB·기타 `.env` 시크릿 — **컨테이너에 주입하지 않는다.** 자율 개발에 불필요하다. 통합 테스트가 DB를 쓰면 컨테이너 내부 ephemeral 인스턴스를 띄운다.
- 로그(`iter-NNN.jsonl`)에 시크릿이 섞이지 않도록 회수 전 마스킹 단계를 둔다.

## 9. 범용화 — 애드온 패키징

전체를 `claude-workspace-template/addons/autodev/`로 패키징한다.

```
claude-workspace-template/addons/autodev/
├── Dockerfile.autodev
├── init-firewall.sh
├── entrypoint.sh
├── ralph.sh
├── verify.sh
├── ORCHESTRATOR.md
├── run-autodev.sh
├── settings.json
├── autodev.config.yaml.example
└── README.md
```

새 레포 적용: `init.sh`로 애드온 추가 → `autodev.config.yaml` 작성 → `SPEC.md` 작성 → `run-autodev.sh`. 프로젝트 차이(게이트 명령·추가 허용 도메인·리소스 한도)는 전부 `autodev.config.yaml`이 흡수하므로 스크립트 자체는 프로젝트 무관하다.

AOS 적용: 위 애드온을 AOS 레포에 두고 첫 e2e 검증 대상으로 삼는다. 선택적으로 `.claude/commands/autodev.md` 슬래시 커맨드로 트리거를 노출한다.

## 10. 테스트 전략

| 테스트 | 검증 내용 |
|--------|-----------|
| 방화벽 — 차단 | 차단 도메인 curl → 실패 확인 |
| 방화벽 — 허용 | `api.anthropic.com`·npm·PyPI·github curl → 성공 확인 |
| 격리 | 컨테이너에서 호스트 경로 쓰기 시도 → 실패 확인 |
| 가짜 완료 | 게이트 실패 상태에서 `DONE` 작성 → `ralph.sh`가 거부하는지 |
| 정체 감지 | 진전 없는 더미 SPEC → `stall_limit`에서 `BLOCKED` 되는지 |
| e2e | 작은 더미 SPEC(예: 유틸 함수 1개 + 테스트)으로 전체 루프 1회 완주 → PR 생성 확인 |

## 11. 미해결 항목 / 리스크

- **공식 init-firewall.sh 부재** — 직접 작성하므로 도메인 allowlist 누락 시 npm/pip 설치가 실패할 수 있다. 첫 e2e에서 실측 보정한다.
- **헤드리스 서브에이전트 안정성** — 프로젝트 메모리상 specialist 에이전트가 Tool API 대신 XML을 텍스트로 출력하는 이슈가 있었다. orchestrator의 서브에이전트 디스패치는 `general-purpose` 계열 사용을 우선 검토한다.
- **iteration 비용** — opus 모델 + 다수 iteration은 비용이 크다. `cost_cap_usd`로 막되 첫 실행은 보수적 한도로 시작한다.
- **DNS 변동** — ipset에 IP를 고정하면 CDN IP 변경 시 차단될 수 있다. entrypoint에서 해석하되 장시간 루프는 재해석을 고려한다.
- **월간 Agent SDK 크레딧 (2026-06-15~)** — 헤드리스 `claude -p`는 Agent SDK 사용으로 카운트되어 별도 월간 크레딧(Pro $20 / Max 5x $100 / Max 20x $200)을 소모할 수 있다. 크레딧 소진 후 동작은 §8.4 참조.
- **Max 초과 과금 OFF 경로 미문서화** — 공식 문서에 usage credits를 끄는 정확한 Console 경로가 명시돼 있지 않다. 사용자가 Anthropic Console > Billing에서 직접 확인·설정해야 한다.

## 12. 출처

- Claude Code CLI Reference — https://code.claude.com/docs/en/cli-reference.md
- Headless / Non-Interactive Mode — https://code.claude.com/docs/en/headless.md
- Subagents — https://code.claude.com/docs/en/subagents.md
- Sandboxing — https://code.claude.com/docs/en/sandboxing.md
- Permission Modes — https://code.claude.com/docs/en/permission-modes.md
- Authentication — https://code.claude.com/docs/en/authentication.md
- Claude 플랜으로 Agent SDK 사용 (Support) — https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan
- 유료 플랜 extra usage 관리 (Support) — https://support.claude.com/en/articles/12429409-manage-extra-usage-for-paid-claude-plans
- Ralph 기법 (Geoffrey Huntley) — https://ghuntley.com/ralph/
