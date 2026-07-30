# 검토 · 컨텍스트 예산 트리거 + 리서치 격리 + 역할 재분배

> 대상 번들: `docs/codex-advisor-worker-bundle/` (조언자–작업자–Codex 검증)
> 작성일: 2026-07-27 · 상태: **검토(설계 제안)**, 미구현
> 요청 원문: "컨텍스트 사용량이 20~25%에 도달하면 현재 작업 상태를 문서로 저장하고 Compact하거나
> 새 세션에서 요약만 다시 로드해 이어서 진행 / 리서치·외부 도구 호출은 서브에이전트로 분리하고
> 메인 대화에는 최종 요약만"

---

## 0. 결론 (요약)

| 항목 | 판정 | 근거 |
|---|---|---|
| 퍼센트 임계치 | **창 대비 퍼센트로는 구현 불가** → 베이스라인 델타 **59k** 로 대체 (사용자 지정 50~55% 에서 역산) | 실측 baseline 50,905 토큰 (200k 창의 25.5%) |
| 기능의 신규성 | **신규 아님. 이미 절반 설치돼 있고 배선이 끊겨 있음** | 브리지 파일 0건, 모니터 2종 모두 사문화 |
| 저장 포맷 | **새로 만들지 않는다.** 기존 경로에 위임 | GSD 주입 문구가 handoff 파일 작성을 금지 |
| 번들이 새로 소유할 것 | **트리거 한 가지뿐** (언제 멈출지) | 나머지는 전부 중복 |
| 리서치 격리 | **소프트 강제만 가능** (하드 차단 불가) | permissions.deny는 서브에이전트도 함께 죽임 |
| 역할 분배 | `researcher` 신설 + `architect` 도구 축소 + 조언자에 HANDOFF 책임 명문화 | 아래 §8 |
| install.sh 비용 | 함수 1개 추가(~40줄), **settings.json 미수정** | 마커 블록 삽입 기법 재사용 |

핵심 문장 하나로: **번들에 추가할 것은 "저장 기능"이 아니라 "정지 신호"다.**

---

## 1. 실측 근거

### 1.1 베이스라인이 이미 25.5% — 퍼센트 임계치는 양쪽 끝에서 깨진다 (L1 · 확실성 High)

이 검토 세션의 트랜스크립트에서 직접 계산:

```
transcript: ~/.claude/projects/-Users-younghwankang-Work-Agent-System/312e9b12-….jsonl
계산식: input_tokens + cache_creation_input_tokens + cache_read_input_tokens

첫 assistant 턴 (= 베이스라인)   50,905
24턴 후 (도구 무거운 조사)        99,929      delta 49,024
```

| 창 크기 | 베이스라인 | 24턴 후 | "25% 도달" 판정 |
|---|---|---|---|
| 200,000 | **25.5%** | 50.0% | **턴 0에서 이미 참** → compact 무한 루프 |
| 1,000,000 | 5.1% | 10.0% | 250k 필요 → **사실상 미발동** |

베이스라인 51k의 정체는 시스템 프롬프트 + CLAUDE.md 6종(글로벌 1 + rules 5 + 프로젝트 1 + rules 4)
+ MEMORY.md 인덱스 + 스킬 목록 + 도구 스키마다. 사용자가 첫 글자를 치기 전에 이미 소비된 고정 비용이며,
MCP 서버나 스킬을 추가하면 더 커진다.

→ **임계치는 창 대비 퍼센트가 아니라 "세션 베이스라인 위의 델타"여야 한다.**

### 1.2 컨텍스트 모니터 2종이 모두 사문화 상태 (L1 · High)

```
~/.claude/hooks/gsd-context-monitor.js      PostToolUse 등록됨. 그러나
  └ /tmp|$TMPDIR/claude-ctx-{session}.json 부재 → existsSync 가드에서 매번 즉시 종료
     (실측: /tmp 0건, $TMPDIR 0건)
     원인: 브리지를 쓰는 쪽이 gsd-statusline.js 인데,
           활성 statusLine 은 awesome-statusline.sh 로 교체돼 있음 (settings.json)

~/.claude/hooks/universal/contextMonitor.js  Stop 등록됨. 그러나
  └ 토큰이 아니라 "상호작용 횟수"(15/25회) 기반이고,
     존재하지 않는 /save-and-compact 명령을 권고 (~/.claude/commands 에 없음)

~/.claude/skills/external-memory/SKILL.md   "Automatic Trigger: Token Threshold (150K)" 라고
  └ 선언만 하고 감지 수단이 없음 (user-invocable: false 라 사용자가 부를 수도 없음)
```

세 건 모두 같은 실패 양식이다 — **감지 수단 없는 규칙은 사문화된다.**
따라서 이번 추가의 성패는 "규칙을 잘 쓰는 것"이 아니라 "감지가 실제로 살아있게 하는 것"에 달려 있다.

