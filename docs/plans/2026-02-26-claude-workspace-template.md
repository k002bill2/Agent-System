# Claude Workspace Template Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** AOS의 Claude Code 시스템을 core + addon 레이어로 분리한 팀 표준 범용 템플릿 repo를 생성한다.

**Architecture:** Git repo(`claude-workspace-template`)에 core/ + addons/ 계층 구조. init.sh가 config.yaml을 읽어 대상 프로젝트에 .claude/ 디렉토리를 생성. checksum 기반 업데이트 지원.

**Tech Stack:** Bash (init.sh), Node.js (hooks), YAML (config), Markdown (agents/commands/skills)

**Source:** 디자인 문서 `docs/plans/2026-02-26-claude-workspace-template-design.md`

---

## Phase 1: Repository Scaffolding

### Task 1: 템플릿 repo 디렉토리 구조 생성

**Files:**
- Create: `claude-workspace-template/README.md`
- Create: `claude-workspace-template/config.yaml.example`
- Create: `claude-workspace-template/core/.gitkeep`
- Create: `claude-workspace-template/addons/.gitkeep`
- Create: `claude-workspace-template/tests/.gitkeep`

**Step 1: 루트 디렉토리 및 기본 구조 생성**

```bash
mkdir -p claude-workspace-template/{core/.claude/{agents/shared,commands,skills,hooks,checklists},addons/{react-typescript/{agents,commands,skills,hooks},python-backend/{agents,commands,skills,hooks},eval-system/{agents,commands,evals/{tasks,rubrics}},gemini-bridge/{commands,hooks,coordination}},tests}
```

**Step 2: config.yaml.example 작성**

```yaml
# claude-workspace.yaml — 프로젝트 루트에 배치
project:
  name: "my-app"
  description: "프로젝트 설명을 입력하세요"
  language: "ko"  # ko, en, ja

addons: []
  # - react-typescript
  # - python-backend
  # - eval-system
  # - gemini-bridge

paths:
  src: "src"
  tests: "tests"
  docs: "docs"

commands:
  typecheck: ""       # e.g. "npx tsc --noEmit"
  lint: ""            # e.g. "npx eslint ."
  test: ""            # e.g. "npm test"
  build: ""           # e.g. "npm run build"
  format: ""          # e.g. "npx prettier --write"

hooks:
  ethical_validator: true
  auto_formatter: true
  context_monitor: true
  protected_paths:
    - ".env"
    - "secrets"
    - ".git/"
```

**Step 3: 기본 README.md 작성**

`claude-workspace-template/README.md`에 프로젝트 개요, 설치법, 애드온 목록 작성.

**Step 4: Commit**

```bash
git add claude-workspace-template/
git commit -m "chore: scaffold claude-workspace-template directory structure"
```

---

## Phase 2: Core Layer 추출

### Task 2: Core Hooks 범용화

**Files:**
- Source: `.claude/hooks/ethicalValidator.js`
- Source: `.claude/hooks/autoFormatter.js`
- Source: `.claude/hooks/contextMonitor.js`
- Create: `claude-workspace-template/core/.claude/hooks/ethicalValidator.js`
- Create: `claude-workspace-template/core/.claude/hooks/autoFormatter.js`
- Create: `claude-workspace-template/core/.claude/hooks/contextMonitor.js`

**Step 1: ethicalValidator.js 복사 및 범용화**

원본을 복사한 후:
- AOS 특화 경로 패턴 제거
- `claude-workspace.yaml`의 `hooks.protected_paths`를 읽어 동적으로 차단 경로 설정
- 파일 상단에 config 로딩 로직 추가:

```javascript
// config 로딩: 프로젝트 루트의 claude-workspace.yaml에서 protected_paths 읽기
const fs = require('fs');
const path = require('path');

function loadConfig() {
  const configPaths = ['claude-workspace.yaml', 'claude-workspace.yml'];
  for (const p of configPaths) {
    const fullPath = path.join(process.cwd(), p);
    if (fs.existsSync(fullPath)) {
      // 간단한 YAML 파싱 (yaml 패키지 없이 기본 파싱)
      const content = fs.readFileSync(fullPath, 'utf-8');
      // protected_paths 추출
      // ...
    }
  }
  return { protectedPaths: ['.env', 'secrets', '.git/'] }; // 기본값
}
```

**Step 2: autoFormatter.js 범용화**

