# 조언자–작업자–Codex 검증 · Claude Code 최종 셋업 (종합본)

> 이 문서 하나로 전체를 파악·설치할 수 있다.
> **한 번에 설치하려면 `install.sh` 를 실행**하고, 이어서 안내되는 Claude Code 명령 몇 줄만 넣으면 된다.
> (문서 하나만으로는 동작하지 않는다 — 아래 경로에 파일이 있어야 한다.)

```
~/.claude/
├── CLAUDE.md              # 전략·원칙 (규칙 파일, 모든 프로젝트 공통)
├── awesome-statusline.sh  # (기존 파일) 컨텍스트 예산 브리지 마커 블록이 삽입됨
└── agents/
    ├── architect.md       # 조언자 — 설계·위임 브리프 작성   (opus 별칭)
    ├── worker.md          # 작업자 — 구현·테스트            (Opus, 비용 우선 시 Sonnet)
    ├── analyzer.md        # 로컬 조사·요약 (토큰 절약)       (Haiku)
    └── researcher.md      # 외부 조사 — 웹·문서 (컨텍스트 격리) (Sonnet)
                           # 검증(reviewer) = Codex 플러그인이 담당 (별도 서브에이전트 없음)
```

---

## 1. 전략 개요 (Advisor–Worker–Codex)

설계·판단은 **조언자(Advisor)** 가, 실제 코딩은 **작업자(Worker)** 가, **검증은 Codex** 가 맡는다.
조언자와 작업자가 같은 모델이어도 분리는 유지한다 — 목적은 모델 등급 차이가 아니라 역할·컨텍스트
분리이며, 자기 결과를 자기가 승인하지 않게 만드는 것이 핵심이다. 작업자를 더 저렴한 모델로 내릴
때는 "언제 멈출지"를 모르므로 조언자의 통제가 특히 중요해진다.
이 역할 분리 구조는 특정 모델이 사라져도 유효한 방법론이다.

| 역할 | 담당 | 모델/도구 |
|---|---|---|
| 조언자 — 설계·판단·위임·최종 결정 | 메인 세션 또는 `architect` | `opus` |
| 작업자 — 구현·테스트 | `worker` | Opus (비용 우선 시 Sonnet) |
| **검증 — 코드 리뷰·적대적 검토** | **Codex 플러그인** | `/codex:review`, `/codex:adversarial-review` |
| 로컬 조사·요약 — 코드베이스·로그·파일 (토큰 절약) | `analyzer` | Haiku |
| **외부 조사 — 웹·라이브러리 문서·릴리스 노트** | **`researcher`** | **Sonnet** |
| 컨텍스트 예산 감시 | statusline 브리지 → GSD 모니터 훅 | — |

> 참고 실험(출처 문서, 교차검증 대상 · **과거 Fable 5 조언자 구성 기준이며 현재 구성의 수치가 아니다**):
> Fable 5 조언자 + Opus 작업자 ≈ $7.5·9분(최고 효율), Sonnet 단독 ≈ $20·59분(최악).
> 시사점만 취한다 — 통제 없는 단독 실행이 가장 비싸다.

**가장 중요한 원칙 — 검증은 무조건:** 작업자의 "완료" 보고를 그대로 믿지 않는다.
**Codex 리뷰로 diff를 실제 검토**한 뒤, 조언자가 지적 반영을 지시하고 통과 시 승인한다.

---

## 2. 적용 방식 3가지 (설정 강도별)

| 방식 | 지속성 | 모델 강제 | 편의 | 용도 |
|---|---|---|---|---|
| 1 직접 프롬프트 | ✕ (세션 한정) | ✕ | 즉시 | 1회성 |
| 2 CLAUDE.md (규칙 파일) | ○ | ✕ (지침만) | 높음 | 원칙·전략 |
| 3 서브에이전트 | ○ | ○ | 설정 필요 | 모델 고정 |

