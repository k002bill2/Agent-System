# Claude Workspace Template Design

**Date**: 2026-02-26
**Status**: Approved
**Goal**: AOS의 Claude Code 시스템을 팀 표준 범용 템플릿으로 분리

## Context

AOS 프로젝트에 구축된 Claude Code 시스템(11 agents, 22 commands, 33 skills, hooks, eval, coordination)을
다양한 기술 스택의 팀 프로젝트에 적용할 수 있는 범용 템플릿으로 만든다.

## Decision: Layered Architecture

Core + Addon 레이어로 분리. Git repo + init.sh로 배포.

### 대안 비교

| 접근 | 장점 | 단점 | 결정 |
|------|------|------|------|
| Flat Template (단순 복사) | 즉시 사용 | drift, 불필요 설정 포함 | 탈락 |
| **Layered Architecture** | 조합 가능, 업데이트 용이 | 초기 분리 작업 | **채택** |
| Claude Code Skill Package | 대화형 UX | 재현성 낮음 | 탈락 |

## Architecture

### 레이어 구조

```
claude-workspace-template/
├── README.md
├── CHANGELOG.md
├── init.sh
├── config.yaml.example
├── core/                        # 모든 프로젝트 공통
│   ├── .claude/
│   │   ├── agents/
│   │   │   ├── lead-orchestrator.md
│   │   │   ├── quality-validator.md
│   │   │   └── shared/
│   │   │       ├── ace-framework.md
│   │   │       ├── quality-gates.md
│   │   │       ├── effort-scaling.md
│   │   │       ├── delegation-template.md
│   │   │       └── parallel-agents-protocol.md
│   │   ├── commands/
│   │   │   ├── check-health.md
│   │   │   ├── verify-app.md
│   │   │   ├── config-backup.md
│   │   │   ├── dev-docs.md
│   │   │   ├── save-and-compact.md
│   │   │   ├── resume.md
│   │   │   ├── review.md
│   │   │   └── draft-commits.md
│   │   ├── skills/
│   │   │   ├── verification-loop/
│   │   │   ├── hook-creator/
│   │   │   ├── skill-creator/
│   │   │   ├── slash-command-creator/
│   │   │   ├── subagent-creator/
│   │   │   ├── agent-improvement/
│   │   │   ├── agent-observability/
│   │   │   └── external-memory/
│   │   ├── hooks/
│   │   │   ├── ethicalValidator.js
│   │   │   ├── autoFormatter.js
│   │   │   └── contextMonitor.js
│   │   ├── checklists/
│   │   │   ├── code-review.md
│   │   │   └── deployment.md
│   │   └── settings.json
│   └── CLAUDE.md.template
│
├── addons/
│   ├── react-typescript/
│   │   ├── agents/ (web-ui-specialist, performance-optimizer, test-automation-specialist)
│   │   ├── commands/ (test-coverage, start-dashboard)
│   │   ├── skills/ (react-web-development, test-automation, verify-ui)
│   │   └── hooks/ (prettierFormatter.js)
│   │
│   ├── python-backend/
│   │   ├── agents/ (backend-specialist, code-simplifier)
│   │   ├── commands/ (deploy-with-tests)
│   │   ├── skills/ (verify-api-route)
│   │   └── hooks/ (ruffFormatter.js)
│   │
│   ├── eval-system/
│   │   ├── agents/ (eval-task-runner, eval-grader)
│   │   ├── commands/ (run-eval)
│   │   ├── evals/ (tasks/schema.yaml, rubrics/)
│   │   └── README.md
│   │
│   └── gemini-bridge/
│       ├── commands/ (gemini-review, gemini-scan)
│       ├── hooks/ (geminiAutoReview.js)
│       └── coordination/ (gemini-state.json)
│
└── tests/
    ├── test-core-only.sh
    ├── test-react-addon.sh
    └── test-update.sh
```

### 레이어 분류 요약

| 레이어 | Skills | Commands | Agents | Hooks |
|--------|--------|----------|--------|-------|
| Core | 8 | 8 | 2+shared | 3 |
| React/TS | 3 | 2 | 3 | 1 |
| Python | 1 | 1 | 2 | 1 |
| Eval | — | 1 | 2 | — |
| Gemini | — | 2 | — | 1 |

## config.yaml

```yaml
project:
  name: "my-app"
  description: "프로젝트 설명"
  language: "ko"

addons:
  - react-typescript
  # - python-backend
  # - eval-system
  # - gemini-bridge

paths:
  src: "src"
  tests: "tests"
  docs: "docs"

commands:
  typecheck: "npx tsc --noEmit"
  lint: "npx eslint ."
  test: "npm test"
  build: "npm run build"
  format: "npx prettier --write"

hooks:
  ethical_validator: true
  auto_formatter: true
  context_monitor: true
  protected_paths:
    - ".env"
    - "secrets"
    - ".git/"
```

## 범용화 전략

### Hooks

| 훅 | 변환 방법 |
|----|----------|
| ethicalValidator.js | config.yaml의 protected_paths를 동적 참조 |
| autoFormatter.js | 파일 확장자 감지 → Prettier/ruff/gofmt 자동 선택 |
| contextMonitor.js | 프로젝트 특화 로직 제거, /save-and-compact 추천만 |

### Commands

커맨드 본문에서 config.yaml을 직접 읽는 패턴 사용:
"프로젝트 루트의 `claude-workspace.yaml`에서 명령어를 읽어서 실행"

### Agents

- AOS 프로젝트명/경로 → 파라미터화
- 프레임워크 고정 참조 → 범용 패턴으로 대체
- shared/ 프레임워크는 변경 없이 유지

## 업데이트 전략

```
./init.sh --update [--config claude-workspace.yaml]
```

- `.claude/.checksums`에 원본 해시 저장
- update 시 해시 비교로 사용자 수정 감지
- 수정된 파일은 `.new` 생성 후 수동 머지
- CLAUDE.md는 절대 덮어쓰지 않음
- agents/shared/*는 항상 덮어쓰기

### 머지 규칙

| 파일 유형 | 업데이트 동작 |
|-----------|-------------|
| agents/shared/* | 항상 덮어쓰기 |
| agents/*.md | 미수정 → 덮어쓰기, 수정됨 → .new 생성 |
| commands/*.md | 동일 |
| skills/*/SKILL.md | 동일 |
| hooks/*.js | 항상 덮어쓰기 |
| settings.json | 기존 키 보존 + 새 키 추가 |
| CLAUDE.md | 절대 덮어쓰지 않음 (diff만 출력) |

## 팀 온보딩

1. **Day 1**: `init.sh` 실행 → 대화형으로 config 생성 + .claude/ 셋업
2. **Day 2**: CLAUDE.md TODO 섹션 채우기, 프로젝트 전용 커스터마이징
3. **Day 3+**: /check-health, /verify-app 등 일상 사용. 템플릿 업데이트 시 `--update`

## Registries

agents-registry.json, commands-registry.json은 init.sh에서 .md 파일 스캔 후 자동 생성.