> **2026-07-29 갱신 — 세 건의 처리 결과.** 초판은 "세 번째 모니터를 추가하지 말고 GSD를 되살린다"로
> 결론지었으나, 그 대가(R1·R3)가 구조적이라 **번들 소유 훅으로 전환**했다(§3.2). 모니터 총량은
> 늘지 않는다 — 셋 다 처리됐다:
> ① `gsd-context-monitor.js` → 무수정·휴면(브리지 파일명이 달라 `existsSync` 가드에서 종료).
>    settings.json 엔트리는 그대로 두므로 GSD 자체 용도로는 계속 살아 있다.
> ② `hooks/universal/contextMonitor.js` → **조건부 제거.** 횟수 기반이라 토큰 기반 트리거와
>    개념이 충돌하고 존재하지 않는 `/save-and-compact` 를 권고한다. 단 무조건 지우지 않는다 —
>    `~/.claude/commands/save-and-compact.md` 가 **없음을 기계적으로 확인**했을 때만 제거하고,
>    같은 배열 원소의 다른 훅(`stopEvent.js`·`cleanup-bg-shells.sh`)이 함께 지워지지 않도록
>    **내부 훅 단위**로 걷어낸다.
> ③ `external-memory` 스킬의 "Token Threshold (150K)" → 이제 감지 수단이 생겼으므로
>    Context Budget Trigger 로 문구를 교체했다.

### 1.3 GSD 모니터의 주입 문구가 요청 동작을 금지한다 (L1 · High)

`gsd-context-monitor.js:120-141` — 되살렸을 때 실제로 모델에게 주입되는 텍스트:

| 분기 | CRITICAL 메시지 요지 |
|---|---|
| `.planning/STATE.md` 있음 | "Do NOT start new complex work **or write handoff files** — GSD state is already tracked in STATE.md. … run `/gsd:pause-work`" |
| 없음 | "Do NOT autonomously save state or write handoff files **unless the user asks**" |

즉 "브리지만 살리면 끝"이 아니다. 그대로 두면 트리거가 살아나는 순간
**요청하신 동작(상태 문서 저장)을 금지하는 문장**이 컨텍스트에 주입된다.

> **실측 정정 (구현 후 Red-Green으로 확인, 2026-07-27):**
> AOS에 `/Users/…/Agent-System/.planning/STATE.md`가 **실재하는데도 실제로 주입된 것은
> 비-GSD 분기**였다 — `"…Do NOT autonomously save state or write handoff files **unless the user asks**."`
> 이후 같은 세션에서 **GSD 분기가 뜬 경우도 관찰**됐다. 즉 분기는 저장소 상태가 아니라
> **도구 호출 시점의 `data.cwd`에 따라 매번 달라진다**(`isGsdActive`는
> `path.join(data.cwd, '.planning','STATE.md')`를 본다 — 셸 cwd가 리셋된 호출에서는 비-GSD로 떨어진다).
> **설계에는 영향 없다** — §5의 규칙이 두 분기를 모두 처리하고, 실제로 뜬 쪽은
> "unless the user asks" 예외를 가진 관대한 분기다. 다만 `isGsdActive` 판정을
> **신뢰할 수 있는 분기 조건으로 가정하지 말 것**. 번들 규칙은 주입 문구가 어느 쪽이든
> `.planning/STATE.md` **존재 여부를 조언자가 직접 확인**해 저장 경로를 고르도록 쓰여 있다.

해소는 §5에서 다룬다. 결론만 미리: **번들이 저장 포맷을 소유하지 않으면 모순이 사라진다.**

### 1.4 활성 statusline은 필요한 입력을 이미 받고 있다 (L1 · High)

```bash
# ~/.claude/awesome-statusline.sh
CONTEXT_SIZE=$(… '.context_window.context_window_size // 200000')
CURRENT_USAGE=$(… '.context_window.current_usage // null')
#   → input_tokens + cache_creation_input_tokens + cache_read_input_tokens 로 합산 중
# 없는 것: .session_id  (브리지 파일명에 필요 — 1줄 추가로 해결)
```

statusline 훅은 Claude Code가 **매 렌더마다** 호출하고 `context_window`를 통째로 넘겨준다.
델타 계산에 필요한 모든 재료가 이미 이 프로세스 안에 있다. 추가 계측 불필요.

### 1.5 리서치 격리는 하드 차단이 불가능하다 (L3 · Medium)

- `permissions.deny`에 `WebSearch`/`WebFetch`/`mcp__tavily__*`를 넣으면 **서브에이전트도 같이 죽는다.**
  격리의 목적지인 `researcher` 자신이 도구를 잃는다.
- `PreToolUse` 훅이 "메인 세션 vs 서브에이전트"를 판별할 신뢰 가능한 입력 필드는 확인되지 않았다.
  (`SubagentStart`/`Stop` 이벤트는 있으나 PreToolUse 페이로드의 서브에이전트 표식은 미검증)

→ 리서치 격리는 **규칙 + 전용 에이전트**로 가는 소프트 강제가 현실적 상한이다.
   이 항목만 확신도가 낮으므로, 하드 차단을 원하시면 별도 실험이 필요하다.

---

## 2. 중복 인벤토리 — 무엇을 만들지 *않을* 것인가

이 하네스에는 "상태를 저장한다"는 도구가 이미 과잉이다.

