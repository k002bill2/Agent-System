# Claude Workspace Template

팀 프로젝트를 위한 Claude Code 설정 템플릿.

Core + Addon 레이어 아키텍처로, 기술 스택에 관계없이 일관된 Claude Code 워크스페이스를 구성합니다.

## Features

- **Core + Addon 레이어 아키텍처** -- 공통 설정(Core)과 스택별 설정(Addon)을 분리하여 필요한 조합만 선택
- **스택 무관(Stack-agnostic)** -- React, Python, Go, Rust 등 어떤 프로젝트에도 적용 가능
- **인터랙티브 셋업** -- config 파일 없이 실행하면 대화형으로 프로젝트 설정 생성
- **안전한 업데이트** -- 체크섬 기반 변경 감지로 사용자 수정 파일을 보호하면서 템플릿 업데이트
- **자동 레지스트리 생성** -- agents-registry.json, commands-registry.json 자동 생성

## Quick Start

```bash
# 1. 템플릿 클론
git clone <repo-url> claude-workspace-template

# 2. 프로젝트에 설치 (인터랙티브)
cd your-project
../claude-workspace-template/init.sh

# 3. 또는 config 파일로 설치
../claude-workspace-template/init.sh --config claude-workspace.yaml

# 4. 특정 애드온만 설치
../claude-workspace-template/init.sh --addons react-typescript,eval-system
```

설치 후 생성되는 파일:
```
your-project/
├── .claude/
│   ├── agents/           # 에이전트 정의
│   ├── commands/         # 슬래시 커맨드
│   ├── skills/           # 스킬 (SKILL.md)
│   ├── hooks/            # 훅 스크립트
│   ├── checklists/       # 체크리스트
│   ├── settings.json     # Claude Code 설정 (hooks 바인딩)
│   ├── agents-registry.json
│   └── commands-registry.json
├── CLAUDE.md             # 프로젝트별 커스터마이즈된 가이드
└── claude-workspace.yaml # 설정 파일
```

## Addon Catalog

| Addon | Description | Agents | Commands | Skills | Hooks |
|-------|-------------|--------|----------|--------|-------|
| `react-typescript` | React/TypeScript 개발 | web-ui-specialist, performance-optimizer, test-automation-specialist | test-coverage, start-dev-server | react-web-development, test-automation, verify-ui | prettierFormatter |
| `python-backend` | Python 백엔드 개발 | backend-specialist, code-simplifier | deploy-with-tests | verify-api-route | ruffFormatter |
| `eval-system` | 에이전트 평가 프레임워크 | eval-task-runner, eval-grader | run-eval | -- | -- |
| `gemini-bridge` | Gemini CLI 크로스리뷰 | -- | gemini-review, gemini-scan | -- | geminiAutoReview |

## Core Contents

Core는 모든 프로젝트에 공통으로 설치되는 기본 설정입니다.

### Agents (2) + Shared Frameworks (5)

| Agent | Description |
|-------|-------------|
| `lead-orchestrator` | 멀티 에이전트 작업 조정 및 위임 |
| `quality-validator` | 코드 품질 검증 및 리뷰 |

| Shared Framework | Description |
|------------------|-------------|
| `ace-framework` | 병렬 실행 프로토콜 (Agent Collaborative Execution) |
| `quality-gates` | 단계별 품질 게이트 정의 |
| `effort-scaling` | 작업 복잡도에 따른 리소스 할당 |
| `delegation-template` | 에이전트 위임 템플릿 |
| `parallel-agents-protocol` | 병렬 에이전트 실행 규약 |

### Commands (8)

| Command | Description |
|---------|-------------|
| `/check-health` | 타입체크, 린트, 테스트, 빌드 종합 검증 |
| `/verify-app` | Boris Cherny 스타일 검증 루프 |
| `/config-backup` | 설정 백업 |
| `/dev-docs` | Dev docs 시스템 (대규모 작업 컨텍스트 유지) |
| `/save-and-compact` | 컨텍스트 저장 후 /compact |
| `/resume` | 이전 세션 컨텍스트 복원 |
| `/review` | 코드 리뷰 |
| `/draft-commits` | 커밋 메시지 초안 작성 |

### Skills (8)

| Skill | Description |
|-------|-------------|
| `verification-loop` | 검증 루프 패턴 |
| `hook-creator` | Claude Code 훅 생성 |
| `skill-creator` | 스킬 패키지 생성 |
| `slash-command-creator` | 슬래시 커맨드 생성 |
| `subagent-creator` | 서브에이전트 생성 |
| `agent-improvement` | 에이전트 프롬프트 개선 |
| `agent-observability` | 에이전트 동작 관찰 및 분석 |
| `external-memory` | 외부 메모리 패턴 |

### Hooks (3)