- Prettier 고정 → 파일 확장자 기반 포매터 자동 선택 로직:
  - `.ts`, `.tsx`, `.js`, `.jsx` → `npx prettier --write`
  - `.py` → `ruff format` (없으면 `black`)
  - `.go` → `gofmt -w`
  - `.rs` → `rustfmt`
- `claude-workspace.yaml`의 `commands.format`이 있으면 그것을 우선 사용

**Step 3: contextMonitor.js 범용화**

- AOS 특화 메트릭 로직 제거
- `/save-and-compact` 추천 로직만 유지
- 상호작용 카운트 기반 경고 유지

**Step 4: 테스트 — 각 훅이 에러 없이 실행되는지 확인**

```bash
echo '{"tool_input":{"command":"ls"}}' | node claude-workspace-template/core/.claude/hooks/ethicalValidator.js
echo $?  # Expected: 0
```

**Step 5: Commit**

```bash
git add claude-workspace-template/core/.claude/hooks/
git commit -m "feat(core): add generalized hook scripts (ethicalValidator, autoFormatter, contextMonitor)"
```

---

### Task 3: Core Agents 범용화

**Files:**
- Source: `.claude/agents/lead-orchestrator.md`
- Source: `.claude/agents/quality-validator.md`
- Source: `.claude/agents/shared/*.md` (5 files)
- Create: `claude-workspace-template/core/.claude/agents/lead-orchestrator.md`
- Create: `claude-workspace-template/core/.claude/agents/quality-validator.md`
- Create: `claude-workspace-template/core/.claude/agents/shared/` (5 files)

**Step 1: lead-orchestrator.md 범용화**

원본 복사 후:
- "AOS Dashboard" → "the current project" 또는 제거
- AOS 파일 경로 참조 → 일반적인 설명으로 대체
- ACE Framework 참조는 유지 (shared/에서 제공)

**Step 2: quality-validator.md 범용화**

- AOS 특화 체크리스트 항목 제거
- 범용 품질 기준만 유지 (타입 안전성, 테스트 커버리지, 코드 스타일)

**Step 3: shared/ 프레임워크 복사 (변경 없이)**

```bash
cp .claude/agents/shared/ace-framework.md claude-workspace-template/core/.claude/agents/shared/
cp .claude/agents/shared/quality-gates.md claude-workspace-template/core/.claude/agents/shared/
cp .claude/agents/shared/effort-scaling.md claude-workspace-template/core/.claude/agents/shared/
cp .claude/agents/shared/delegation-template.md claude-workspace-template/core/.claude/agents/shared/
cp .claude/agents/shared/parallel-agents-protocol.md claude-workspace-template/core/.claude/agents/shared/
```

**Step 4: Commit**

```bash
git add claude-workspace-template/core/.claude/agents/
git commit -m "feat(core): add generalized agents (lead-orchestrator, quality-validator, shared frameworks)"
```

---

### Task 4: Core Commands 범용화

**Files:**
- Source: `.claude/commands/{check-health,verify-app,config-backup,dev-docs,save-and-compact,resume,review,draft-commits}.md`
- Create: `claude-workspace-template/core/.claude/commands/` (8 files)

**Step 1: check-health.md 범용화**

원본 복사 후:
- 하드코딩된 `cd src/dashboard && npx tsc --noEmit` →
  "프로젝트 루트의 `claude-workspace.yaml` 파일에서 `commands` 섹션을 읽고, 각 명령어를 순서대로 실행. 설정되지 않은 명령어(빈 문자열)는 skip."
- AOS 특화 경로 제거

**Step 2: verify-app.md 범용화**

- 동일 패턴: config.yaml 참조로 전환
- Boris Cherny 피드백 루프 구조는 유지

**Step 3: 나머지 6개 커맨드 범용화**

- `config-backup.md`: 이미 범용적, AOS 언급만 제거
- `dev-docs.md`: 이미 범용적
- `save-and-compact.md`: `dev/active/` 경로를 config의 `paths` 참조로
- `resume.md`: 동일
- `review.md`: AOS 파일 패턴 → 범용 패턴
- `draft-commits.md`: AOS 경로 매핑 → config.yaml paths 참조

**Step 4: Commit**

```bash
git add claude-workspace-template/core/.claude/commands/
git commit -m "feat(core): add generalized commands (check-health, verify-app, etc.)"
```

---

### Task 5: Core Skills 복사