| 기존 자산 | 무엇을 저장하나 | 이번 요청과의 관계 |
|---|---|---|
| `/wip-save` (AOS) | **코드 상태** (`checkpoint:` WIP 커밋) | 겹치지 않음. 상보적 — HANDOFF와 함께 쓰면 좋음 |
| `/gsd:pause-work` | GSD 워크플로우 상태 (`.planning/STATE.md`) | **직접 겹침.** AOS에서는 이쪽이 정본 |
| `_workspace/RUN_STATE.md` (AOS 하네스) | 하네스 Phase별 실행 상태 | 하네스 실행 중에 한정. 조언자 세션 일반에는 미적용 |
| `/session-wrap` (AOS) | 세션 종료 시 문서·패턴·후속작업 정리 | 세션당 1회·수동. 임계 발동용으로는 무거움 |
| `external-memory` 스킬 | 리서치 플랜·findings·체크포인트 | 트리거가 죽어 있음. 다중 에이전트 전용 |
| `gstack-context-save/restore` | git 상태 + 결정 + 잔여 작업 | 범용 대안. 플러그인 의존 |

**판정: 새 저장 포맷을 만들면 7번째 중복이 된다.** 번들은 트리거만 소유하고, 저장은 위임한다.

```
GSD 활성 (.planning/STATE.md 존재)  →  /gsd:pause-work        ← AOS가 여기
GSD 비활성                          →  HANDOFF.md 1장 작성
어느 쪽이든 코드가 더러우면          →  /wip-save 병행
```

이 분기는 GSD 주입 문구와 **정확히 일치**한다 (§1.3의 표를 다시 보면, GSD 분기는 `/gsd:pause-work`를
지시하고 비-GSD 분기는 "unless the user asks" 예외를 열어둔다 — 번들 CLAUDE.md 규칙이 곧 그 "user asks").
모순이 소멸한다.

---

## 3. 트리거 설계 — 베이스라인 델타

### 3.1 계산

```
baseline  := 예산 기준점  (세션별 상태파일 …-base 에 래치)
prev      := 직전 관측값  (세션별 상태파일 …-prev — 재래치 판정 전용)
delta     := current_tokens - baseline
BUDGET    := 59_000        # 조언자 세션의 실작업 예산
```

- **창 크기와 무관하다.** 200k 창이든 1M 창이든 같은 시점에 발동한다.
  요청의 진짜 의도가 "컨텍스트 고갈 방지"가 아니라 **"조언자의 판단력을 깨끗하게 유지"**이므로 이게 맞다.
  (1M 창에서는 고갈이 영원히 안 오지만, 판단력 저하는 똑같이 온다.)
- **59k의 근거:** 사용자 요청("문서 저장이 200k 창 사용률 50~55% 시점에 걸릴 것")에서 역산한 값이다.
  베이스라인 50,905 기준 `200,000 × 0.55 − 50,905 ≈ 59,000`.
  실측 환산 — 이 세션에서 도구 무거운 오리엔테이션 24턴에 delta 49k였으므로
  59k ≈ **조사 위주 약 29턴** 분량. 창 사용률은 어디까지나 역산의 입력이고,
  실제 판정 기준은 창 크기와 무관한 델타다(아래 참조).
- **compact 후 재래치 — 기준은 baseline 이 아니라 `prev`(직전 관측값)다.**

  ```
  prev 없음 또는 base 없음   → base := current, (최초 관측/상태파일 유실)
  current < prev            → base := current   ← 관측값 하락 = compact 발생
  그 외                      → 유지
  항상 마지막에               prev := current
  ```

  **`current < baseline` 을 쓰면 안 되는 이유 (Codex 5라운드 지적 A):** compact 는 시스템 프롬프트·
  CLAUDE.md·도구 스키마(= baseline 을 구성하는 고정 비용)를 그대로 두고 대화만 요약으로 대체한다.
  결과는 `baseline + 요약` 이라 **대개 baseline 보다 크다** → 조건이 영원히 거짓 → 예산이 리셋되지
  않고 compact 이전 delta 를 그대로 물려받아 **compact 직후 즉시 재발동**한다(디바운스 상태도 승계).
  실측(구버전 코드): 50,905 → 109,905 → **62,000(compact)** 시퀀스에서 잔량이 100 이 아니라 **86**,
  다음 관측 113,000 에서 **22**(이미 CRITICAL). prev 기반으로 고치면 각각 **100 / 36** 이다.
- **재래치 시 디바운스 상태도 함께 지운다** (필수 — 안 하면 compact 후 첫 5회 경고가 삼켜진다):

  ```bash
  rm -f "$TMPDIR/claude-ctx-$SESSION_ID-warned.json"
  ```

  근거: `gsd-context-monitor.js:86`이 읽는 `-warned.json`은 **별도 파일**이고,
  **session_id는 compact를 건너서도 바뀌지 않는다.** 추적하면 —
  compact 직전 `{callsSinceWarn:0, lastLevel:'critical'}` 기록 → 재래치로 delta≈0,
  합성 remaining=100 → 모니터가 `remaining > WARNING_THRESHOLD` 가드에서 종료(파일 미갱신) →
  다음 임계 도달 시 `firstWarn=false`, `currentLevel='warning'` vs `lastLevel='critical'` 이라
  `severityEscalated=false` → **디바운스 5회가 그대로 적용돼 초기 경고가 유실**된다.

### 3.2 번들이 자기 훅을 소유한다 (2026-07-29 전환)

