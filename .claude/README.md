# Claude Code Configuration

Claude Code configuration for AOS (Agent Orchestration Service) Dashboard.

## Directory Structure

```
.claude/
├── skills/           # 12개 AI 스킬
├── agents/           # 11개 서브 에이전트
│   └── shared/       # 4개 공유 프레임워크 (ACE, Quality Gates 등)
├── commands/         # 12개 슬래시 명령어
├── hooks/            # 자동화 훅 스크립트
├── checklists/       # 코드 리뷰/테스트/배포 체크리스트
├── memory/           # 공통 패턴 문서
├── hooks.json        # 훅 설정
└── mcp.json          # MCP 서버 설정
```

## Commands

### 검증 및 품질

| Command | Purpose |
|---------|---------|
| `/check-health` | 타입체크, 린트, 테스트, 빌드 종합 검증 |
| `/verify-app` | Boris Cherny 스타일 검증 피드백 루프 |
| `/test-coverage` | 테스트 커버리지 분석 |
| `/simplify-code` | 코드 복잡도 분석 및 단순화 |
| `/review` | 변경된 파일 코드 리뷰 |

### Git & 배포

| Command | Purpose |
|---------|---------|
| `/commit-push-pr` | 커밋 → 푸시 → PR 자동화 |
| `/deploy-with-tests` | 테스트 검증 후 Vite 빌드/배포 |

### 세션 관리

| Command | Purpose |
|---------|---------|
| `/save-and-compact` | 컨텍스트 저장 후 /compact 실행 |
| `/resume` | 이전 세션 컨텍스트 복원 |
| `/config-backup` | 설정 백업/복원 |

### 유틸리티

| Command | Purpose |
|---------|---------|
| `/view-logs` | Vite/테스트 로그 분석 |
| `/run-eval` | AI 에이전트 평가 태스크 실행 |

## Skills

### 개발 스킬

| Skill | Purpose |
|-------|---------|
| `react-web-development` | React Web 컴포넌트, Tailwind CSS, TypeScript |
| `test-automation` | Vitest 테스트, 커버리지 분석 |
| `parallel-coordinator` | ACE 프레임워크 병렬 작업 조율 |

### 메타 스킬 (Claude Code 확장)

| Skill | Purpose |
|-------|---------|
| `skill-creator` | 새 스킬 생성 가이드 |
| `hook-creator` | 자동화 훅 생성 |
| `slash-command-creator` | 슬래시 명령어 생성 |
| `subagent-creator` | 서브 에이전트 생성 |

### 고급 기능

| Skill | Purpose |
|-------|---------|
| `external-memory` | 장기 컨텍스트 영속화 |
| `agent-observability` | 에이전트 트레이싱/메트릭 |
| `agent-improvement` | 자기 개선 루프 |
| `verification-loop` | 검증 피드백 루프 |
| `cc-feature-implementer-main` | 단계별 구현 계획 |

## Sub-agents

### 개발 전문가

| Agent | Model | Expertise |
|-------|-------|-----------|
| `web-ui-specialist` | Sonnet | React Web UI/UX (Tailwind CSS) |
| `backend-integration-specialist` | Sonnet | Firebase, API 통합 |
| `performance-optimizer` | Sonnet | 성능 최적화, 메모리 누수 |
| `test-automation-specialist` | Sonnet | 테스트 자동화 |

### 코드 품질

| Agent | Model | Expertise |
|-------|-------|-----------|
| `code-simplifier` | Sonnet | 코드 복잡도 분석 및 리팩토링 |
| `quality-validator` | Sonnet | 최종 품질 검증 |
| `background-verifier` | Sonnet | 백그라운드 종합 검증 |

### 오케스트레이션

| Agent | Model | Expertise |
|-------|-------|-----------|
| `lead-orchestrator` | Sonnet | 멀티 에이전트 워크플로우 조율 |
| `eval-grader` | Sonnet | AI 에이전트 평가 채점 |
| `eval-task-runner` | Sonnet | 평가 태스크 실행 |
| `brand-logo-finder` | Haiku | 브랜드 로고 검색 |

### Shared Frameworks (`shared/`)

- `ace-framework.md`: 병렬 실행 프로토콜
- `quality-gates.md`: 공유 품질 게이트
- `effort-scaling.md`: 태스크 복잡도별 리소스 할당
- `delegation-template.md`: 서브에이전트 위임 템플릿

## MCP Servers

### 활성화됨

| Server | Purpose |
|--------|---------|
| `codex-cli` | 코드 스니펫 |
| `context7` | 시맨틱 검색 |
| `tavily` | 웹 검색 (API 키 필요) |

### 비활성화 (토큰 절약)

| Server | Savings | Purpose |
|--------|---------|---------|
| `claude-in-chrome` | ~14K | Chrome 자동화 |
| `playwright` | ~14K | 브라우저 자동화 |
| `magic` | ~3.4K | 21st.dev UI 컴포넌트 |
| `github` | - | GitHub 통합 |
| `shadcn` | - | shadcn 컴포넌트 |
| `claude-context` | - | 벡터 컨텍스트 검색 |

## Quick Start

### Using Skills (Auto-Activation)

```bash
# Skills activate automatically based on context
"Create a SessionCard component"  # → react-web-development
"Generate tests for this hook"    # → test-automation
```

### Using Agents

```bash
@web-ui-specialist "Design the session detail page"
@performance-optimizer "Analyze re-render issues"
@backend-integration-specialist "Implement data fallback"
```

## Backup System

```bash
npm run backup:claude           # Create backup
npm run restore:claude:latest   # Restore latest
```

Backups stored in `.claude-backups/` with 30-day retention.

---

**Skills**: 12 | **Agents**: 11 (+4 shared) | **Commands**: 12 | **MCP Servers**: 3 enabled