**Files:**
- Source: `.claude/skills/{verification-loop,hook-creator,skill-creator,slash-command-creator,subagent-creator,agent-improvement,agent-observability,external-memory}/SKILL.md`
- Create: `claude-workspace-template/core/.claude/skills/` (8 directories)

**Step 1: 8개 범용 스킬 복사**

이 스킬들은 이미 스택 무관하므로 변경 없이 복사:

```bash
for skill in verification-loop hook-creator skill-creator slash-command-creator subagent-creator agent-improvement agent-observability external-memory; do
  cp -r .claude/skills/$skill claude-workspace-template/core/.claude/skills/
done
```

**Step 2: AOS 특화 참조가 있는지 각 SKILL.md 확인 및 제거**

각 SKILL.md에서 "AOS", "Dashboard" 등 프로젝트 특화 언급 검색 → 범용 표현으로 대체.

**Step 3: Commit**

```bash
git add claude-workspace-template/core/.claude/skills/
git commit -m "feat(core): add 8 stack-agnostic skills"
```

---

### Task 6: Core Checklists + Settings 복사

**Files:**
- Source: `.claude/checklists/{code-review,deployment}.md`
- Create: `claude-workspace-template/core/.claude/checklists/` (2 files)
- Create: `claude-workspace-template/core/.claude/settings.json`

**Step 1: 체크리스트 복사 및 범용화**

```bash
cp .claude/checklists/code-review.md claude-workspace-template/core/.claude/checklists/
cp .claude/checklists/deployment.md claude-workspace-template/core/.claude/checklists/
```

AOS 특화 항목 제거.

**Step 2: 기본 settings.json 작성**

core hooks만 포함하는 최소 settings.json 생성:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "node .claude/hooks/ethicalValidator.js 2>/dev/null || true", "timeout": 5 }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{ "type": "command", "command": "node .claude/hooks/autoFormatter.js 2>/dev/null || true", "timeout": 5 }]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "node .claude/hooks/contextMonitor.js 2>/dev/null || true", "timeout": 5 }]
      }
    ]
  }
}
```

**Step 3: Commit**

```bash
git add claude-workspace-template/core/.claude/checklists/ claude-workspace-template/core/.claude/settings.json
git commit -m "feat(core): add checklists and base settings.json"
```

---

### Task 7: CLAUDE.md.template 작성

**Files:**
- Create: `claude-workspace-template/core/CLAUDE.md.template`

**Step 1: 템플릿 작성**

AOS의 CLAUDE.md를 기반으로, 프로젝트 특화 부분을 변수(`{{project.name}}` 등)와 TODO 마커로 대체한 템플릿 생성.

주요 섹션:
- Project Overview (변수 치환)
- Commands (활성 애드온에 따라 조건부 포함)
- Quick Start (TODO)
- Directory Structure (TODO)
- Tech Stack (TODO)
- Code Patterns (TODO)
- Testing (commands.test 변수)
- Coding Guidelines (범용 규칙)
- 문서 관리 원칙 (범용)

**Step 2: Commit**

```bash
git add claude-workspace-template/core/CLAUDE.md.template
git commit -m "feat(core): add CLAUDE.md template with variable placeholders"
```

---

## Phase 3: Addon Layers

### Task 8: react-typescript 애드온

**Files:**
- Source: `.claude/agents/{web-ui-specialist,performance-optimizer,test-automation-specialist}.md`
- Source: `.claude/commands/{test-coverage,start-dashboard}.md`
- Source: `.claude/skills/{react-web-development,test-automation,verify-ui}/`
- Create: `claude-workspace-template/addons/react-typescript/` (all above, generalized)

**Step 1: 3개 에이전트 범용화 및 복사**

- `web-ui-specialist.md`: "AOS Dashboard" → 범용 React 프로젝트. Zustand 고정 참조 → "상태 관리 라이브러리" 표현
- `performance-optimizer.md`: AOS 컨텍스트 제거
- `test-automation-specialist.md`: AOS 특화 패턴 제거

**Step 2: 2개 커맨드 범용화 및 복사**

- `test-coverage.md`: AOS 경로 → config.yaml paths 참조
- `start-dashboard.md`: 포트, 프레임워크명 범용화

**Step 3: 3개 스킬 복사**

```bash
for skill in react-web-development test-automation verify-ui; do
  cp -r .claude/skills/$skill claude-workspace-template/addons/react-typescript/skills/