> **이전 설계(폐기):** 브리지가 `remaining_percentage := 100 - delta*100/78_666` 을 **합성**해
> GSD 플러그인 소유 `gsd-context-monitor.js`(≤35 WARNING, ≤25 CRITICAL)에 실어 보냈다.
> 훅 0개·`settings.json` 무수정이 대가였지만 두 가지를 지불했다 —
> **(a) R1**: 플러그인 업데이트로 임계치·스키마·메시지가 바뀌면 조용히 깨진다.
> **(b) R3**: 주입문의 `Usage at X%` 가 창 사용률이 아니라 예산 소진율이라, 상태줄(25%)과
> 경고(100%)를 나란히 본 사용자에게 둘 중 하나가 고장 난 것처럼 읽힌다.
> 둘 다 **구조적**이라 문구로는 못 고친다. 그래서 소유권을 옮겼다.

브리지는 **사실만** 기록하고, 판정은 번들 소유 훅이 델타로 직접 한다.

```
$TMPDIR/claude-ctx-advisor-{session_id}.json
{"session_id":"…","baseline":50905,"current":102038,"delta":51133,
 "window":1000000,"window_pct":10,"timestamp":1785166725}

  window     := .context_window.context_window_size  (없으면 200000)
  window_pct := current * 100 / window     ← 표시 전용. 판정에 쓰지 않는다
```

판정은 `~/.claude/hooks/advisor-context-budget.js` 가 한다:

```
delta >= 59_000 → CRITICAL
delta >= 51_133 → WARNING
그 외           → exit 0 (디바운스 파일도 건드리지 않는다)

파일 없음 / 파싱 실패 / timestamp 60초 초과 → 조용히 exit 0
디바운스: 도구 호출 5회. 첫 경고는 즉시. WARNING→CRITICAL 승격은 디바운스 우회
어떤 예외에서도 도구 실행을 막지 않는다 (try/catch → exit 0)
stdin 이 10초 안에 안 닫히면 exit 0 (파이프 행 방지)
```

**임계 수치는 그대로다** (51,133 / 59,000). 이번 전환은 *누가 훅을 소유하는가*이지 임계치
재조정이 아니다. 둘을 동시에 바꾸면 회귀가 생겼을 때 원인을 가릴 수 없다.
합성 매핑의 부산물이던 `BUDGET_RAW=78_666`·`floor()` 역산·`remaining_percentage`·`used_pct` 는
**전부 삭제**했다 — 잔량 퍼센트를 경유하지 않으므로 역산 자체가 불필요하다.

**R3 해소 — 메시지가 두 축을 분리해 말한다:**

```
CONTEXT BUDGET WARNING: 세션 시작 대비 +51,133 토큰 사용 (컨텍스트 창은 10% 사용 — 고갈 아님).
조언자 예산이 한계에 가깝습니다. 새 복잡 작업을 시작하지 말고 진행 중인 작업을 마무리하세요.
```

예산 소진과 창 고갈은 다른 축이다. 한 문장에 둘 다 적으면 상태줄과 경고가 어긋나 보이지 않는다.
(`window_pct` 가 없으면 "컨텍스트 창 사용률은 미상"으로 적고 판정은 그대로 진행한다.)

**`.planning/STATE.md` 존재 여부는 훅이 판정하지 않는다** — §1.3 실측 정정대로 `data.cwd` 가
도구 호출마다 달라져 신뢰할 수 없다. 조언자가 직접 확인하도록 **문구로만** 지시한다.

**GSD 훅은 건드리지 않는다.** 브리지 파일명이 `claude-ctx-advisor-{sid}.json` 으로 바뀌면
`gsd-context-monitor.js` 는 `existsSync` 가드에서 종료 — 이 변경 이전의 **원래 휴면 상태**로
자연히 돌아간다. `settings.json` 의 GSD 엔트리는 그대로 둔다. 구 배선이 남긴 잔여 파일
(`claude-ctx-{sid}.json`·`-base`·`-prev`·`-warned.json`)은 **매 렌더 무조건**
**정확한 이름으로만** 제거한다(글롭 금지 — 다른 세션 파일을 휩쓸지 않기 위해서다).

> **왜 재래치 경로가 아니라 무조건인가 (실측 근거).** 초안은 "첫 렌더"의 근사치로 재래치 경로에
> 걸었으나, 업그레이드 시점에 **이미 advisor 파일이 있던 세션**은 재래치가 발생하지 않아
> 구 브리지가 살아남는다. 그 상태에서 GSD 훅에 세션을 먹이면 실제로 주입된다 —
> `CONTEXT CRITICAL: Usage at 80%. Remaining: 20%.` (낡은 합성값). 이 기능이 없애려던 바로 그
> 혼동이 되살아난다. 불변식을 **"advisor 렌더가 한 번이라도 돌면 구 파일은 없다"** 로 바꿨다.
> 비용은 렌더당 `rm -f` 1회(리터럴 4개)로, 이미 매 렌더 수행하는 `printf` 와 같은 수준이다.
>
> 남는 한계: **죽은 세션**의 구 파일은 렌더가 다시 돌지 않으므로 남는다. GSD 훅의 60초
> staleness 가드가 걸러내므로 무해하며, 정리하려면 수동 삭제가 필요하다.

**대가 (정직하게):** `install.sh` 가 텍스트 삽입기에서 **JSON 병합기로 승격**된다(§7 표의
"전용 훅 신설" 행). 사용자의 살아있는 `settings.json` 에 쓰므로 파싱→수정→재출력 · 백업 ·
원자적 교체 · 유효성 게이트(실패 시 백업 복원 후 중단)가 전부 필요하다.