1. **직접 프롬프트** — 세션 시작 시 역할 분리 지시를 붙여넣기. 세션이 길어지면 흐려지고 매번 복붙.
2. **규칙 파일 = `CLAUDE.md`(대문자)** — Claude Code가 자동 로드. 글로벌은 `~/.claude/CLAUDE.md`, 프로젝트는 `./CLAUDE.md`/`.claude/CLAUDE.md`. **모델은 강제 못 함.**
3. **서브에이전트** — `.claude/agents/`(또는 `~/.claude/agents/`)에 `worker.md` 등을 만들고 프론트매터 `model:` 로 모델을 고정. 동적 모델 오배정을 원천 차단.

**이 번들 = 방식 2 + 3 + Codex 검증:** `CLAUDE.md`가 "무엇을/왜", 서브에이전트가 "어떤 모델로", Codex 플러그인이 "검증"을 담당한다.

---

## 3. Codex 검증 연동 (openai/codex-plugin-cc)

Claude Code 안에서 Codex로 코드 리뷰·작업 위임을 하는 공식 플러그인. 검증 단계를 여기에 맡긴다.

**주는 것**
- `/codex:review` — 표준 read-only 코드 리뷰(현재 변경 또는 `--base main` 브랜치 비교)
- `/codex:adversarial-review` — **조종 가능한 적대적 리뷰**. 설계·트레이드오프·실패 모드를 도전
- `/codex:rescue` — Codex에 작업 위임(버그 조사·수정). `--model`, `--effort`, `--background` 등
- `/codex:status` · `/codex:result` · `/codex:cancel` — 백그라운드 작업 관리
- `/codex:setup` — 설치/로그인 확인, 리뷰 게이트 on/off

**요구사항:** ChatGPT 구독(무료 포함) 또는 OpenAI API 키, Node.js 18.18+, Codex CLI(`@openai/codex`) 로그인.
사용량은 **Codex(ChatGPT) 사용 한도**에 계상된다(Claude 사용량과 별개).

**리뷰 게이트(옵션):** `/codex:setup --enable-review-gate` — 응답 종료 전 Codex가 자동 리뷰해 문제 발견 시 종료를 막는다. 강력하지만 Claude/Codex 루프로 **사용량을 빠르게 소모**하므로 감시하며 사용.

---

## 4. 두 가지 운용 모드

### 모드 A — 메인이 조언자 (간단)
1. `/model` 로 메인 세션을 조언자 모델(Opus)로 설정.
2. 설계는 메인이 직접, 구현만 위임:
   `> worker에게 이 작업 구현 맡겨. 완료 기준은 X, 검증은 /codex:review 무결점, 시도 3회 상한.`
3. 작업자가 diff 보고 → **`/codex:review` 실행 → 지적 반영 지시 → 통과 시 승인.**

### 모드 B — 메인은 저렴, 조언자는 버스트 (비용 최소)
1. 메인은 `sonnet`.
2. 설계가 필요할 때만 `> architect에게 설계 맡겨` (Opus 버스트).
3. 구현은 `worker`(Opus, 비용 우선 시 Sonnet).
4. 검증은 `/codex:review` (설계 도전은 `/codex:adversarial-review`).

---

## 5. 반드시 지킬 것
- 위임 시 **완료 기준 + 검증 방법(Codex 리뷰 통과) + 시도 상한**을 함께 준다(= 브리프).
- 작업자의 "완료" 보고를 믿지 말고 **`/codex:review` 로 검증**한다.
- 작업자는 스스로 "완료"를 확정하지 않는다 → 조언자가 완료 기준으로 중단시키고 Codex가 검증한다.
  (작업자를 저렴한 모델로 내릴수록 이 통제가 더 중요해진다.)
- 토큰 무거운 **로컬** 작업(코드베이스 분석·긴 로그·대량 요약)은 `analyzer`가 먼저 압축한다.
- **리서치·외부 도구는 메인에서 직접 호출하지 않는다:** 메인 세션(모드 A의 조언자)은
  WebSearch·WebFetch·tavily·context7 을 직접 부르지 않고 `researcher` 에게 위임해 **결론+출처 요약만** 받는다.
  서브에이전트가 이 도구들을 갖는 것은 모순이 아니다 — 컨텍스트가 분리되기 때문이다.
  (하드 차단은 불가능하다. `permissions.deny` 는 서브에이전트의 도구까지 함께 죽인다 → 규칙 기반 소프트 강제)
