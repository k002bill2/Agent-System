# Changelog

## v1.0.0 (2026-02-26)

최초 릴리스. Core + Addon 레이어 아키텍처 기반 Claude Code 워크스페이스 템플릿.

### Core

- **Agents (2)**: lead-orchestrator, quality-validator
- **Shared Frameworks (5)**: ACE framework, quality-gates, effort-scaling, delegation-template, parallel-agents-protocol
- **Commands (8)**: check-health, verify-app, config-backup, dev-docs, save-and-compact, resume, review, draft-commits
- **Skills (8)**: verification-loop, hook-creator, skill-creator, slash-command-creator, subagent-creator, agent-improvement, agent-observability, external-memory
- **Hooks (3)**: ethicalValidator (위험 명령 차단), autoFormatter (자동 포맷), contextMonitor (컨텍스트 리밋 경고)
- **Checklists (2)**: code-review, deployment

### Addons

- **react-typescript**: 3 agents (web-ui-specialist, performance-optimizer, test-automation-specialist), 2 commands (test-coverage, start-dev-server), 3 skills (react-web-development, test-automation, verify-ui), 1 hook (prettierFormatter)
- **python-backend**: 2 agents (backend-specialist, code-simplifier), 1 command (deploy-with-tests), 1 skill (verify-api-route), 1 hook (ruffFormatter)
- **eval-system**: 2 agents (eval-task-runner, eval-grader), 1 command (run-eval), eval scaffolding (tasks schema, rubrics)
- **gemini-bridge**: 2 commands (gemini-review, gemini-scan), 1 hook (geminiAutoReview), coordination state

### Infrastructure

- **init.sh**: 인터랙티브 셋업, config 파일 기반 설치, 애드온 머징, CLAUDE.md 템플릿 렌더링, 레지스트리 자동 생성
- **Update mode**: 체크섬 기반 변경 감지, 사용자 수정 파일 보호, 백업 생성, `.new` 파일로 충돌 표시
- **settings.json merging**: 애드온별 hooks-patch.json을 base settings에 자동 머지
- **CLAUDE.md.template**: 조건부 블록 (`{{#if addon.X}}`) 지원, 프로젝트 변수 치환
- **config.yaml.example**: 설정 파일 예제 (project, addons, paths, commands, hooks)