---

## 4. 배선 설계 (번들 소유 훅 1개, settings.json 멱등 병합)

```
Claude Code
   │ statusline JSON (context_window, session_id)  ── 매 렌더
   ▼
awesome-statusline.sh   ← 번들이 마커 블록 삽입 (백업 후, 마커 밖 보존)
   │   baseline 래치 → delta 계산 → '사실만' 기록 (합성 없음)
   │   $TMPDIR/claude-ctx-advisor-{session_id}.json
   ▼
advisor-context-budget.js  ← 번들 소유. install.sh 가 생성 + settings.json 에 병합
   │   delta >= 51,133 / 59,000 판정 → additionalContext 주입 (5툴 디바운스)
   ▼
모델 컨텍스트에 경고 등장 (예산 델타 + 창 사용률을 분리 표기)
   │
   ▼
~/.claude/CLAUDE.md 번들 블록의 규칙이 대응을 규정 (§6)

gsd-context-monitor.js   ← 무수정·미사용. 브리지 파일명이 달라 existsSync 가드에서 종료(휴면)
```

**대상 스크립트가 만족해야 할 앵커 2종 (수동 삽입 시에도 동일):**

| 앵커 | 역할 | 불만족 시 |
|---|---|---|
| `^CURRENT_USAGE=` | 삽입 위치(이 줄 뒤) + 토큰 합산값의 출처 | 대상에서 제외 |
| `input=` 선언 | 삽입 블록이 참조하는 stdin 변수명이 `input` 임을 보장 | 대상에서 제외(경고 후 skip) — 다른 이름(`payload=$(cat)` 등)이면 블록이 미정의 `$input` 을 읽어 브리지가 조용히 죽고 stderr 에 `unbound variable` 이 매 렌더마다 새어나온다 |

두 번째 앵커의 정규식 정본은 `install.sh` 의 `CTX_INPUT_ANCHOR` 단일 정의다. 선행 공백과
`export` / `declare -x` / `local` / `typeset` 접두사를 허용한다 — 좁게 잡으면 `export input=$(cat)`
처럼 **정상 동작하던** 스크립트가 '정리 경로'로 흘러들어가 잘 돌던 브리지가 삭제된다.

stdin 을 다른 변수명으로 받는 statusline 을 쓴다면, 위 블록의 `"$input"` 을 그 변수명으로 바꿔
수동 삽입한다. **그렇게 수리한 블록은 재설치에서 보존된다** — 설치기는 마커 존재만이 아니라
블록 본문이 `$input` / `${input}` 을 참조하는지까지 보고 제거 여부를 정한다(마커는 소유권을
말하지 건강 상태를 말하지 않는다).

**심링크 대상:** statusline 이 dotfiles 저장소로의 심링크면 설치기가 **실제 경로까지 해석(최대 5홉)한 뒤**
그 파일에 쓴다. 심링크 자체를 일반 파일로 갈아치우지 않는다(연결이 조용히 끊어지는 것을 막는다).

**남의 파일 수정 문제:** `awesome-statusline.sh`는 번들 소유가 아니다.
번들이 CLAUDE.md에 쓰는 것과 동일한 **마커 블록 + 백업** 기법을 그대로 적용한다
(`install.sh`의 `backup_file`/`install_file` 헬퍼 재사용). 마커 밖 사용자 커스터마이징은 보존된다.

**이번 범위에 넣지 않는 것:** `~/.claude/hooks/universal/contextMonitor.js` (Stop 훅).
사문화 상태이긴 하나(§1.2) 이 트리거와 **충돌하지는 않는다** — Stop 시점에 횟수를 출력할 뿐이다.
번들 소유 파일도 아니어서 손대려면 statusline과 같은 마커/백업 규율이 필요하다.
`golden-principles.md`의 surgical-changes 원칙에 따라 **별도 후속 과제로 분리**한다.

---

## 5. GSD 주입 문구와의 정합 (§1.3 해소)

```
주입: "…Do NOT write handoff files — GSD state is already tracked in STATE.md.
       Inform the user so they can run /gsd:pause-work…"

번들 규칙(대응): GSD 활성이면 handoff를 쓰지 않는다. /gsd:pause-work 를 제안한다.
                 GSD 비활성이면 HANDOFF.md 를 쓴다 (= 주입문의 "unless the user asks" 충족).
```

두 지시가 **같은 방향을 가리키므로** 모델이 어느 쪽을 따를지 고민할 여지가 없다.
번들이 자체 저장 포맷을 고집했다면 여기서 상충이 발생했을 것이다 — 이것이 §2 "저장은 위임" 판단의 실질 근거다.

---

## 6. Compact vs 새 세션 — 실측에 근거한 판정

요청에는 둘 다 언급돼 있으나, 실측을 넣으면 우열이 갈린다.

```
compact 후 잔존:  베이스라인 51k (시스템·CLAUDE.md·스킬·도구스키마) + 자동 생성 요약
새 세션 시작:     베이스라인 51k (동일) + 조언자가 고른 HANDOFF
```

**절감 토큰은 사실상 같다** — 양쪽 다 51k에서 다시 시작한다. 실제로 다른 변수는 하나뿐:
**delta 자리를 무엇이 채우느냐.** 자동 요약(통제 약함) vs 조언자가 직접 고른 결정 로그(통제 강함).

