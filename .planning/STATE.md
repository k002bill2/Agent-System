# Project State

## Project Reference
See: `.planning/PROJECT.md`
**Core value:** Claude Code 에이전트 체계적 협업
**Current focus:** **800줄 초과 파일 분할 프로그램 — B4 머지 완료, B5 계획 완료·구현 미착수**

## Current Position
Phase: **B5** (백엔드 분할) — **5/5 완료. PR #247 · CI 9/9 통과 · 머지 대기**
https://github.com/k002bill2/Agent-System/pull/247 · 브랜치 `refactor/split-backend-b5`
CI 실측: Backend Lint 30s · Backend Tests **2m36s** · Backend Type Check 1m28s ·
Frontend Build/Knip/Lint/Tests(**2m47s**)/Type Check · CI Success — 전부 pass.
Linux CI 에서 백엔드 테스트가 통과했다는 것은 로컬의 유일한 실패(RAG 플레이크)가
환경 문제였음을 재확인한다.

| Task | 대상 | 결과 | 커밋 |
|---|---|---|---|
| 1 | `models/git.py` 991 | → 10모듈 (최대 189) + `__init__` 재노출 | 승격 `ff20c2f` → 분할 `c2ed1fa` |
| 2 | `api/usage.py` 1,244 | → 5모듈 (최대 435) + 테스트 41건 갱신 | 베이스라인 `fa9f711` → 승격 `521787a` → 분할 `571182f` |
| 3 | `orchestrator/nodes.py` 1,714 | → 6모듈 (최대 518) + 문자열 패치 7회 갱신 | 베이스라인 `97fa48b` → 엔진 `7b2bcb4` → 승격 `d3cce14` → 분할 `1445ccf` |
| 4 | `external_usage_service.py` 932 | → 3모듈 (최대 350) + httpx 패치 7회 갱신 | 배정표 `de30fbf` → 승격 `028aa9e` → 분할 `634740f` |
| 5 | `terminal_service.py` 867 | → 4모듈 (최대 433) + `MODULE` 상수 1줄 갱신 | 배정표 `517537a` → 승격 `a3bbdec` → 분할 `6160bff` |

**B5 대상 5개 5,748줄이 전부 800 이내로 들어왔다.** 최대치: 189(models/git) ·
435(api/usage) · 518(nodes) · 350(external_usage) · 433(terminal).
Codex 리뷰는 Task 1~3 시점에 **지적 0건**으로 통과했고, Task 4·5는 최종 리뷰 대기.

**800줄 초과 백엔드 파일: 20개 → 15개** (실측 2026-08-09, 테스트 제외).
남은 15개는 전부 집중도 48% 이상이거나 `api/v1`(죽은 코드, 제외 결정)이며,
계획서의 B5.5(48~65% 혼합 5개) · B6(70% 이상) 대상이다.

- 계획: `docs/plans/2026-08-09-oversized-file-split-b5.md` (착수 전 실측 6항목 완료)
- 브랜치: `refactor/split-backend-b5` (main `2ae6eb9`에서 분기, 미푸시)
- 완료 배치: **B1**(PR #238) · **B2**(PR #241·#242) · **B3**(PR #243) · **B4**(PR #246, squash `2ae6eb9`) — 전부 머지됨

Last activity: 2026-08-09
Live handoff: **없음** — 재개 아티팩트는 제거했다. 다음 작업은 B4 브랜치를
푸시·PR 하거나, 상위 계획서의 **B5**로 넘어가는 것이다.

### B4 진행 — 완료 (브랜치 미푸시, PR 미생성)
| Task | 대상 | 결과 | 커밋 |
|---|---|---|---|
| 0 | 착수 전 실측 5건 | 훅 추출 처방 폐기 → 섹션 추출 | `c653d0d` |
| 1 | `NotificationRuleEditor` 1,156 | → 734 (5파일) | `0d22bd1` |
| 2 | `WorkingDirectory` 952 | → **530** (7파일) | `3ebc73d` |
| 3a | `AnalyticsPage` 1,691 → 정의 이동(기계적) | → 958 (10파일, 한도 초과가 의도) | `14c4e38` |
| 3b | `AnalyticsPage` 차트 그리드 3섹션 추출 | → **708** (13파일) | `06dfc7f` |

**B4 대상 3파일 3,799줄이 전부 800 이내로 들어왔다** (734 · 530 · 708).
`PlaygroundPage`(1,748줄)는 착수 전 사용자 결정으로 제외 — `useState` 26개인
단일 거대 컴포넌트라 파일 분할이 아니라 상태 구조 재설계 문제이고 B6 성질이다.

**B4에서 확정된 레이아웃 규칙 (B5·B6가 같은 질문에 부딪힌다).**
공통 원칙은 **메인 파일을 옮기지 않는 것**이다 — 그래야 테스트의 `'../X'`와 배럴의
`'./X'`가 글자 그대로 유효해서 패키지 승격(`X.tsx` → `X/index.tsx`)이 통째로 불필요해진다.
부품의 위치는 대상이 어디 있느냐로 갈린다:

| 상황 | 배치 | 사례 |
|---|---|---|
| 컴포넌트 1개짜리 디렉토리 | 같은 디렉토리에 평면 | Task 1 `components/notifications/` |
| **여러 컴포넌트를 공유하는** 디렉토리 | kebab-case 중첩 디렉토리 | Task 2 `components/git/working-directory/` (선례 `components/usage/llm-access/`) |
| `pages/`의 페이지 | `components/<도메인>/` | Task 3 `components/analytics/` |

세 번째 행이 중요하다. `pages/`에는 하위 디렉토리가 **하나도 없어서** `pages/analytics/`
쪽이 오히려 신설 관례가 되고, 이 레포의 지배적 관용은 "페이지의 부품은
`components/<도메인>/`에 산다"이다 (`project-configs` 탭 9종 · `workflows` ·
`organizations` · `monitor`가 전부 그 형태).

