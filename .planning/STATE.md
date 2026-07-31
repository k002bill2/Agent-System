# Project State

## Project Reference
See: `.planning/PROJECT.md`
**Core value:** Claude Code 에이전트 체계적 협업
**Current focus:** 없음 — maintenance phase 완료. 다음 작업 미정.

## Current Position
Phase: maintenance (PR/브랜치 정리 + Dependabot) — 7/7, `completed`
Last activity: 2026-07-31
Live handoff: 없음 (`HANDOFF.json`·`.continue-here.md`는 소비 후 삭제 — 이력은 커밋 `951fe7b`·`cdd0ded`에 보존).

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
- **knip 미배선** — 미사용 의존성 탐지기가 `package.json` 스크립트에만 있고 CI 워크플로우에 없다. 미사용 `react-router-dom`이 오래 남아 HIGH 보안 경고로 자라난 구조적 원인. CI 게이트 추가 검토 대상
- **다중 세션 워킹트리 공유 위험(이번 세션 실측)** — worker가 브랜치를 조작하는 동안 메인 세션이 같은 워킹트리의 파일을 편집해 stash 충돌 발생. Codex 리뷰도 같은 이유로 1차 실행이 엉뚱한 diff를 리뷰함. 병행 시 검증 도구는 `git worktree add --detach`로 격리할 것

## Session Continuity
Last session: 2026-07-31
Stopped at: **maintenance phase 7/7 완료.** Task 7(보안 경고 2건) PR #223 머지·검증 완료, 열린 알림 0건. 다음 작업 미정.
Resume hint: 로컬 `main`에 미푸시 docs 커밋 2개가 있을 수 있다 — 작업 브랜치는 항상 `origin/main`에서 딸 것. 다중 세션 환경이라 재개 전 `git fetch` 필수(2026-07-31 실사례: 이 세션 중 origin/main이 외부 경로로 2회 이동).