조언자–작업자 구조에서는 남길 것이 명확하다 — 설계 결정, 완료 기준, 검증 상태, 시도 횟수.
자동 요약은 이걸 보존한다는 보장이 없다.

→ **권고: 새 세션 + HANDOFF 를 기본, `/compact`는 예외.**
   단, 번들은 이를 *권고*로만 쓴다. compact를 강제할 수단이 없고 사용자 선택이기 때문.

---

## 7. install.sh 변경 비용

| 안 | settings.json | 새 훅 | install.sh 증분 | 위험 |
|---|---|---|---|---|
| 초판 채택안 (폐기) | 무수정 | 0개 | 마커 삽입 함수 1개 ≈ 40줄 | 낮음. 단 **GSD 내부 구현에 의존**(R1) + 숫자 의미 왜곡(R3) |
| **전용 훅 신설 (2026-07-29 채택)** | **수정** — 기존 이벤트·Orca 항목을 보존하는 멱등 JSON 병합 | 1개 | ≈ 190줄 (훅 heredoc + 병합 + 게이트) | 중간. 아래 규율로 방어 |

초판이 쌌던 이유는 "이미 등록된 훅에 데이터를 흘려보내기만" 했기 때문이고, 그 대가가 R1·R3였다.
전환 후 설치기는 텍스트 치환기 → **JSON 병합기**로 승격된다. 살아있는 설정 파일에 쓰므로 규율이 필요하다:

| 규율 | 이유 |
|---|---|
| `python3`/`jq` 로 파싱→수정→재출력 (문자열 치환·sed 금지) | 치환은 구조를 모르므로 조용히 문서를 깨뜨린다 |
| 멱등 판정은 **커맨드 부분문자열**(`advisor-context-budget.js`) | 전체 문자열 대조는 PATH 접두사만 바뀌어도 중복 엔트리를 만든다 |
| `ensure_ascii=False` + `indent=2` + 끝 개행 | 기본값이면 한글이 `\uXXXX` 로 전부 이스케이프돼 diff 가 읽을 수 없게 된다 |
| 쓰기 전 백업 · 같은 디렉토리 임시본 + 원자적 `mv` | 중간 실패로 설정이 빈 파일로 남는 것을 막는다 |
| 쓴 뒤 재파싱 실패 → 백업 복원 후 `exit 1` | 설정이 깨진 채 남는 것보다 설치 실패가 낫다. 정상 경로(파싱→덤프)는 항상 유효한 JSON 을 내므로 이 게이트는 잘린 쓰기·중단된 쓰기용 안전망이다 |
| 제거는 **내부 훅 단위** | `Stop` 의 contextMonitor 는 `stopEvent.js`·`cleanup-bg-shells.sh` 와 배열 원소를 공유한다. 그룹째 지우면 무관한 훅 2개가 함께 사라진다 |
| `python3`/`jq` 둘 다 없으면 경고 후 skip | 설치 전체를 실패시키지 않는다 |

**JSON 문서 동일성 ≠ 바이트 동일성.** 파싱→덤프 왕복이므로 원본 바이트 보존은 원리적으로 불가능하다.
보존 검증은 "추가/제거 대상만 양쪽에서 걷어낸 뒤 정규화 JSON 을 깊은 비교"로 한다(엔트리 개수 세기는 불충분).

---

## 8. 역할 재분배

### 8.1 변경 후 역할표

| 역할 | 담당 | 모델 | 변경 |
|---|---|---|---|
| 조언자 — 설계·판단·위임·승인 | 메인 세션 / `architect` | opus | **+ HANDOFF 작성 책임 (위임 불가)** |
| 작업자 — 구현·테스트 | `worker` | opus | 변경 없음 |
| 로컬 압축 — 코드베이스·로그·파일 | `analyzer` | haiku | **경계 축소: 로컬 전용 명시** |
| **외부 조사 — 웹·MCP·라이브러리 문서** | **`researcher` (신설)** | **sonnet** | **신규** |
| 검증 — 리뷰·적대적 검토 | Codex | — | 변경 없음 |
| 컨텍스트 예산 감시 | statusline 브리지 → GSD 모니터 | — | **신규 배선** |

### 8.2 `researcher` 신설이 필요한 이유

`analyzer`(haiku)에 웹 도구를 얹는 대안은 두 성격을 한 파일에 섞는다 —
"대량 원문 압축"(haiku로 충분)과 "외부 조사·출처 판단"(haiku로는 부족).
모델 등급이 서로 다른 두 일을 한 에이전트에 두면 어느 쪽이든 손해다.

```markdown
---
name: researcher
description: 웹·MCP 외부 조사 전담. 라이브러리 문서, 릴리스 노트, 외부 사례 조사에 사용.
  원문을 삼키고 결론+출처만 반환해 메인 세션 컨텍스트를 보호한다.
tools: WebSearch, WebFetch, Read, Grep, Glob,
       mcp__plugin_context7_context7__*, mcp__tavily__*
model: sonnet
---
너는 외부 조사 담당이다. 조사 원문은 네 컨텍스트에서 끝난다.
- 반환은 결론 → 근거(출처 URL/문서 위치) → 불확실한 부분. 원문 인용은 3줄 이내.
- 판단·설계는 하지 않는다. 상충하는 출처는 상충한다고 보고한다.
- 라이브러리/프레임워크는 context7 우선 (학습 데이터보다 최신).
```

