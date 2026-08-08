# Project State

## Project Reference
See: `.planning/PROJECT.md`
**Core value:** Claude Code 에이전트 체계적 협업
**Current focus:** **800줄 초과 파일 분할 프로그램 — Batch 4 진행 중 (일시정지)**

## Current Position
Phase: **B4** (프론트 페이지·컴포넌트 분할) — Task 1/4 완료, Task 2 대기
- 계획: `docs/plans/2026-08-09-oversized-file-split-b4.md`
- 브랜치: `docs/plan-b4-frontend-split` (미푸시, 커밋 3건)
- 완료 배치: **B1**(api/git.py, PR #238) · **B2**(projects·agents·claude_sessions·project_configs, PR #241·#242) · **B3**(Zustand 스토어 3종, PR #243) — 전부 머지됨

Last activity: 2026-08-09
Live handoff: **있음** — `.planning/.continue-here.md` + `.planning/HANDOFF.json`. 재개는 `/gsd:resume-work`

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
- **800줄 초과 파일 33개 / 43,621줄** — 계획 수립 완료, **실행 미착수**.
  계획서: `docs/plans/2026-08-04-oversized-file-split.md` (프로그램 6배치 + Batch 1 실행 가능 태스크).
  테스트 파일은 한도 제외(사용자 결정 2026-08-04). Batch 1 = `api/git.py` 2,022줄 → 8개 도메인 모듈.
  재개 시 그 문서의 Task 1부터 시작하면 된다 — 착수 전 게이트 green 확인이 Step 1이다
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
Last session: 2026-08-04
Stopped at: **진행 중 작업 없음.** Phase A fail-closed 전환이 PR #232로 머지(`a1db58f`)되며 adhoc phase 종료.
main 실물 대조 완료(전이표 5행×8셀, ⑦열 3셀, 구 문구 잔재 0, 재개 아티팩트 부재). CI 9/9 pass.
Resume hint: 새 작업은 초기 상태에서 시작하면 된다. 미해결 항목은 위 Blockers/Concerns 참조
(800줄 초과 파일 15개 이상 — 판단 미결, `.claude/commands/` 18개가 SkillSpector 정기 스캔 사각지대).