| Hook | Event | Description |
|------|-------|-------------|
| `ethicalValidator` | PreToolUse (Bash) | 위험 명령 차단 (rm -rf /, 프로덕션 DB 접근 등) |
| `autoFormatter` | PostToolUse (Edit/Write) | 파일 저장 시 자동 포맷 |
| `contextMonitor` | Stop | 컨텍스트 리밋 경고 |

### Checklists (2)

| Checklist | Description |
|-----------|-------------|
| `code-review` | 코드 리뷰 체크리스트 |
| `deployment` | 배포 전 체크리스트 |

## Configuration Reference

프로젝트 루트에 `claude-workspace.yaml`을 배치합니다.

```yaml
# 프로젝트 기본 정보
project:
  name: "my-app"                    # 프로젝트 이름 (CLAUDE.md에 반영)
  description: "프로젝트 설명"        # 프로젝트 설명
  language: "ko"                    # 언어: ko, en, ja

# 활성화할 애드온 목록
addons:
  - react-typescript
  - python-backend
  # - eval-system
  # - gemini-bridge

# 소스 경로 설정
paths:
  src: "src"                        # 소스 코드 디렉토리
  tests: "tests"                    # 테스트 디렉토리
  docs: "docs"                      # 문서 디렉토리

# 빌드/테스트 명령어 (check-health, verify-app 등이 참조)
commands:
  typecheck: "npx tsc --noEmit"     # 타입체크 명령어
  lint: "npx eslint ."             # 린트 명령어
  test: "npm test"                  # 테스트 명령어
  build: "npm run build"            # 빌드 명령어
  format: "npx prettier --write"    # 포맷 명령어

# 훅 설정
hooks:
  ethical_validator: true           # 위험 명령 차단
  auto_formatter: true              # 저장 시 자동 포맷
  context_monitor: true             # 컨텍스트 리밋 경고
  protected_paths:                  # Edit/Write 차단 경로
    - ".env"
    - "secrets"
    - ".git/"
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `project.name` | string | `"my-project"` | CLAUDE.md 제목에 사용 |
| `project.description` | string | -- | 프로젝트 설명 |
| `project.language` | string | `"en"` | `ko`, `en`, `ja` |
| `addons` | list | `[]` | 활성화할 애드온 이름 목록 |
| `paths.src` | string | `"src"` | 소스 코드 경로 |
| `paths.tests` | string | `"tests"` | 테스트 경로 |
| `paths.docs` | string | `"docs"` | 문서 경로 |
| `commands.typecheck` | string | -- | 타입체크 명령어 |
| `commands.lint` | string | -- | 린트 명령어 |
| `commands.test` | string | -- | 테스트 명령어 |
| `commands.build` | string | -- | 빌드 명령어 |
| `commands.format` | string | -- | 포맷 명령어 |
| `hooks.ethical_validator` | bool | `true` | 위험 명령 차단 훅 |
| `hooks.auto_formatter` | bool | `true` | 자동 포맷 훅 |
| `hooks.context_monitor` | bool | `true` | 컨텍스트 모니터 훅 |
| `hooks.protected_paths` | list | `.env, secrets, .git/` | 보호 경로 |

## CLI Reference

```
Usage: init.sh [OPTIONS] [TARGET_DIR]

Options:
  --config FILE    config 파일 경로 (기본: TARGET_DIR/claude-workspace.yaml)
  --update         기존 설치 업데이트 (안전한 재초기화)
  --addons LIST    애드온 목록, 쉼표 구분 (config 파일 대신 사용)
  --help           도움말 표시

TARGET_DIR 기본값은 현재 디렉토리(.)
```

### Examples

```bash
# 인터랙티브 설치 (config 없이)
./init.sh /path/to/my-project

# 특정 config 파일로 설치
./init.sh --config ./my-config.yaml /path/to/my-project

# 기존 설치 업데이트
./init.sh --update /path/to/my-project

# 커맨드라인에서 애드온 지정
./init.sh --addons react-typescript,eval-system /path/to/my-project
```

## Update Guide

기존에 설치된 워크스페이스를 업데이트하려면 `--update` 플래그를 사용합니다.

```bash
# 템플릿을 최신 버전으로 pull
cd claude-workspace-template
git pull