### 8.3 `architect` 도구 축소 (부수 개선)

현재 `architect`는 `WebSearch, WebFetch`를 갖는다. 서브에이전트라 **메인 컨텍스트 오염은 없지만**,
판단 전용 에이전트의 컨텍스트를 조사 원문으로 채우는 건 그 자체가 손해다 —
`architect`가 존재하는 이유는 "깨끗한 컨텍스트에서 내리는 설계 판단"이고, 원문 덤프는 그걸 희석한다.
(조언자·작업자가 모두 opus로 고정된 뒤로는 "비싼 모델 아끼기"가 아니라 **판단 품질**이 주된 근거다.)
조사는 `researcher`(sonnet)로 넘기고 `architect`는 요약만 받는 것이 일관적이다.

```diff
- tools: Read, Grep, Glob, WebSearch, WebFetch
+ tools: Read, Grep, Glob
```

### 8.4 규칙이 구속하는 범위 (명확화)

리서치 격리 규칙은 **모드 A의 메인 세션**을 구속한다.
서브에이전트가 웹 도구를 갖는 것은 모순이 아니다 — 컨텍스트가 분리돼 있기 때문이다.
번들 문서에 이 문장을 넣지 않으면 규칙이 자기모순으로 읽힌다.

### 8.5 HANDOFF는 왜 위임 불가인가 (구조적 제약)

저장해야 할 내용(설계 결정, 왜 그 대안을 버렸는지, 검증 상태)은 **메인 세션의 대화 안에만** 존재한다.
서브에이전트는 원리적으로 그것을 볼 수 없다. 따라서 조언자 본인이 쓴다.

→ 번들의 **"조언자 직접 코딩 금지(예외: 단일 파일·30줄 이내 문서/설정)"** 조항에 카브아웃이 필요하다.
   HANDOFF는 30줄을 넘기 쉽다.

```diff
  예외(조언자 직접 처리 허용): 단일 파일이며 30줄 이내의 문서·설정 수정.
+ 예외 2: 컨텍스트 핸드오프 문서(HANDOFF/pause-work) 작성 — 줄 수 제한 없음.
+   근거: 저장 대상이 메인 세션 컨텍스트에만 존재해 위임이 원리적으로 불가능.
```

### 8.6 관측: 리서치 격리가 1차 방어, 트리거는 2차 안전망

statusline은 **메인 세션에만** 렌더링된다 → 서브에이전트 컨텍스트는 감시 대상이 아니다.
이건 결함이 아니라 설계 의도와 맞는다: 무거운 조사를 서브에이전트로 밀어내면
메인의 델타가 애초에 천천히 찬다. 트리거는 그게 실패했을 때 걸리는 그물이다.

---

## 9. 번들 CLAUDE.md 블록에 추가할 문안 (초안)

```markdown
## 컨텍스트 예산 (조언자 세션)
세션 시작 시점 대비 +59k 토큰을 쓰면 새 작업을 시작하지 않는다.
컨텍스트 경고가 주입되면(WARNING/CRITICAL) 즉시 다음을 한다:
1. 진행 중 작업을 자연스러운 지점에서 마무리
2. 상태 저장 — `.planning/STATE.md` 있으면 `/gsd:pause-work` 제안,
   없으면 HANDOFF.md 작성(결정·완료기준·검증상태·다음 단계). 코드가 더러우면 `/wip-save` 병행
3. 새 세션 권고 (compact보다 우선 — 남길 것을 조언자가 직접 고를 수 있다)
저장 포맷을 새로 만들지 않는다. 위 경로 중 하나를 쓴다.

## 리서치·외부 도구는 메인에서 직접 호출하지 않는다
메인 세션(모드 A의 조언자)은 WebSearch/WebFetch/tavily/context7을 직접 부르지 않는다.
`researcher`에게 위임하고 결론+출처 요약만 받는다. 로컬 대량 입력은 `analyzer`.
서브에이전트가 이 도구들을 갖는 것은 모순이 아니다 — 컨텍스트가 분리되기 때문.
```

---

## 10. 리스크 · 가정

| # | 항목 | 수준 | 비고 |
|---|---|---|---|
| R1 | ~~GSD 플러그인 내부 의존~~ | **해소됨** (2026-07-29) | 번들이 `advisor-context-budget.js` 를 **직접 소유**한다. 임계치·브리지 스키마·메시지가 전부 번들 안에 있어 GSD 업데이트의 영향을 받지 않는다. 버전 핀 대조(`GSD_HOOK_PIN`)도 의존이 사라져 제거했다 |
| R2 | ~~GSD가 컨텍스트 경고를 끌 수 있음~~ | **해소됨** (R1과 동반) | `.planning/config.json` 의 `hooks.context_warnings=false` 는 GSD 훅만 끈다. 번들 훅은 그 설정을 읽지 않는다(§3.2 — `data.cwd` 를 신뢰할 수 없어 의도적으로 미구현) |
| R3 | ~~합성 `remaining_percentage`의 의미 왜곡~~ | **해소됨** (2026-07-29) | 합성 매핑을 폐기하고 브리지가 사실값(`delta`/`window_pct`)만 기록한다. 메시지가 예산 델타와 창 사용률을 **분리 표기**하고 "고갈 아님"을 명시한다 |
| R3b | **설치기가 `settings.json` 에 쓴다** | Medium | R1/R3 해소의 대가. 파싱→수정→재출력(문자열 치환 금지) · 백업 · 원자적 `mv` · 유효성 게이트(실패 시 백업 복원 후 `exit 1`) · 커맨드 부분문자열 기준 멱등으로 방어한다. `python3`/`jq` 둘 다 없으면 경고 후 skip |
| R4 | 리서치 격리는 소프트 강제 | Medium | 하드 차단 수단 미확인 (§1.5, L3) |
| R5 | BUDGET 59k는 사용자 지정값 | Medium | 사용자 요청(200k 창 사용률 50~55%)에서 역산. 턴 수 환산(≈29턴)만 1개 세션 표본(조사 편중) 실측이므로, 위임 위주 세션에서 재측정 권장 |
| R6 | statusline 미호출 환경 | Low | headless/cron 실행 시 statusline이 안 돌면 브리지도 없음 → 훅은 조용히 종료(무해) |