**계획서 인벤토리가 두 번 같은 오차를 냈다.** Task 1과 Task 3a 모두 "타입·상수"로 묶은
구간에 실제로는 **API 호출 레이어가 섞여** 있었다(`api.ts` 분리로 대응). 3a에서는 상수
2종이 API 함수들 *사이에* 끼어 있기까지 했다 — **섹션 배너가 아니라 정의 단위 경계로
잘라야 하는 이유**다. B5 착수 시 인벤토리의 "타입·상수 N줄"은 근사치로만 쓸 것.

> 이 프로그램은 GSD `.planning/phases/` 구조를 쓰지 않는다. 계획은 `docs/plans/`에 있고
> 배치(B1~B6)가 phase 역할을 한다. 상위 계획: `docs/plans/2026-08-04-oversized-file-split.md`

## Accumulated Context

### 최근 작업 이력

**1. Tmux 인터랙티브 터미널 설정**
- `claude -p` (print) → `claude` (interactive TUI) 모드 전환
- `_clean_env()`로 CLAUDECODE/ANTHROPIC 환경변수 격리 (팀원 모드 hang 방지)
- pane_id 지원 (split-window 모드)
- SSE 스트림을 heartbeat 전용으로 단순화
- 커밋: `3321fc3`, `8255621`, `21fcc1f`

**2. Organization 멤버 디테일 드로어**
- MemberDetailDrawer: 슬라이드 오버 패널 (멤버 상세 + 사용량)
- memberRoleConstants.ts: 역할 아이콘/컬러/라벨 공유 상수 추출
- MemberCard/MemberList/MemberUsagePanel: memo() + displayName
- 커밋: `da99352`, `8255621`

**3. Gemini Review 파이프라인** — **제거됨** (`9611c31`, 2026-06-06)
- Gemini **CLI 서비스 종료** 대응으로 하네스 전체 삭제 (23파일 −1,854줄): 훅·데몬·스크립트,
  `hooks.json` PostToolUse 등록, `GEMINI.md`, `.gemini/`, 템플릿 addon, `.gitignore` 규칙
- 설계 실패가 아니라 **외부 의존 소멸**이 사유다 — 되살릴 근거가 생기지 않는 한 재도입 검토 불필요
- 제품 **Gemini LLM 프로바이더(API 기반)는 보존**됐다. CLI 종료와 무관하므로 혼동하지 말 것

**4. Power Stack 통합** ✅
- GSD: `~/.claude/commands/gsd/` (v1.26.0, 42+ 명령어)
- Superpowers: `~/.claude/plugins/data/superpowers-*` (13+ 스킬)
- Gstack: `~/.claude/skills/gstack/` (v0.15.8.0, 35+ 스킬, `--prefix` 모드)
- `.planning/`: GSD 상태 관리 ✅
- 상세: `docs/guides/power-stack-integration.md` 참조

### Task 7 완료 (2026-07-31) — PR #223, merge `aee34ca`

결과: **열린 Dependabot 알림 0건.** 알림 #59(`@babel/core` LOW)·#85(`react-router` HIGH) 모두 `fixed`.
`main` 실물 대조도 일치 — `@babel/core@7.29.7`, `react-router`·`react-router-dom` 부재.
CI 8/8 pass(Frontend 4잡 포함 = Linux `npm ci` 정합 증명), Codex 리뷰 지적 0건.
신규 `#87 brace-expansion HIGH`는 GitHub `auto_dismissed`(development scope) — 조치 대상 아님.

착수 시 HANDOFF.json의 전제 두 가지가 실측으로 뒤집혔다. 다음은 그 기록이다.

