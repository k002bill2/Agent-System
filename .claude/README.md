# Claude Code Configuration

Claude Code configuration for AOS (Agent Orchestration Service) Dashboard.

## Directory Structure

```
.claude/
├── skills/           # 11개 AI 스킬
├── agents/           # 13개 서브 에이전트
│   └── shared/       # 공유 프레임워크 (Quality Gates 등)
├── commands/         # 18개 슬래시 명령어
├── hooks/            # 훅 스크립트 — CC 발효는 settings.json 등록분(현재 verificationGuard)만, 나머지는 백엔드 표시용 (ADR-017; learnings 훅은 2026-07 감사로 제거)
├── evals/            # 평가 시스템 (17 tasks, 6 rubrics)
├── hooks.json        # 백엔드 대시보드 훅 레지스트리(표시·편집용) — CC 미실행, CC 발효 훅은 settings.json (ADR-017)
├── settings.json     # 로컬 설정
└── mcp.json          # MCP 서버 설정
```

## Commands

### 검증 및 품질

| Command | Purpose |
|---------|---------|
| `/check-health` | 타입체크, 린트, 테스트, 빌드 종합 검증 |
| `/test-coverage` | 테스트 커버리지 분석 |
| `/build-fix` | 빌드 에러를 최소 변경으로 점진적 수정 |
| `/code-review` | 미커밋 변경을 보안+품질 검사 (네이티브 code/security-review) |
| `/verify-loop` | 자동 재검증 루프 (최대 3회 재시도, 실패 시 자동 수정) |

### 서비스 관리

| Command | Purpose |
|---------|---------|
| `/start-all` | 전체 서비스 시작 (인프라 + Backend + Dashboard) |
| `/start-dashboard` | Dashboard 단독 시작 |
| `/stop-all` | 전체 서비스 중지 |

### 계획 및 개발

| Command | Purpose |
|---------|---------|
| `/plan` | planner 에이전트로 코딩 전 구현 계획 수립 |
| `/tdd` | 테스트 먼저 작성 후 구현 (TDD 워크플로우) |
| `/explore` | 코드베이스를 탐색하여 구조 파악 |
| `/execute-tasks-file` | dev/active phase의 tasks.md를 frontmatter 기반 자동 실행 |
| `/update-llm-models` | LLM 모델 레지스트리 갱신 (신모델/가격/context/default) |

### 워크플로우 / Git

| Command | Purpose |
|---------|---------|
| `/quick-commit` | 간단한 수정용 빠른 커밋 (검증 스킵) |
| `/wip-save` | 작업 상태 저장/복원 (WIP 커밋) |
| `/session-wrap` | 세션 종료 시 문서/패턴/학습/후속작업 자동 정리 |

## Skills

| Skill | Purpose |
|-------|---------|
| `react-web-development` | React Web 컴포넌트, Tailwind CSS, TypeScript |
| `test-automation` | Vitest 테스트, 커버리지 분석 |
| `verification-loop` | 검증 피드백 루프 (verify-app 병합) |
| `run-eval` | AI 에이전트 평가 및 pass@k 지표 계산 |
| `aos-feature-harness` | AOS 풀스택 기능 개발 오케스트레이터 (계획→빌드→검증→테스트→리뷰) |
| `verify-backend` | Python/FastAPI/LangGraph 백엔드 패턴 검증 |
| `verify-frontend` | React/TypeScript/Tailwind 프론트엔드 패턴 검증 |
| `agent-improvement` | 에이전트 실패 진단 및 개선안 제시 |
| `agent-observability` | 에이전트 트레이싱/메트릭 수집 |
| `merge-worktree` | Git worktree squash-merge (포괄적 커밋 메시지 생성) |
| `update-llm-models` | AOS LLM 모델 레지스트리 갱신 절차 |

## Sub-agents

| Agent | Model | Expertise |
|-------|-------|-----------|
| `web-ui-specialist` | inherit | React Web UI/UX (Tailwind CSS) |
| `backend-integration-specialist` | inherit | FastAPI, SQLAlchemy, LangGraph |
| `test-automation-specialist` | opus | 테스트 자동화 |
| `eval-grader` | inherit | 평가 채점 (코드 검사 + LLM 루브릭) |
| `eval-task-runner` | inherit | 평가 실행 및 pass@k 계산 |
| `architect` | opus | 시스템 설계·확장성·기술 결정 |
| `build-error-resolver` | sonnet | 빌드/타입 에러 해결 (최소 diff) |
| `code-reviewer` | opus | 코드 품질·보안·유지보수성 리뷰 |
| `docs-sync` | opus | 기능 완료 후 docs/ 동기화 |
| `integration-qa` | opus | FastAPI↔React 경계 계약 정합성 QA |
| `planner` | opus | 복잡 기능·리팩터링 계획 수립 |
| `security-reviewer` | opus | 보안 취약점 탐지·수정 |
| `tdd-guide` | opus | TDD (테스트 우선) 방법론 강제 |

### Shared Frameworks (`shared/`)

- `quality-reference.md`: 공유 품질 게이트

## MCP Servers

### 활성화됨

| Server | Purpose |
|--------|---------|
| `context7` | 시맨틱 검색 (글로벌 설정) |
| `tavily` | 웹 검색 (글로벌 설정, API 키 필요) |

---

**Skills**: 11 | **Agents**: 13 (+shared) | **Commands**: 18
