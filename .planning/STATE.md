# Project State

## Project Reference
See: `.planning/PROJECT.md`
**Core value:** Claude Code 에이전트 체계적 협업
**Current focus:** 리포지토리 유지보수 — Dependabot 보안 경고 2건 해소 (Task 7, 미착수)

## Current Position
Phase: maintenance (PR/브랜치 정리 + Dependabot) — 6/7, `paused`
Last activity: 2026-07-31
Live handoff: `.planning/HANDOFF.json` — 소비되지 않음(Task 7 미착수). 재개 시 이 파일이 진실원.

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

### Blockers/Concerns
- Gemini Bridge 파일 크기 초과 (1,126줄 > 800줄 제한) — 리팩토링 필요
- Dependabot 보안 경고 미해결 (HIGH/LOW) — 상세·현황은 `.planning/HANDOFF.json` Task 7

## Session Continuity
Last session: 2026-07-31
Stopped at: maintenance Task 6까지 완료·검증(main `a2c3b14` CI 8/8 success). Task 7(보안 경고 2건)은 사용자 결정으로 새 세션 이관.
Resume hint: `.planning/HANDOFF.json` + `.planning/.continue-here.md` 참조. 다중 세션 환경이라 재개 전 `git fetch` 필수 — 이 두 파일의 로컬 사본은 stale일 수 있다(2026-07-31 실사례).