- **컨텍스트 예산 (조언자 세션):** 세션 시작 시점 대비 **+59k 토큰**을 쓰면 새 작업을 시작하지 않는다
  (베이스라인 50,905 기준 200k 창 사용률로는 약 55% 시점).
  `CONTEXT WARNING`/`CONTEXT CRITICAL` 이 주입되면 ① 진행 중 작업 마무리 → ② 상태 저장
  (`.planning/STATE.md` 있으면 `/gsd:pause-work` 제안, 없으면 HANDOFF.md 작성. 코드가 더러우면 `/wip-save` 병행)
  → ③ **새 세션 권고**(compact 보다 우선 — 무엇을 남길지 조언자가 직접 고를 수 있다).
  저장 포맷을 새로 만들지 않는다. 주입 문구의 숫자는 창 사용률이 아니라 **예산 소진율**이다.
- 큰 변경 리뷰는 `/codex:review --background` 후 `/codex:status`·`/codex:result` 로 확인.
- **worker 보고 수신:** 가능하면 동기 실행으로 결과를 직접 받는다. 백그라운드 실행 시 완료 보고
  텍스트가 조언자에게 전달되지 않을 수 있으므로, 보고를 기다리지 말고 산출물(staged diff·테스트 실행)을 직접 검증한다.
- **조언자 직접 코딩 금지:** 구현은 worker 위임이 기본값. 예외는 ① 단일 파일·30줄 이내 문서/설정 수정,
  ② **컨텍스트 핸드오프 문서(HANDOFF / pause-work) 작성 — 줄 수 제한 없음**(저장 대상이 메인 세션
  컨텍스트에만 존재해 위임이 원리적으로 불가능). 예외여도 Codex 검증은 동일 적용.
- **승인 후 정리:** 서브에이전트는 과제 완료 후에도 idle로 상주한다. 승인이 끝나면 TaskStop(또는
  `ctrl+x ctrl+k`)으로 종료해 상주 에이전트를 남기지 않는다.

---

## 6. 설치 (한 번에)

```bash
# 1) 파일 + Codex CLI + 설정을 한 번에 (이 README와 같은 폴더의 install.sh 실행)
bash install.sh                                        # 번들 폴더 안에서
# bash docs/codex-advisor-worker-bundle/install.sh     # 저장소 루트에서라면

# 2) 이어서 Claude Code 세션 안에서 (플러그인은 세션 내 명령)
#    /plugin marketplace add openai/codex-plugin-cc
#    /plugin install codex@openai-codex
#    /reload-plugins
#    /codex:setup           ← Codex 준비 상태 확인 / 필요 시 !codex login
#
# 3) 확인
#    /agents  → architect, worker, analyzer, researcher, codex:codex-rescue
#    /model   → opus 별칭/ID 확인 후 architect의 model 값과 일치시키기
```

`install.sh` 가 하는 일: `~/.claude/CLAUDE.md` 의 **번들 마커 블록만 갱신**(블록 밖 개인 내용 보존, 마커 없는 구버전은 백업 후 전체 생성), `agents/{architect,worker,analyzer,researcher}.md` 생성(내용 동일 시 백업 없이 건너뜀), 구버전 `reviewer.md` 백업 후 제거, **활성 statusline 스크립트에 컨텍스트 예산 브리지 블록 삽입**(마커 관리·백업, 아래 설명), **GSD 컨텍스트 모니터 훅 버전 대조**(불일치 시 경고만), Node/Codex 확인 및 `@openai/codex` 설치 시도, `~/.codex/config.toml` 검증 기본값(effort=high) 템플릿 생성.

