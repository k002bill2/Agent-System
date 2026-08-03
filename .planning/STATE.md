# Project State

## Project Reference
See: `.planning/PROJECT.md`
**Core value:** Claude Code 에이전트 체계적 협업
**Current focus:** 하네스 스킬 보안 감사 → Phase A 승인 게이트 fail-closed 전환 (3/3 완료, PR 대기)

## Current Position
Phase: adhoc — 스킬 보안 감사(Task 1·2 완료·머지) + Phase A 정책 전환(Task 3 완료, 미머지)
Last activity: 2026-08-04
Live handoff: **없음** — 재개 아티팩트는 소비 후 제거됨. 브랜치 `wip/phase-a-fail-closed`가 진실원

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

**3. Gemini Review 파이프라인**
- `.claude/hooks/gemini-bridge.js` (1,126줄): Gemini CLI 통합 브릿지
- geminiAutoTrigger.js → gemini-bridge.js spawn 구조
- 리뷰 결과: `.claude/gemini-bridge/reviews/`
- 리팩토링 계획 존재: `dev/active/gemini-bridge-refactor/` (미착수)

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
- Gemini Bridge 파일 크기 초과 (1,126줄 > 800줄 제한) — 리팩토링 필요
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

## Session Continuity
Last session: 2026-08-04
Stopped at: **Task 3 완료** — 상태 전이표 재작성 후 Codex 7차에서 **정책 본문 지적 0건**(P1 0건).
재개 아티팩트(`HANDOFF.json`·`.continue-here.md`)는 소비 완료로 제거했다 — GSD 규칙상 일회용이며,
커밋된 채 두면 다음 세션이 이미 끝난 3.1·3.2를 반복한다(Codex 7차 P2가 정확히 이 지적).

### 2026-08-04 재개 시 정정된 전제 2건

- **"미커밋 3파일"은 유실 아님.** wip 커밋 `88fb3c2`(로컬 브랜치 `wip/phase-a-fail-closed`, 미푸시)에
  보존돼 있다. 워킹트리에 남은 2파일은 핸드오프가 제외 대상으로 지정한 사용자 별건
  (`docs/codex-advisor-worker-bundle/{HANDOFF.md,install.sh}`)이다
- **`--scope working-tree`로 재검증하면 오작동한다.** `codex-companion.mjs:260`에서 이 스코프는
  `{type:"uncommittedChanges"}`로 매핑되므로, 3파일이 커밋된 지금은 **별건 2파일만** 리뷰하고
  로그는 "지적 0건"처럼 읽힌다. `--scope branch --base main`을 쓸 것

### 재개 결정 (2026-08-04)

Codex 6차 P1/P2는 개별 케이스 누락이 아니라 **클래스**의 인스턴스다 — 최우선 분기의 진입 조건은
상태 catch-all인데 하위 케이스는 입력 유형의 불완전 열거이고 first-match라 fallthrough가 없다.
케이스 2개 추가는 7차에 세 번째 인스턴스를 부른다. 따라서 회피책을 **지금** 적용해
(BLOCKED 사유 3행 × 입력 유형 7열) 상태 전이표 + "그 외" 기본행으로 재작성한다.
부수 요구: Phase 0 표와 Phase A "승인 재개 규칙"의 **라우팅 중복 제거**(표가 SSOT, Phase A는 실행 세부만)
— 5·6차 드리프트의 온상이었다.

Codex 1~6차 로그·skillspector 리포트는 이전 세션 scratchpad에서 회수해 현 세션 scratchpad에 보관 중
(휘발성 — 장기 보존이 필요하면 레포로 옮길 것).