**가정**
- A1. 최초 요청의 "20~25%"는 목표 수치가 아니라 **"조언자를 일찍 정지시킨다"는 의도**의 표현이었다.
  이후 사용자가 발동 시점을 **200k 창 사용률 50~55%** 로 명시했고, 델타 59k가 그 지점(≈55%)을 재현한다.
- A2. 저장 포맷 중복 제거가 새 포맷 신설보다 가치가 크다 (사문화 3건이 근거).
- A3. 이 검토는 **미구현**이다. 채택 시 §11로 진행.

---

## 11. 채택 시 다음 단계 (worker 브리프 초안)

> 조언자–작업자 원칙상 구현은 worker에게 위임하고, Codex 검증을 통과해야 승인한다.

**범위 (2개 파일)**
1. `install.sh` — statusline 마커 삽입 함수 추가(baseline 래치 + 재래치 시 `-warned.json` 삭제 포함)
   + `researcher.md` heredoc 추가 + `architect.md` tools에서 WebSearch/WebFetch 제거
   + CLAUDE.md 블록에 §9 문안 추가 + GSD 훅 버전 기록/불일치 경고
2. `README_조언자-작업자-전략.md` — 역할표(§8.1), 예외 카브아웃(§8.5), 배선도(§4) 반영
   > Fable→Opus 이관은 **이미 완료**돼 있다(워킹트리 실측: `install.sh` fable 0건,
   > README 잔존 3건은 과거 실험 각주·별칭 목록으로 의도적). 건드리지 말 것.
(`researcher.md`는 별도 파일이 아니라 `install.sh` 안의 heredoc으로 들어간다 — 기존 3종과 동일 방식)

**완료 기준**
- `bash install.sh` 재실행이 **멱등** (2회 실행 후 diff 0, 백업 파일 1세트만)
- 마커 밖 statusline 커스터마이징 보존 확인
- 새 세션에서 `$TMPDIR/claude-ctx-*.json` 생성 확인 — **단, 이건 writer만 증명한다**
- **Red-Green 종단 검증 (이것이 유일한 결정적 증거)**:

  | 단계 | 조작 | 기대 |
  |---|---|---|
  | GREEN | 브리지 파일에 `remaining_percentage: 20` 강제 기록 | 다음 도구 호출 후 컨텍스트에 `CONTEXT CRITICAL` **문자열이 실제로 등장** (구 GSD 훅 메시지 — 현행은 `CONTEXT BUDGET …`) |
  | RED | 브리지 파일 삭제 | 경고가 사라짐 |

  근거: §1.2의 실패는 "훅은 등록됐는데 파일이 없었다"였다. 거울상 실패(파일은 있는데
  GSD 업데이트로 리더가 사라짐 / R2의 `context_warnings:false` / matcher 불일치)는
  **파일 존재 확인만으로는 통과하고 죽은 채로 출하된다.** RED 단계 없이는 주입과 우연을 구분할 수 없다.
- `/agents`에 `researcher` 노출 확인
- settings.json **무변경** 확인 (md5 비교)

**후속 과제(이번 범위 밖)**: `~/.claude/hooks/universal/contextMonitor.js` 폐기 검토 (§4)

**검증 방법**: `/codex:review` 무결점. 설치기 변경이므로 `--scope working-tree`.
**시도 상한**: 3회. 멱등성이 2회 안에 안 잡히면 멈추고 보고.

---

## 부록 · 재현 명령

```bash
# 베이스라인/델타 실측
TR=~/.claude/projects/-Users-younghwankang-Work-Agent-System/<session>.jsonl
python3 -c "
import json,sys
rows=[]
for l in open(sys.argv[1]):
    try: d=json.loads(l)
    except: continue
    u=(d.get('message') or {}).get('usage')
    if u: rows.append(u.get('input_tokens',0)+u.get('cache_creation_input_tokens',0)+u.get('cache_read_input_tokens',0))
print('baseline',rows[0],'now',rows[-1],'delta',rows[-1]-rows[0])" "$TR"

# 브리지 사문화 확인
ls $TMPDIR/claude-ctx-*.json /tmp/claude-ctx-*.json 2>/dev/null || echo "브리지 없음 = 모니터 미동작"

# GSD 분기 판정
ls .planning/STATE.md 2>/dev/null && echo "GSD 분기" || echo "비-GSD 분기"
```