done
```

**Step 4: prettierFormatter.js 훅 작성**

PostToolUse Edit|Write에서 `.ts/.tsx/.js/.jsx` 파일에 Prettier 실행하는 전용 훅.

**Step 5: addon용 settings.json 패치 파일 작성**

init.sh가 core settings.json에 머지할 추가 훅 설정:

```json
{
  "hooks_patch": {
    "PostToolUse": [
      { "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "node .claude/hooks/prettierFormatter.js 2>/dev/null || true" }] }
    ]
  }
}
```

**Step 6: Commit**

```bash
git add claude-workspace-template/addons/react-typescript/
git commit -m "feat(addon): add react-typescript addon (3 agents, 2 commands, 3 skills, 1 hook)"
```

---

### Task 9: python-backend 애드온

**Files:**
- Source: `.claude/agents/{backend-integration-specialist,code-simplifier}.md`
- Source: `.claude/commands/deploy-with-tests.md`
- Source: `.claude/skills/verify-api-route/`
- Create: `claude-workspace-template/addons/python-backend/`

**Step 1: 2개 에이전트 범용화**

- `backend-specialist.md` (renamed): Firebase/Seoul API → 범용 REST API + DB
- `code-simplifier.md`: React 예제 제거, Python 중심 유지

**Step 2: deploy-with-tests.md 범용화**

- pytest/unittest 선택 가능하게
- 프론트엔드 빌드 부분은 조건부

**Step 3: verify-api-route 스킬 복사**

**Step 4: ruffFormatter.js 훅 작성**

`.py` 파일 저장 시 `ruff format` 실행.

**Step 5: Commit**

```bash
git add claude-workspace-template/addons/python-backend/
git commit -m "feat(addon): add python-backend addon (2 agents, 1 command, 1 skill, 1 hook)"
```

---

### Task 10: eval-system 애드온

**Files:**
- Source: `.claude/agents/{eval-task-runner,eval-grader}.md`
- Source: `.claude/commands/run-eval.md`
- Source: `.claude/evals/{tasks/schema.yaml,rubrics/}`
- Create: `claude-workspace-template/addons/eval-system/`

**Step 1: 2개 에이전트 복사 (거의 변경 없음)**

eval 시스템은 이미 `.claude/evals/` 규약 기반이므로 경로 참조만 확인.

**Step 2: run-eval.md 복사**

**Step 3: evals/ 스캐폴딩 (schema + 빈 rubrics)**

- `tasks/schema.yaml` 복사
- `rubrics/` 디렉토리에 예제 rubric 1개 포함
- `README.md`에 eval 시스템 사용법 문서화

**Step 4: Commit**

```bash
git add claude-workspace-template/addons/eval-system/
git commit -m "feat(addon): add eval-system addon (2 agents, 1 command, eval scaffolding)"
```

---

### Task 11: gemini-bridge 애드온

**Files:**
- Source: `.claude/commands/{gemini-review,gemini-scan}.md`
- Source: `.claude/hooks/geminiAutoReview.js` (if exists)
- Source: `.claude/gemini-bridge/`
- Create: `claude-workspace-template/addons/gemini-bridge/`

**Step 1: 2개 커맨드 복사**

- Gemini CLI 설치 전제조건 문서화
- AOS 특화 파일 패턴 → 범용

**Step 2: geminiAutoReview.js 훅 범용화**

- AOS 특화 패턴 제거
- 변경 파일 수 임계값 기반 자동 리뷰 트리거만 유지

**Step 3: coordination/ 초기 상태 파일**

```json
{ "gemini-state.json": {} }
```

**Step 4: Commit**

```bash
git add claude-workspace-template/addons/gemini-bridge/
git commit -m "feat(addon): add gemini-bridge addon (2 commands, 1 hook)"
```

---

## Phase 4: init.sh 구현

### Task 12: init.sh 핵심 로직

**Files:**
- Create: `claude-workspace-template/init.sh`

**Step 1: 대화형 config 생성 함수 작성**

```bash
#!/usr/bin/env bash
set -euo pipefail

TEMPLATE_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_DIR="${1:-.}"
CONFIG_FILE="claude-workspace.yaml"

# config.yaml이 없으면 대화형으로 생성
create_config_interactive() {
  echo "=== Claude Workspace 초기화 ==="
  read -p "프로젝트 이름: " project_name
  read -p "프로젝트 설명: " project_desc
  # 애드온 선택 (체크박스 스타일)
  echo "사용 가능한 애드온:"
  echo "  1) react-typescript"
  echo "  2) python-backend"
  echo "  3) eval-system"
  echo "  4) gemini-bridge"
  read -p "선택 (쉼표 구분, e.g. 1,3): " addon_choices
  # ... config.yaml 생성
}
```

**Step 2: core 복사 함수**

```bash
install_core() {
  echo "📦 Core 설치 중..."
  cp -r "$TEMPLATE_DIR/core/.claude" "$TARGET_DIR/.claude"
}
```

**Step 3: addon 머지 함수**

```bash
install_addon() {
  local addon="$1"
  local addon_dir="$TEMPLATE_DIR/addons/$addon"
  echo "📦 Addon '$addon' 설치 중..."

  # agents, commands, skills, hooks 각각 머지
  for subdir in agents commands skills hooks; do
    if [ -d "$addon_dir/$subdir" ]; then
      cp -r "$addon_dir/$subdir/"* "$TARGET_DIR/.claude/$subdir/" 2>/dev/null || true
    fi
  done

  # 특수 디렉토리 (evals, coordination 등)
  for special in evals coordination; do
    if [ -d "$addon_dir/$special" ]; then
      cp -r "$addon_dir/$special" "$TARGET_DIR/.claude/"
    fi
  done
}
```

**Step 4: CLAUDE.md 생성 함수**

```bash
generate_claude_md() {
  # CLAUDE.md.template에서 변수 치환
  sed -e "s/{{project.name}}/$project_name/g" \
      -e "s/{{project.description}}/$project_desc/g" \
      -e "s/{{commands.test}}/$cmd_test/g" \
      "$TEMPLATE_DIR/core/CLAUDE.md.template" > "$TARGET_DIR/CLAUDE.md"
}
```

**Step 5: settings.json + hooks.json 생성 함수**

core settings.json 복사 후, 각 addon의 hooks_patch를 머지.

**Step 6: checksum 저장 함수**

```bash
save_checksums() {
  find "$TARGET_DIR/.claude" -type f | while read f; do
    echo "$(md5 -q "$f") $f"
  done > "$TARGET_DIR/.claude/.checksums"
}
```

**Step 7: 레지스트리 자동 생성 함수**

```bash
generate_registries() {
  # agents/*.md 스캔 → agents-registry.json
  # commands/*.md 스캔 → commands-registry.json
  node -e "
    const fs = require('fs');
    const path = require('path');
    // ... .md 파일의 frontmatter/첫 줄에서 description 추출
  "
}
```

**Step 8: 메인 플로우 조립**

```bash
main() {
  parse_args "$@"
  if [ "$MODE" = "update" ]; then
    update_existing
  else
    [ ! -f "$CONFIG_FILE" ] && create_config_interactive
    install_core
    for addon in "${ADDONS[@]}"; do
      install_addon "$addon"
    done
    generate_claude_md
    generate_settings
    generate_registries
    save_checksums
    echo "✅ Claude Workspace 설정 완료!"
  fi
}
```

**Step 9: Commit**

```bash
git add claude-workspace-template/init.sh
chmod +x claude-workspace-template/init.sh
git commit -m "feat: implement init.sh with interactive setup, addon merging, and registry generation"
```

---

### Task 13: init.sh 업데이트 모드

**Files:**
- Modify: `claude-workspace-template/init.sh`

**Step 1: update_existing 함수 구현**

```bash
update_existing() {
  echo "🔄 업데이트 모드..."

  # 1. 백업
  backup_dir=".claude/backups/$(date +%Y-%m-%d)"
  cp -r .claude "$backup_dir"

  # 2. checksum 비교로 사용자 수정 감지
  while IFS=' ' read -r hash filepath; do
    current_hash=$(md5 -q "$filepath" 2>/dev/null || echo "deleted")
    if [ "$hash" != "$current_hash" ]; then
      MODIFIED_FILES+=("$filepath")
    fi
  done < .claude/.checksums

  # 3. 머지 규칙 적용
  # - shared/: 항상 덮어쓰기
  # - hooks/*.js: 항상 덮어쓰기
  # - 수정된 파일: .new 생성
  # - CLAUDE.md: skip (diff만 출력)

  # 4. diff 요약 출력
  echo "=== 업데이트 요약 ==="
  echo "백업: $backup_dir"
  echo "덮어쓰기: ${#OVERWRITTEN[@]}개"
  echo "수동 머지 필요 (.new): ${#MODIFIED_FILES[@]}개"
}
```

**Step 2: 테스트**

```bash
# 가상 프로젝트에서 init → 파일 수정 → update 시나리오 테스트
```

**Step 3: Commit**

```bash
git commit -m "feat: add --update mode to init.sh with checksum-based change detection"
```

---

## Phase 5: 테스트

### Task 14: init.sh 통합 테스트

**Files:**
- Create: `claude-workspace-template/tests/test-core-only.sh`
- Create: `claude-workspace-template/tests/test-react-addon.sh`
- Create: `claude-workspace-template/tests/test-update.sh`

**Step 1: test-core-only.sh 작성**

```bash
#!/usr/bin/env bash
set -euo pipefail

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# config 생성
cat > "$TMPDIR/claude-workspace.yaml" << 'EOF'
project:
  name: test-project
  description: Test
  language: en
addons: []
commands:
  test: "echo test"
hooks:
  ethical_validator: true
  auto_formatter: true
  context_monitor: true
EOF

# init 실행
./init.sh "$TMPDIR"

# 검증
[ -d "$TMPDIR/.claude/agents/shared" ] || { echo "FAIL: shared agents missing"; exit 1; }
[ -f "$TMPDIR/.claude/hooks/ethicalValidator.js" ] || { echo "FAIL: hook missing"; exit 1; }
[ -f "$TMPDIR/.claude/settings.json" ] || { echo "FAIL: settings missing"; exit 1; }
[ -f "$TMPDIR/CLAUDE.md" ] || { echo "FAIL: CLAUDE.md missing"; exit 1; }
[ -f "$TMPDIR/.claude/.checksums" ] || { echo "FAIL: checksums missing"; exit 1; }

# CLAUDE.md에 프로젝트명이 들어갔는지
grep -q "test-project" "$TMPDIR/CLAUDE.md" || { echo "FAIL: project name not in CLAUDE.md"; exit 1; }

echo "✅ test-core-only PASSED"
```

**Step 2: test-react-addon.sh 작성**

```bash
# core + react-typescript 설치 후
# - web-ui-specialist.md 존재 확인
# - prettierFormatter.js 존재 확인
# - settings.json에 Prettier 훅 포함 확인
```

**Step 3: test-update.sh 작성**

```bash
# 1. init 실행
# 2. agent 파일 수정
# 3. --update 실행
# 4. 수정된 파일은 .new 생성 확인
# 5. shared/는 덮어쓰기 확인
# 6. CLAUDE.md는 변경 없음 확인
```

**Step 4: 전체 테스트 실행**

```bash
bash tests/test-core-only.sh
bash tests/test-react-addon.sh
bash tests/test-update.sh
```

**Step 5: Commit**

```bash
git add claude-workspace-template/tests/
git commit -m "test: add integration tests for init.sh (core, addon, update)"
```

---

## Phase 6: 문서화

### Task 15: README.md 완성

**Files:**
- Modify: `claude-workspace-template/README.md`

**Step 1: 전체 README 작성**

섹션: 개요, 빠른 시작, 애드온 목록 (각각 포함 내용), config.yaml 레퍼런스, 업데이트 방법, 커스터마이징 가이드, FAQ.

**Step 2: CHANGELOG.md 초기 버전 작성**

```markdown
# Changelog

## v1.0.0 (2026-02-26)

- Core: 8 skills, 8 commands, 2 agents, 5 shared frameworks, 3 hooks
- Addon: react-typescript (3 agents, 2 commands, 3 skills, 1 hook)
- Addon: python-backend (2 agents, 1 command, 1 skill, 1 hook)
- Addon: eval-system (2 agents, 1 command, eval scaffolding)
- Addon: gemini-bridge (2 commands, 1 hook)
- init.sh: interactive setup, addon merging, checksum-based update
```

**Step 3: Commit**

```bash
git add claude-workspace-template/README.md claude-workspace-template/CHANGELOG.md
git commit -m "docs: complete README and CHANGELOG for v1.0.0"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1. Scaffolding | Task 1 | 디렉토리 구조 + config 예시 |
| 2. Core | Tasks 2-7 | Hooks, Agents, Commands, Skills, Checklists, CLAUDE.md.template |
| 3. Addons | Tasks 8-11 | react-typescript, python-backend, eval-system, gemini-bridge |
| 4. init.sh | Tasks 12-13 | 초기화/업데이트 스크립트 |
| 5. Tests | Task 14 | 통합 테스트 |
| 6. Docs | Task 15 | README, CHANGELOG |

**총 15개 태스크, 약 50+ 스텝**
