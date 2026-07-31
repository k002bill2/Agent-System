# Project State

## Project Reference
See: `.planning/PROJECT.md`
**Core value:** Claude Code 에이전트 체계적 협업
**Current focus:** 리포지토리 유지보수 — Dependabot 보안 경고 2건 해소 (Task 7, 착수)

## Current Position
Phase: maintenance (PR/브랜치 정리 + Dependabot) — 7/7, `in_progress`
Last activity: 2026-07-31
Live handoff: `.planning/HANDOFF.json` — Task 7 착수로 소비됨. 아래 "Task 7 재조사 결과"가 최신 판단이며 HANDOFF.json의 next_action보다 우선한다.

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

### Task 7 재조사 결과 (2026-07-31, 착수 시점)

HANDOFF.json의 전제 두 가지가 실측으로 뒤집혔다.

- **HIGH `react-router` (알림 #85)는 메이저 업그레이드 건이 아니다.** `react-router-dom`은 **미사용 의존성**이다 — `src/dashboard` 전체에서 `react-router` 문자열은 `package.json:32` 한 줄뿐이고 소스 import 0건. 대시보드는 Zustand 기반 자체 네비게이션(`src/stores/navigation.ts` + `src/routes.ts`)을 쓴다. 따라서 7→8 업그레이드가 아니라 **제거**가 정답이며, 알림은 `dismissed`가 아니라 `fixed`로 닫힌다.
- **"Dependabot에 위임" 지침은 이 2건에 적용 불가.** security updates는 enabled·not paused인데도 30일간 PR이 0건이다. `@babel/core`는 부모(`eslint-plugin-react-hooks@7.1.1`)가 이미 최신이라 올릴 대상이 없고 Dependabot은 `overrides`를 추가하지 않는다. `react-router`는 수정본이 메이저 경계 너머(8.3.0)라 제약 만족 범위 밖이다.
- **`npm audit fix` 금지.** lock 전체 재해석이 macOS에서 플랫폼별 optional dependency(`@emnapi/*` 등)를 잘라내 Linux CI `npm ci`를 깨뜨린다(PR #134 실패 원인). 게이트는 lock diff의 `-` 라인에 플랫폼 엔트리가 없을 것: `git diff -U0 -- package-lock.json | grep '^-' | grep -Ei 'emnapi|@rollup/rollup-|@esbuild/|-linux-|-darwin-|-win32-'` → 빈 출력.
- 부수 발견: `knip`(미사용 의존성 탐지기)이 **CI에 배선돼 있지 않다**. 미사용 `react-router-dom`이 오래 남은 구조적 원인.

### Blockers/Concerns
- Gemini Bridge 파일 크기 초과 (1,126줄 > 800줄 제한) — 리팩토링 필요
- Dependabot 보안 경고 2건 — 브랜치 `chore/security-alerts-babel-router`에서 처리 중. 완료 판정은 `npm ls`가 아니라 알림 상태: `gh api repos/:owner/:repo/dependabot/alerts/59`(및 `/85`) `.state == "fixed"`
- knip 미배선 (CI에 미사용 의존성 게이트 없음) — 후속 검토 대상

## Session Continuity
Last session: 2026-07-31
Stopped at: Task 7 착수. 재조사로 HIGH 건 범위가 "메이저 업그레이드"에서 "미사용 의존성 제거"로 축소됨. 사용자 결정: LOW·HIGH를 한 PR로 묶어 처리. worker가 브랜치 `chore/security-alerts-babel-router`(base = `origin/main`)에서 구현 중.
Resume hint: 로컬 `main`이 origin보다 1커밋 앞섬(`065a32f docs(state)`, 미푸시) — 작업 브랜치는 반드시 `origin/main`에서 딸 것. 다중 세션 환경이라 재개 전 `git fetch` 필수(2026-07-31 실사례).