# 프로젝트 업데이트
./init.sh --update /path/to/my-project
```

### 업데이트 동작 방식

1. **백업 생성** -- `.claude/backups/{timestamp}/`에 현재 상태 전체 백업
2. **체크섬 비교** -- 각 파일의 설치 시점 체크섬과 현재 체크섬 비교
3. **머지 규칙 적용** -- 아래 표에 따라 파일별 처리
4. **레지스트리 재생성** -- agents-registry.json, commands-registry.json 갱신
5. **체크섬 갱신** -- 새 체크섬 저장

### Merge Rules

| 파일 유형 | 사용자 미수정 시 | 사용자 수정 시 |
|-----------|----------------|---------------|
| `agents/shared/*` | 항상 덮어쓰기 | 항상 덮어쓰기 |
| `hooks/*.js` | 항상 덮어쓰기 | 항상 덮어쓰기 |
| 신규 파일 | 복사 | (해당 없음) |
| 기존 파일 (기타) | 덮어쓰기 | `.new` 파일 생성, 수동 머지 필요 |
| `CLAUDE.md` | 덮어쓰지 않음 | `CLAUDE.md.new`로 저장, diff 확인 |
| `settings.json` | 기존 유지 + 새 항목 추가 | 기존 유지 + 새 항목 추가 |

### 충돌 해결

업데이트 후 `.new` 파일이 생성되었다면:

```bash
# 변경 내용 확인
diff .claude/commands/check-health.md .claude/commands/check-health.md.new

# 수동 머지 후 .new 파일 삭제
rm .claude/commands/check-health.md.new
```

## Customization Guide

### 프로젝트별 에이전트 추가

`.claude/agents/` 디렉토리에 마크다운 파일을 추가합니다.

```markdown
<!-- .claude/agents/my-specialist.md -->
---
description: 내 프로젝트 전문 에이전트
---

# My Specialist

## Role
프로젝트 도메인 전문가로서 ...

## Tools
Bash, Read, Edit, Write, Grep, Glob

## Guidelines
- ...
```

추가 후 `init.sh --update`를 실행하면 레지스트리가 자동 갱신됩니다.
또는 수동으로 `.claude/agents-registry.json`을 편집해도 됩니다.

### 커스텀 커맨드 추가

`.claude/commands/` 디렉토리에 마크다운 파일을 추가합니다.

```markdown
<!-- .claude/commands/my-command.md -->
---
description: 내 커스텀 커맨드
---

실행할 작업을 여기에 기술합니다.
Claude Code에서 `/my-command`로 호출됩니다.
```

### 프로젝트별 스킬 추가

`.claude/skills/{skill-name}/SKILL.md` 구조로 생성합니다.

```markdown
<!-- .claude/skills/my-skill/SKILL.md -->
# My Skill

## Description
이 스킬이 하는 일 ...

## Steps
1. ...
2. ...
```

### CLAUDE.md 커스터마이즈

설치 후 생성된 `CLAUDE.md`에는 `<!-- TODO -->` 마커가 포함되어 있습니다.
각 마커를 프로젝트에 맞게 채워 넣으세요:

- **Directory Structure** -- 실제 프로젝트 구조로 교체
- **Tech Stack** -- 사용 중인 기술 스택 기입
- **Quick Start** -- 설치 및 실행 방법
- **Code Patterns** -- 프로젝트 코딩 컨벤션
- **Environment Variables** -- 필수/선택 환경 변수

## Contributing

### 새 애드온 추가

1. `addons/{addon-name}/` 디렉토리 생성

2. 필요한 하위 디렉토리 구성:
   ```
   addons/my-addon/
   ├── agents/           # 에이전트 .md 파일
   ├── commands/         # 커맨드 .md 파일
   ├── skills/           # 스킬 디렉토리 (SKILL.md)
   ├── hooks/            # 훅 .js 파일
   └── hooks-patch.json  # settings.json에 머지할 훅 설정
   ```

3. `hooks-patch.json` 형식:
   ```json
   {
     "PostToolUse": [
       {
         "matcher": "Edit|Write",
         "hooks": [
           {
             "type": "command",
             "command": "node .claude/hooks/myHook.js 2>/dev/null || true",
             "timeout": 10,
             "statusMessage": "Running my hook..."
           }
         ]
       }
     ]
   }
   ```

4. (선택) `CLAUDE.md.template`에 조건부 블록 추가:
   ```
   {{#if addon.my-addon}}
   ## My Addon Section
   - 애드온 관련 안내 ...
   {{/if}}
   ```

5. 테스트:
   ```bash
   ./init.sh --addons my-addon /tmp/test-project
   ```

### 기존 애드온 개선

- 에이전트/커맨드/스킬 파일을 직접 편집
- `hooks-patch.json`의 이벤트 바인딩 수정
- PR 제출 시 CHANGELOG.md 업데이트 포함

## License

MIT

## Template Structure

```
claude-workspace-template/
├── core/                 # 공통 설정 (모든 프로젝트에 설치)
│   ├── .claude/
│   │   ├── agents/       # 2 agents + 5 shared frameworks
│   │   ├── commands/     # 8 commands
│   │   ├── skills/       # 8 skills
│   │   ├── hooks/        # 3 hooks (JS)
│   │   ├── checklists/   # 2 checklists
│   │   └── settings.json # 기본 훅 바인딩
│   └── CLAUDE.md.template
├── addons/               # 스택별 확장
│   ├── react-typescript/
│   ├── python-backend/
│   ├── eval-system/
│   └── gemini-bridge/
├── tests/                # 통합 테스트
├── init.sh               # 설치/업데이트 CLI
├── config.yaml.example   # 설정 파일 예제
└── README.md
```