- **HIGH `react-router` (알림 #85)는 메이저 업그레이드 건이 아니다.** `react-router-dom`은 **미사용 의존성**이다 — `src/dashboard` 전체에서 `react-router` 문자열은 `package.json:32` 한 줄뿐이고 소스 import 0건. 대시보드는 Zustand 기반 자체 네비게이션(`src/stores/navigation.ts` + `src/routes.ts`)을 쓴다. 따라서 7→8 업그레이드가 아니라 **제거**가 정답이며, 알림은 `dismissed`가 아니라 `fixed`로 닫힌다.
- **"Dependabot에 위임" 지침은 이 2건에 적용 불가.** security updates는 enabled·not paused인데도 30일간 PR이 0건이다. `@babel/core`는 부모(`eslint-plugin-react-hooks@7.1.1`)가 이미 최신이라 올릴 대상이 없고 Dependabot은 `overrides`를 추가하지 않는다. `react-router`는 수정본이 메이저 경계 너머(8.3.0)라 제약 만족 범위 밖이다.
- **`npm audit fix` 금지.** lock 전체 재해석이 macOS에서 플랫폼별 optional dependency(`@emnapi/*` 등)를 잘라내 Linux CI `npm ci`를 깨뜨린다(PR #134 실패 원인). 게이트는 lock diff의 `-` 라인에 플랫폼 엔트리가 없을 것: `git diff -U0 -- package-lock.json | grep '^-' | grep -Ei 'emnapi|@rollup/rollup-|@esbuild/|-linux-|-darwin-|-win32-'` → 빈 출력.
- 부수 발견: `knip`(미사용 의존성 탐지기)이 **CI에 배선돼 있지 않다**. 미사용 `react-router-dom`이 오래 남은 구조적 원인.

### Blockers/Concerns
- ~~Gemini Bridge 파일 크기 초과~~ — **무효** (2026-08-04 확인). 해당 파일은 `9611c31`(2026-06-06)에서
  하네스째 삭제돼 약 2개월간 stale한 항목이었다
- **800줄 초과 파일** — 프로그램 진행 중. **B1~B5 완료**, 백엔드 잔여 **15개**(실측 2026-08-09).
  상위 계획서: `docs/plans/2026-08-04-oversized-file-split.md`. 테스트 파일은 한도 제외(사용자 결정 2026-08-04).
  잔여 15개는 전부 집중도 48% 이상(B5.5·B6 대상)이거나 `api/v1/agent_registry.py`(프로덕션
  소비자 0건이라 제외 결정). **이들은 "정의 이동만" 으로 안 되고 메서드 추출이 필요하다** —
  그 신호가 나오면 멈추고 재판정하는 것이 B5 계획서의 계약이다.
  ~~상위 계획서 배치 표가 낡았다~~ — **해소됨 (2026-08-09).** 실제로는 B1~B4 가 이미 완료
  표시돼 있었고 미표시는 **B5 하나뿐**이었다(이 STATE.md 의 "B2~B5 미표시" 기술 자체가
  낡았던 것 — 이전 세션이 갱신했는데 여기 반영되지 않았다). B5 행에 완료 표시를 채웠다.
  **교훈: 문서에 적힌 부채 기술도 실측 대상이다.** 그대로 믿고 "표 4개 수정"으로 접근했으면
  이미 맞는 행을 다시 건드렸을 것이다
- ~~knip 미배선~~ — **해소됨** (PR #224, `2898eaf`). `frontend-knip` 블로킹 잡 + `ci-success.needs` 등록. 범위는 의존성 소견만(`knip --dependencies`); exports·types·files·duplicates는 설계 판단 영역이라 의도적으로 제외했다
- **다중 세션 워킹트리 공유 위험(이번 세션 실측)** — worker가 브랜치를 조작하는 동안 메인 세션이 같은 워킹트리의 파일을 편집해 stash 충돌 발생. Codex 리뷰도 같은 이유로 1차 실행이 엉뚱한 diff를 리뷰함. 병행 시 검증 도구는 `git worktree add --detach`로 격리할 것

### 스킬 보안 감사 (2026-08-03) — PR #231, merge `af29e7f`

SkillSpector v2.5.1로 스킬 33개 + 커맨드 18개 스캔. **악의적 패턴 0건**, 정적 고유 14건은 전부
소스 대조로 오탐 판정(`grep -v` 제외필터를 접근으로 오인, `npx tsc`는 로컬 바이너리, `nohup`은 detach).
스킬별 baseline 7종 커밋(Red-Green 7/7 → 0건).

착수 시 전제가 실측으로 뒤집힌 것 두 가지:

- **`claude_cli` 프로바이더는 지원된다.** `scan --help`의 env 설명이 실제 레지스트리보다 뒤처져 있었다.
  help로 기능 유무를 판정하지 말 것 — 레지스트리/디스패치 코드를 볼 것. 로컬 인증이라 API 키·외부 전송 없음
- **baseline은 재귀 스캔에 적용되지 않는다.** 생성은 멀티스킬로 되는데 소비는 거부되고
  (`not supported for recursive multi-skill scans`), 단일 스캔에는 경로 표기 불일치로 매칭 실패
  (멀티 `file: name/SKILL.md` vs 단일 `file: SKILL.md`, fingerprint 해시가 경로 포함).
  운용은 **스킬별 순회 스캔** 필수 — 기존 재귀 명령을 그대로 쓰면 억제가 하나도 적용되지 않는다

부수 발견: `.claude/commands/` 18개는 `SKILL.md`가 없어 **스캐너가 구조적으로 인식하지 못한다**.
이번엔 래핑해 스캔했고 새 신호 0건이었으나, 정기 스캔에서는 계속 빠지는 사각지대다.

### Phase A 승인 게이트 fail-closed 전환 (2026-08-04) — PR #232, merge `a1db58f`

SkillSpector LLM 의미 분석이 문서의 **내적 모순**을 지적했다 — 다른 게이트는 전부 fail-closed인데
Phase A 승인만 fail-open이었다(무응답=승인, 위임 여부는 오케스트레이터 자기 추론). 정책을 뒤집자
BLOCKED 상태의 생애주기 전체가 연쇄로 흔들려 Codex 리뷰가 **6라운드 동안 수렴하지 않았다**.

**수렴시킨 것은 판단이 아니라 구조였다.** 최우선 분기의 진입 조건은 상태 catch-all("사유 불문")인데
하위 케이스는 *입력 유형*의 불완전 열거였고, first-match라 fallthrough가 없어 **열거되지 않은 입력 =
영구 BLOCKED**였다. Codex의 P1·P2는 그 클래스의 인스턴스 2개일 뿐 — 2개를 메우면 7차에 3번째가 나온다.
케이스 추가 대신 **(BLOCKED 사유 3행 × 입력 유형 7열) 상태 전이표 + `⑦ 그 외/판별 불가` 기본행**으로
클래스를 닫자, 이후 지적이 셀 *내부*의 실행 세부로 국소화되고 재발이 멎었다(7차 P2 1 → 8차 2 → 9차 1 → 10차 0).

교훈: **문서 기반 정책도 상태 기계이며, 필요한 것은 케이스 수가 아니라 totality(전역성)다.**
그리고 셀에 올바른 *행동*을 적는 것만으로 부족하고 *순서*까지 지정해야 한다 — "`_workspace/` 이동 후
RUN_STATE 기록"은 이동 후 경로가 없어 빈 워크스페이스를 재생성, 다음 요청이 손상된 재개 런으로 오인된다.

**검증 층위에 대한 발견 2건 (재발 성질):**

- **`codex review --scope working-tree`는 커밋된 변경을 못 본다** (`codex-companion.mjs:260`에서
  `{type:"uncommittedChanges"}`로 매핑). `/wip-save` 후 핸드오프에 적힌 명령을 그대로 쓰면 무관한
  잔여 파일만 리뷰하고 로그가 **"지적 0건"처럼 읽힌다**. 브랜치 작업은 `--scope branch --base main`
- **Codex 통과가 최종 근거는 아니다.** 10차가 "internally consistent"로 통과시킨 뒤, 파일 직독에서
  선점 조건 드리프트를 잡았다(92줄 "사유 불문" vs 106줄 "승인 대기" — planner 실패 + 범위 지정 입력이
  전이표를 우회해 승인 없이 Phase B로 가는 경로). 라우팅을 두 곳에서 진술하면 한쪽이 좁아진다

**운영 주의:** 재개 아티팩트(`HANDOFF.json`·`.continue-here.md`)는 GSD `resume-project.md`상 **일회용**이다.
재개 성공 후 제거하지 않고 커밋해두면 다음 세션이 이미 끝난 작업을 반복한다(Codex 7차가 이걸 잡았다).
Codex 1~10차 로그는 세션 scratchpad에만 있어 **휘발됐다** — 장기 보존이 필요하면 레포로 옮길 것.

## Session Continuity

### 2026-08-17 세션 — 컨텍스트 다이어트 실측 트랙 (파일 분할과 별개 트랙)

머지 완료: **PR #267**(토큰 실측) · **PR #269**(`.env` 차단 발견 → 주장 철회). 문서 정본은
`docs/context-engineering-2026-08.md` "토큰 실측" 절.

- 다이어트 순 효과 **규칙 16,490 → 13,048 토큰(-3,442, -20.9%)**, 베이스라인 **80,597**(1M 창)
- 구성: 규칙 16.2% + 메모리 인덱스 10.8% + **나머지 73.0%**(도구·MCP·스킬 목록)
- MCP 도구 스키마는 `ToolSearch` deferred라 **서버 정리의 토큰 이득 0** → 실제 레버는 스킬 목록·메모리

**후속과제 ④ 실행분(스킬 목록 정리) — 2026-08-17 재실측으로 종결. 삭제는 하지 않았다(불필요).**
이전 기록의 전제("개인 스킬 70개 미사용 = 10.6k 토큰 미청구 절감분")는 **틀렸다**. 그 절감은
`~/.claude/settings.json` 의 `skillOverrides`(`off` 39 + `user-invocable-only` 11 = 50개)로
**이미 실현된 상태**였고, 위 베이스라인 80,597 도 그 적용 후 값이다. 미청구 잔액은 없다.

- 주입은 디스크와 다른 집합이다 — 필터 3겹: 플러그인 enable · `skillOverrides` · SKILL.md 의
  `disable-model-invocation`. 개인 스킬 76개 중 **주입은 17개**, mattpocock 캐시 35개 중 주입 11개
- 주입 실측 ≈**4.7k 토큰**(개인 17개 1,319 · 프로젝트 11개 945 · `commands/gsd/` 42개 916 ·
  superpowers 510 · mattpocock 500 · 기타 550). 이미 차단된 분량 ≈15k
- **플러그인 캐시 중복·disabled 플러그인·꺼둔 개인 스킬 디렉토리 삭제는 전부 0 토큰** — MCP 서버
  정리와 같은 함정. 게다가 개인 스킬 19개는 `Universal-Environment-Setup/install.sh` 의
  `global/skills/` 번들 소유라 재설치 시 되살아난다
- `skillOverrides` 내구성: 두 install.sh 모두 **프로젝트** `.claude/settings.json` 만 딥머지하므로
  롤백 위험은 없었으나, 이 50개를 **소유·재생성하는 스크립트가 없었다**(유실 시 복구 경로 부재)
  → **2026-08-18 해소**: `Universal-Environment-Setup` 브랜치 `k002bill2/skill-overrides-safety-net`
  (`d6d7e8e`, **main 미머지 — 머지해야 실효**)에 정본 스냅샷 조각 +`install_global_settings()` 추가.
  살아 있으면 무시·사라졌을 때만 복원되는 병합이라 멱등하고 사용자 편집을 덮지 않는다.
  회귀 테스트 Test G 포함(79 PASS/0 FAIL, Red-Green 확인). Codex 검증 지적 0건

→ 스킬 쪽 잔여 절감은 최대 1~2k 로 노이즈 ±1,400 에 묻힌다. **다음 레버는 스킬이 아니라
경로 스코프 규칙**(`.claude/rules/*.md` frontmatter `paths:`)이며, 별도 세션이 aos-backend.md ·
aos-frontend.md 에서 진행 중이다(이 세션은 해당 미커밋 변경에 손대지 않았다).
상세는 메모리 `project_skill_memory_diet_backlog`.

남은 후속과제: ① 형제 레포(APFS·LiveMetro·Universal-Environment-Setup) `install.sh` 드리프트 동기화.

### 파일 분할 프로그램 (이전 트랙)
Last session: 2026-08-09
Stopped at: **B5 배치 전체 완료 (5/5) — 매 태스크 게이트 4종 실측 통과. 브랜치 미푸시.**
Task 1~3 시점 Codex 리뷰는 **지적 0건**으로 통과했고, Task 4·5 포함 최종 리뷰가 남았다.

### B5 Task 4·5 에서 배운 것 — 패치 스캔의 완전한 형태 목록

**B5 에서 확인된 테스트 패치 형태는 다섯 가지다.** 처음 계획서는 ①②만 셌고,
Task 2 에서 ③④, Task 5 에서 ⑤가 나왔다. 다음 배치는 **다섯 개를 전부** 스캔한다:

| # | 형태 | 스캔 방법 |
|---|---|---|
| ① | `patch("mod.name")` · `patch.object` | 타깃 문자열 `"mod.` grep |
| ② | `monkeypatch.setattr("mod.name", ...)` · `mocker.patch` | 동일 |
| ③ | 모듈 **객체** `setattr(mod_alias, "name", ...)` | `setattr\(\s*<별칭>` + `<별칭>\.NAME` |
| ④ | ①~③을 여러 줄로 쪼갠 것 | **`patch(` 를 앵커로 쓰지 말 것** |
| ⑤ | 상수 조립 `f"{MODULE}.name"` | **모듈 경로 상수(`MODULE = "..."`)를 먼저 찾을 것** |

**④는 이 세션에서 두 번 걸렸다.** Task 2 에서 겪고도 패턴을 고치지 않아 Task 4 에서
재발했다 — 계획서의 "httpx 1종 7회" 가 옳았고 내 스캔이 0건을 냈다. 교훈:
**함수명을 정규식 앵커로 쓰는 순간 줄바꿈에 취약해진다.** 타깃 문자열만 찾을 것.

**⑤는 grep 으로 원리적으로 못 잡는다** — 소스에 완성된 경로가 존재하지 않는다.
역설적으로 갱신은 가장 쉬웠다(상수 한 줄). 단 그건 패치 타깃이 **한 모듈에 모여
있을 때만** 성립하므로, 배정 단계에서 그렇게 되도록 설계해야 한다.

**관대/비관대 판정은 형태가 아니라 대상으로 한다:**
- 공유 모듈 객체(`shutil`·`sys`·`asyncio`·`httpx`)의 속성 → **관대**. 어느 서브모듈에서
  쓰든 먹는다. 요구사항은 패치 경로가 그 이름을 노출하는 것뿐.
- 모듈 지역 이름(함수·상수·`from X import Y` 바인딩) → **비관대**. 경로가 정확히
  "그 이름을 읽는 코드가 사는 모듈" 이어야 한다.
- 클래스 속성(`AuditService.log`) → 관대하지만 **일관성을 위해 실제 사용처로 맞춘다**.

### B5 Task 3 에서 배운 것

**1. `try/except ImportError` 블록은 원자 단위 — 배정 단위를 '정의'에서 '최상위 문장'으로 올렸다.**
`RAG_AVAILABLE` 과 `get_project_context` 를 다른 모듈로 보내면 graceful degradation
구조가 깨진다. `split_module.py` 가 **"한 문장이 정의하는 모든 이름은 같은 모듈로
간다"**를 단언해 기계적으로 막는다. 중복 판정도 문장 인지형이어야 한다 —
`RAG_AVAILABLE` 은 try·except 양쪽에 나오지만 **같은 문장 안**이라 중복이 아니다.
Task 2 의 판정(이름 단순 카운트)을 그대로 쓰면 정상 코드를 중복으로 오보한다.

**2. `except ImportError` 는 순환 import 도 삼킨다 — 이것이 이 대상의 세 번째 그물이다.**
분할이 순환 import 를 만들면 플래그가 조용히 `False` 가 되고 fallback 이 빈 문자열을
돌려준다. **이 회귀는 게이트를 전부 통과한다** — ruff·mypy 는 무관하고, `split_audit`
은 블록 텍스트가 동일해 0건이며, pytest 도 플래그를 단언하는 테스트가 없으면 통과한다.
`api/usage` 에서는 `route_table` 이 그 자리였지만 `nodes` 에는 라우트가 없다.
→ `tests/backend/test_orchestrator_nodes_optional_deps.py` 신설(`97fa48b`).
**플래그를 `True` 로 하드코딩하지 않는다** — 의존이 없는 환경에서는 `False` 가 정상이다.
단언 조건은 "의존을 import 할 수 있는데도 플래그가 False" 이며 그것만이 순환 import 신호다.
**Task 4·5 도 optional 의존이나 조건부 import 가 있으면 같은 테스트를 먼저 만들 것.**

**3. 분할 엔진을 `tests/backend/api/split_module.py` 로 추출했다.**
Task 4·5 는 `split_usage.py`/`split_nodes.py` 를 본떠 **배정표만** 새로 쓴다. 로직
버그 수정 지점이 한 곳으로 모인다. 일반화가 Task 2 산출물을 바꾸지 않았음을
재현성 검증으로 확인했다(재분할 결과가 `571182f` 와 바이트 동일).

**4. 클래스 속성 패치와 모듈 지역 패치는 다르지만 처리는 통일한다.**
`AuditService.log` 처럼 클래스 속성을 겨냥하는 패치는 어느 경로로 찾든 같은 객체라
재노출로도 동작한다. 모듈 지역(`record_usage_best_effort`)은 안 된다. 그럼에도 **넷 다
실제 사용처 경로로 맞췄다** — `__init__` 재노출을 좁게 유지하는 것이 갱신 누락을
`AttributeError` 로 드러내는 유일한 수단이기 때문이다(Task 2 교훈 3번과 같은 근거).

**5. 셸 CWD 함정에 이 세션에서 3회 걸렸다.** `cd src/backend` 이후 `src/backend/...`
경로가 "No such file"을 낸다. **모든 Bash 호출을 `cd <repo루트> &&` 로 시작할 것** —
계획서 운용 교훈 3번이 경고했는데도 반복됐다.

### B5 Task 2 에서 배운 것 — Task 4·5 에 그대로 적용된다

**1. 계획서의 "문자열 패치 0건 ✅"은 스캔 형태가 좁아서 나온 값이다.**
`api.usage` 는 `patch("...")`·`monkeypatch.setattr("...")` 문자열 형태가 0건인 게
맞지만, **모듈 *객체* 를 넘기는 형태**(`monkeypatch.setattr(usage_mod, "X", ...)`)가
**19건** 있었다. 여기에 여러 줄로 쪼개진 형태
(`setattr(\n    usage_mod,\n    "X",`)까지 있어 한 줄 grep 으로는 4건을 더 놓쳤다.
최종 갱신은 41건이다. **스캔 패턴에 `setattr(\s*<모듈별칭>` 과 `<별칭>.NAME` 직접
참조를 반드시 포함할 것** — Task 4(`external_usage_service`)·5(`terminal_service`)도
같은 형태를 쓸 수 있다.

**2. 하중 지지대 판정에 테스트의 재바인딩을 포함해야 한다.**
소스만 보면 `_codex_plan_cache` 는 첨자 대입뿐이라(모듈에 `global` 문 없음) 분열
위험이 없어 보인다. 그런데 **테스트가 dict 를 통째로 갈아끼운다**
(`monkeypatch.setattr(usage_mod, "_codex_plan_cache", {...})`, 3곳). 재바인딩이
개입하면 "그 이름을 읽는 함수 전부가 같은 모듈" 제약이 되살아난다 — 첫 배정에서
`_cached_codex_plan_response`(codex)와 `get_codex_plan_usage`(routes)를 갈랐다가
재분할했다. **판정 근거는 소스의 mutation 패턴이 아니라 `읽는 함수 ∪ 재바인딩하는 쪽`이다.**

**3. `__init__.py` 재노출은 좁게 — 계획서 3번("공개 표면 전체 재노출")의 예외다.**
전체 재노출을 하면 `__init__` 이 이동한 이름의 **별칭**을 만든다. 그러면
`monkeypatch.setattr(usage_mod, "CLAUDE_PROJECTS_DIR", tmp)` 가 **성공**하고
(별칭만 갈아끼움), 정작 그 이름을 읽는 `jsonl` 모듈은 원본을 계속 봐서 테스트가
**실제 홈 디렉토리를 스캔한 채 통과**한다. 좁게 두면 갱신을 잊은 지점이
`AttributeError` 로 즉시 드러난다 — 실측으로 18곳이 전부 시끄럽게 실패했다.
재노출 목록은 **소비자 grep 에서 역산**한다(usage 는 `api/app.py:89` 의 `router` 하나).

**4. `split_audit.py` 는 `__init__.py` 를 스캔에서 제외한다** (`_collect_package` 의
`skip` 기본값, `audit()` 에 우회 파라미터 없음). 따라서 **`__init__.py` 에 정의를
남기는 설계는 이 그물과 양립하지 않는다** — 남긴 정의가 전부 "유실"로 보고된다.
정의 0개 배럴로 두는 것이 도구와 맞는 유일한 형태다.

**5. 라우트는 한 모듈에 모으는 편이 낫다** (라우트 수가 적을 때). `routes.py` 하나에
원본 선언 순서대로 두면 `include_router` 조립이 없어 등록 순서가 **완전히** 보존되고,
`fastapi_include_order_is_contract` 가 경고한 순서 계약을 새로 만들지 않는다.
B1(`api/git`, 63개)은 서브라우터가 필수였지만 usage(7개)는 아니었다.

**6. scratchpad 는 세션 도중에도 비워진다** (03:55 실측 — 분할 스크립트와 원본
스냅샷이 동시에 사라져 재작성했다). **해소됨**: 분할 실행 스크립트를
`tests/backend/api/split_usage.py` 로 커밋했다(사용자 승인). Task 3·4·5 는
`ASSIGNMENT`·`DOCSTRINGS` 만 교체해 재사용한다 — 나머지 네 요소(커버리지 단언 ·
import 역산 · AnnAssign 분기 · split_audit 과 동일한 텍스트 추출 규칙)는 대상과
무관하다. **Task 3 은 `_walk_body` 형태로 확장 필요** — `nodes.py:53–72` 의
`try/except ImportError` 안 정의 4종이 `tree.body` 순회에는 보이지 않는다.

### 다음 선택지 (B5 완료 후)

1. **이 브랜치를 푸시·PR** — 커밋 14개(B5 Task 1~5 + 도구 + 문서). 최종 Codex 리뷰
   통과가 선행 조건이다.
2. **B5.5** — 계획서의 48~65% 혼합 5개(`merge_service` 1,331 · `audit_service` 985 ·
   `playground_service` 1,249 · `tmux_service` 920 · `notification_service` 1,017).
   B4 의 3a/3b 처럼 **2단계**(클래스 이동 → 메서드 추출)가 필요하고, `audit_service`(153줄)·
   `merge_service`(347줄)는 안전망도 얇다.
3. **B6** — 70% 이상 집중도 8개. 파일 분할이 아니라 **메서드 추출·설계 재검토** 성질이다.
   `rag_service`(1,534)는 테스트가 `rag_mod` 별칭으로 모듈 객체 패치를 20건 이상 쓰므로
   위 스캔 형태 ③이 최대 함정이다.

**B5.5·B6 에 그대로 쓰는 도구** (`tests/backend/api/`):
`split_module.py`(엔진) · `split_audit.py`(본문 대조) · `route_table.py`(HTTP 표면) +
배정표 4종(`split_usage`·`split_nodes`·`split_external_usage`·`split_terminal`).
새 배정표는 그중 하나를 본떠 `ASSIGNMENT`·`DOCSTRINGS`·`BARREL` 만 바꾼다.

### (완료) B5 에서 확립된 레시피

계획서: `docs/plans/2026-08-09-oversized-file-split-b5.md`.
**Task 1에서 검증된 레시피**(그대로 재사용):

1. `git mv X.py X/__init__.py` → 단독 커밋 (`0 insertions, 0 deletions` 확인) → **SHA 기록**
2. **AST 이름 기반 분할 스크립트** — `sed` 라인 슬라이스 금지(도메인별로 묶으면 정의가 흩어진다).
   스크립트에 **커버리지 단언**(최상위 이름 배정 누락·중복 시 즉시 실패)과
   **import 역산**(정의가 실제 참조하는 이름에서 계산, 눈으로 훑지 않음)을 넣는다.
   Task 1 스크립트가 세션 scratchpad에 있었으므로 **휘발됐다** — 다시 쓰되 위 두 요소를 반드시 포함.
3. `__init__.py`의 `__all__`은 **소비자 grep 에서 역산한다** — 계획서와 같은 규칙이며,
   이 줄에 있던 "원본 공개 표면 **전체** 재노출"은 **Task 2 에서 틀린 것으로 판명돼
   교체했다**. 전체 재노출은 이동한 이름의 **별칭**을 만들어,
   `monkeypatch.setattr(pkg, "X", ...)` 가 별칭만 갈아끼우고 정작 X 를 읽는
   서브모듈은 원본을 계속 보게 한다 — 테스트가 실물 경로를 읽은 채 조용히 통과한다.
   좁게 두면 갱신 누락이 `AttributeError` 로 즉시 드러난다.
   (모듈 객체 패치가 없는 대상이라면 전체 재노출이 무해할 수 있으나,
    있는지 없는지는 **네 형태 전부 스캔한 뒤에야** 안다 — 위 "배운 것 1" 참조.)
4. 게이트: `split_audit.py <승격SHA>` → `ruff check --fix` + `ruff format` →
   **`split_audit` 재실행**(포매터가 본문을 건드리지 않았는지) → `mypy` → `pytest`

기타 요점:

- **분류축이 교체됐다.** 상위 계획서의 "다중클래스 9종"은 무효 — 클래스 갯수가 아니라
  **집중도(최대 클래스/파일 줄수)**가 지표다. 상위 계획서 배치 표도 함께 고쳤다.
- **B5의 하중 지지대는 모듈 레벨 가변 상태다.** `_usage_cache`·`GIT_REPOSITORIES`·
  `_terminal_service`·`_service_instance`가 `global`로 재바인딩되므로, 상태와 그것을 읽고 쓰는
  함수를 **가르면 사본이 분열**된다(ruff·mypy 통과, 테스트도 한쪽만 타면 통과).
  `orchestrator/nodes.py`만 상태 0건이라 Task 1이다.
- **B4와 달리 그물이 둘 다 있다** — `split_audit.py`(AST 이름 매칭)와 `route_table.py`
  (`api/usage.py`가 라우트 7개). B4에서는 `.tsx`라 둘 다 못 썼다.
- **pytest 베이스라인 = `1 failed, 1357 passed, 2 skipped`.** 그 1건은 `.env`의
  `RAG_EMBEDDING_MODEL` 오버라이드에서 오는 알려진 플레이크다. 통과 기준은 0 failed가 아니라
  **베이스라인 일치**다. main이 움직였으면 다시 잡을 것.

---

이전 기록: **B4 배치 전체 완료** (Task 2 `3ebc73d` · 3a `14c4e38` · 3b `06dfc7f`, squash `2ae6eb9`).
게이트는 매 태스크마다 4종 전부 실측했고 마지막 상태는 tsc 0 · ESLint 0(`--max-warnings=0`) ·
vitest **205 파일 4,365 테스트 전부 통과**(세 태스크 내내 동일 수치 — collection 유실 없음) ·
build exit 0. 게이트는 핸드오프에 적힌 좁은 스코프가 아니라 `verification-loop` 정본대로
**전체 스위트**로 돌렸다.

`AnalyticsPage`는 lazy 로딩(`routes.tsx:59`)이라 **빌드 산출물의 청크 분리**도 확인했다
(`dist/assets/AnalyticsPage-*.js` 50.9 kB, `INEFFECTIVE_DYNAMIC_IMPORT` 경고 없음). 부품이
어디선가 정적 import되면 청크가 메인 번들로 합쳐지는데, 이건 tsc·테스트로는 안 잡히는 층위다.

Resume hint: 남은 선택지는 둘이다 — (a) 이 브랜치를 푸시·PR, (b) 상위 계획서
`docs/plans/2026-08-04-oversized-file-split.md`의 **B5**로 진행.
**상위 계획서의 배치 표가 낡았다** — B1만 "✅ 완료"이고 B2·B3·B4는 미표시라 STATE.md와
진실원이 갈린다. B5 착수 전 정리할 것.
미해결 항목은 위 Blockers/Concerns 참조.