**컨텍스트 예산 브리지 (새 훅 0개, `settings.json` 무수정):** 설치기는 `settings.json` 의
`.statusLine.command` 를 **읽기 전용**으로 파싱해 활성 statusline 스크립트를 찾고, `CURRENT_USAGE=` 줄
바로 뒤에 마커 블록을 삽입한다(기존 퍼미션·실행 비트 보존). 이 블록은 세션 첫 관측치를 baseline 으로
래치하고 그 **델타**를 예산 잔량(%)으로 합성해 `$TMPDIR/claude-ctx-{session_id}.json` 에 기록한다.
이미 `PostToolUse` 에 등록돼 있던 `~/.claude/hooks/gsd-context-monitor.js` 가 그 값을 읽어
잔량 ≤35% 에서 `CONTEXT WARNING`, ≤25% 에서 `CONTEXT CRITICAL` 을 컨텍스트에 주입한다.

- **왜 퍼센트가 아니라 델타인가:** 베이스라인(시스템 프롬프트+CLAUDE.md+스킬+도구 스키마)만으로
  이미 200k 창의 ~25% 를 쓴다. "창의 25%" 임계치는 첫 턴부터 참이 되어 무한 발동한다.
  델타 기준은 **창 크기와 무관**하게(200k든 1M이든) 같은 시점에 걸린다.
- **전제가 어긋나면 조용히 skip:** jq 없음 / `settings.json` 없음 / `.statusLine` 없음 /
  스크립트 부재 / 앵커(`CURRENT_USAGE=`) 없음 / 마커 구조 비정상 → 경고만 하고 설치는 계속된다.
- **statusline 은 메인 세션에만 렌더된다** → 서브에이전트는 감시 대상이 아니다. 이는 의도된 설계다.
  리서치 격리가 1차 방어(메인 델타가 애초에 천천히 참)이고, 이 트리거는 그것이 실패했을 때의 그물이다.

> **개인 커스터마이징은 CLAUDE.md 의 마커 블록 밖에 작성**할 것 — 재설치해도 보존된다.
> 마커: `<!-- codex-advisor-worker-bundle:start … -->` / `<!-- codex-advisor-worker-bundle:end -->`
> statusline 쪽 마커: `# <<< codex-advisor-worker-bundle:ctx-budget:start … -->>>` / `…:end -->>>`

---

## 7. 설치 파일 요약 (참고용 — 정본(SSOT)은 `install.sh` 의 heredoc)

### 7.1 `~/.claude/CLAUDE.md`
```markdown
# 글로벌 작업 원칙 (모든 프로젝트 공통)
# (핵심) 조언자(Opus) → 작업자 worker(Opus) → 검증 Codex(/codex:review) → 조언자 승인
# 검증은 무조건: worker "완료" 보고를 믿지 말고 /codex:review 로 diff 검토 후 승인.
# 운용 A: 메인=조언자(Opus), 구현=worker, 검증=/codex:review
# 운용 B: 메인=sonnet, 설계=architect 버스트, 구현=worker(Opus), 검증=Codex
# 토큰 무거운 작업은 analyzer(Haiku)로 분리, 큰 작업은 /codex:rescue 위임
```
> (전체 원문은 `install.sh` 가 생성하는 `~/.claude/CLAUDE.md` 참고)

### 7.2 `~/.claude/agents/architect.md` — 조언자 (opus 별칭)
```markdown
---
name: architect
model: opus    # 메인 세션과 같은 계열로 고정. 별칭 고정으로 동적 모델 오배정 차단
tools: Read, Grep, Glob    # 조사(WebSearch/WebFetch)는 researcher 담당 — 판단 컨텍스트를 원문으로 희석하지 않는다
---
설계·판단·위임만. 코드는 스켈레톤만, 구현은 worker에게.
브리프에 완료 기준 + 검증 방법(/codex:review 통과) + 시도 상한 포함.
```

### 7.3 `~/.claude/agents/worker.md` — 작업자 (Opus)
```markdown
---
name: worker
model: opus   # 비용 우선 시 sonnet
tools: Read, Write, Edit, Grep, Glob, Bash
---
1) 명세 엄격 준수  2) 임의 리팩터링 금지  3) 완료 후 조언자에게 보고(검증은 Codex /codex:review)
완료 기준까지만, 막히면 멈추고 보고. 보고 = 변경파일 + diff + 테스트 결과.
```

