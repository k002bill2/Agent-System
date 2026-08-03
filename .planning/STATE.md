# Project State

## Project Reference
See: `.planning/PROJECT.md`
**Core value:** Claude Code 에이전트 체계적 협업
**Current focus:** 하네스 스킬 보안 감사 → Phase A 승인 게이트 fail-closed 전환 (3/3 중 Task 3 진행 중, `paused`)

## Current Position
Phase: adhoc — 스킬 보안 감사(Task 1·2 완료·머지) + Phase A 정책 전환(Task 3 미완)
Last activity: 2026-08-03
Live handoff: **있음** — `.planning/HANDOFF.json` + `.planning/.continue-here.md` (재개 시 `/gsd:resume-work`)

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
Last session: 2026-08-03
Stopped at: **Phase A 승인 게이트 fail-closed 전환 미완** — Codex 6라운드가 전부 직전 수정의 부작용을
지적해(P1 3건 포함) 6차 미반영 상태로 중단. 미커밋 3파일은 5차까지 반영돼 보존됨.
상세·재개 지점은 `.planning/.continue-here.md` 참조.
Resume hint: 다중 세션 환경이라 재개 전 `git fetch` 필수. 커밋 시 `docs/codex-advisor-worker-bundle/install.sh`는
**제외**할 것(사용자가 컨텍스트 예산 규칙을 창 비례로 갱신한 별건). 7차에도 P1이면 분기 나열을 접고
상태 전이표(BLOCKED 사유 × 입력 유형 → 행동)로 재작성할 것.
