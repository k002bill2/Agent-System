# ACE Enforcement Matrix

ACE Framework의 Hard Constraints (P2 Pillar) 매트릭스.
각 행은 hooks.json에 등록된 하나의 훅에 대응합니다.

> **동기화 규칙**: hooks.json의 훅 수 = 이 파일의 P2- 행 수.

## P2: Hard Constraints (Hooks)

| ID | Event | Matcher | Hook Script | Purpose |
|---|---|---|---|---|
| P2-001 | PreToolUse | Bash | ethicalValidator.js | 위험한 셸 명령 차단 (rm -rf /, DROP TABLE 등) |
| P2-002 | PreToolUse | Edit\|Write | inline Python | 보안 경로 차단 (.env, secrets, .git/, /prod/, credentials, private_key, id_rsa, .pem) |
| P2-003 | PostToolUse | Write | verificationGuard.js | src/ 변경 시 tsc/ruff 경량 검증 경고 |
| P2-004 | SubagentStop | (all) | agentLearnings.js | 서브에이전트 학습 내용 자동 추출/저장 |
| P2-005 | Notification | (all) | osascript | macOS 데스크탑 알림 |

## 유지보수 가이드

- 훅 추가/삭제 시 이 파일도 함께 업데이트
- hooks.json의 훅 수와 이 파일의 P2- 행 수가 일치해야 함
- 새 훅 추가 시: hooks.json에 추가 → 이 파일에 행 추가 → 테스트

---

**Last Updated**: 2026-03-21 | **Version**: 2.0.0
