# ACE Enforcement Matrix

ACE Framework의 Hard Constraints (P2 Pillar) 매트릭스.
각 행은 hooks.json에 등록된 하나의 훅에 대응합니다.

> **동기화 규칙**: hooks.json의 훅 수 = 이 파일의 P2- 행 수.
> `aceMatrixSync.js`가 drift를 자동 감지합니다.

## P2: Hard Constraints (Hooks)

| ID | Event | Matcher | Hook Script | Purpose |
|---|---|---|---|---|
| P2-001 | PreToolUse | Edit\|Write | inline Python | 보안 경로 차단 (.env, secrets, .git/, /prod/) |
| P2-002 | PreToolUse | Bash | ethicalValidator.js | 위험한 셸 명령 차단 (rm -rf /, DROP TABLE 등) |
| P2-003 | PreToolUse | Task | parallelCoordinator.js pre | 파일 락 획득, 병렬 상태 등록, workspace 격리 주입 |
| P2-004 | PostToolUse | Edit\|Write | l5VerificationGuard.js | src/ 변경 시 tsc/ruff 경량 검증 경고 |
| P2-005 | PostToolUse | Edit\|Write | geminiAutoTrigger.js | 30초 debounce Gemini 코드 리뷰 |
| P2-006 | PostToolUse | Edit\|Write | aceMatrixSync.js | ACE 매트릭스 drift 감지 |
| P2-007 | PostToolUse | Task | agentTracer.js | 에이전트 실행 이벤트 기록 |
| P2-008 | PostToolUse | Task | parallelCoordinator.js post | 파일 락 해제, 완료 이력 저장 |
| P2-009 | Notification | (all) | osascript | macOS 데스크탑 알림 |
| P2-010 | UserPromptSubmit | (all) | userPromptSubmit.js | 스킬/에이전트 자동 추천 |
| P2-011 | PreCompact | (all) | preCompactSnapshot.js | compact 전 컨텍스트 스냅샷 |
| P2-012 | Stop | (all) | stopEvent.js | 세션 메트릭 집계 |
| P2-013 | SessionEnd | (all) | inline shell | 병렬 상태/락 초기화 |

## 유지보수 가이드

- 훅 추가/삭제 시 이 파일도 함께 업데이트
- `aceMatrixSync.js`가 PostToolUse:Edit|Write 시 자동 검증
- drift 감지 시 경고 메시지 출력: `[ACE MatrixSync] ⚠️ Drift 감지`

---

**Last Updated**: 2026-03-15 | **Version**: 1.0.0