### 7.4 `~/.claude/agents/analyzer.md` — 로컬 조사·요약 (Haiku)
```markdown
---
name: analyzer
model: haiku
tools: Read, Grep, Glob, Bash
---
대량 입력을 압축해 결론만 반환(원문 덤프 금지). 판단·설계 안 함, 관찰만.
```

### 7.5 `~/.claude/agents/researcher.md` — 외부 조사 (Sonnet)
```markdown
---
name: researcher
model: sonnet
tools: WebSearch, WebFetch, Read, Grep, Glob,
       mcp__plugin_context7_context7__resolve-library-id, mcp__plugin_context7_context7__query-docs,
       mcp__tavily__tavily_search, mcp__tavily__tavily_extract, mcp__tavily__tavily_research
---
웹·라이브러리 문서 등 외부 조사 전담. 원문은 이 에이전트 컨텍스트에서 끝난다.
반환은 결론 → 근거(출처 URL) → 불확실한 부분. 인용은 항목당 3줄 이내.
라이브러리 문서는 context7 우선(resolve-library-id → query-docs).
판단·설계 안 함. 출처 상충 시 상충한다고 보고. 못 찾으면 "못 찾았다"고 보고(추측 금지).
```
> **MCP 도구는 실명으로 나열해야 한다.** 서브에이전트 `tools:` 는 **화이트리스트**라, 여기에 없는
> MCP 도구는 위임받은 `researcher` 도 쓸 수 없다 → "메인은 직접 호출 금지" 규칙과 겹치면
> **아무도 못 쓰는 상태**가 된다. 와일드카드(`mcp__…__*`) 지원 여부는 **미검증**이라 쓰지 않는다.
> **MCP 서버명은 환경마다 다르다**(플러그인 설치 방식에 따라 `mcp__context7__*` 형태일 수 있음).
> `/agents` 에서 실제 노출되는 도구명을 확인하고 맞춰 조정할 것.

> `analyzer`(로컬·Haiku)와 나누는 이유: "대량 원문 압축"과 "외부 조사·출처 판단"은 요구 모델 등급이
> 다르다. 한 에이전트에 섞으면 어느 쪽이든 손해다.

> 위 블록은 요약본이다. 실제 설치되는 전문은 `install.sh` 안의 heredoc과 동일하다.

---

## 8. 주의 · 교정 사항
- **모델 별칭:** 어드바이저는 `opus` 별칭. `/model` 로 사용 가능한 별칭 확인. `opus`·`sonnet`·`haiku`·`fable` 은 표준 별칭.
- **모델 고정:** 조언자·작업자 모두 `opus` 별칭. 자동 폴백은 두지 않는다. `--fallback-model`은 과부하(503)에만 발동하고 **한도 소진(429)에는 발동하지 않으므로** 폴백 수단으로 신뢰하지 않는다.
- **소진 대비 vs 소진 후:** 모드 B는 메인 세션만 `sonnet`으로 내리는 **절약책**이며, 그 안에서도 `architect`·`worker`는 그대로 `opus`를 호출한다 → 소진 후 대책이 아니다. Opus 소진 후 경로는 둘 — (a) 두 에이전트의 `model:` 을 `sonnet` 으로 임시 하향, (b) `/codex:rescue` 로 Codex(별도 한도)에 위임.
- **구형 모델 ID 금지:** `claude-3-opus-20240229` 같은 옛 ID 대신 `opus`(= 현재 Opus 계열) 사용.
- **파일명은 대문자 `CLAUDE.md`.** `claude.md`/`agent.md` 아님.
- **CLAUDE.md는 강제가 아니라 지침.** 모델 고정은 서브에이전트 `model:` 이, 검증은 Codex가 담당.
- **Codex 사용량은 ChatGPT/Codex 한도에 별도 계상.** 리뷰 게이트는 사용량 소모가 크니 상시 켜지 말 것.
- **비용 수치는 출처 영상 기반**이라 교차검증 대상. 원칙(역할 분리 + 검증)만 신뢰.
- 프로젝트별로 덮어쓰려면 같은 파일을 `.claude/`(프로젝트 루트)에 두면 된다.
