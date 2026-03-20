# Claude Code Configuration

Claude Code configuration for AOS (Agent Orchestration Service) Dashboard.

## Directory Structure

```
.claude/
├── skills/           # 3개 AI 스킬
├── agents/           # 5개 서브 에이전트
│   └── shared/       # 공유 프레임워크 (Quality Gates 등)
├── commands/         # 7개 슬래시 명령어
├── hooks/            # 보안 훅 (ethicalValidator + verificationGuard)
├── evals/            # 평가 시스템 (13 tasks, 4 rubrics)
├── hooks.json        # 훅 설정 (security guard + path protection + verification + notification)
├── settings.json     # 로컬 설정
└── mcp.json          # MCP 서버 설정
```

## Commands

### 검증 및 품질

| Command | Purpose |
|---------|---------|
| `/check-health` | 타입체크, 린트, 테스트, 빌드 종합 검증 |
| `/verify-app` | Boris Cherny 스타일 검증 피드백 루프 |
| `/test-coverage` | 테스트 커버리지 분석 |
| `/run-eval` | AI 에이전트 평가 및 pass@k 지표 계산 |

### 서비스 관리

| Command | Purpose |
|---------|---------|
| `/start-all` | 전체 서비스 시작 (인프라 + Backend + Dashboard) |
| `/start-dashboard` | Dashboard 단독 시작 |
| `/stop-all` | 전체 서비스 중지 |

## Skills

| Skill | Purpose |
|-------|---------|
| `react-web-development` | React Web 컴포넌트, Tailwind CSS, TypeScript |
| `test-automation` | Vitest 테스트, 커버리지 분석 |
| `verification-loop` | 검증 피드백 루프 |

## Sub-agents

| Agent | Model | Expertise |
|-------|-------|-----------|
| `web-ui-specialist` | inherit | React Web UI/UX (Tailwind CSS) |
| `backend-integration-specialist` | inherit | FastAPI, SQLAlchemy, LangGraph |
| `test-automation-specialist` | haiku | 테스트 자동화 |
| `eval-grader` | inherit | 평가 채점 (코드 검사 + LLM 루브릭) |
| `eval-task-runner` | inherit | 평가 실행 및 pass@k 계산 |

### Shared Frameworks (`shared/`)

- `quality-reference.md`: 공유 품질 게이트

## MCP Servers

### 활성화됨

| Server | Purpose |
|--------|---------|
| `context7` | 시맨틱 검색 |
| `tavily` | 웹 검색 (API 키 필요) |

---

**Skills**: 3 | **Agents**: 5 (+shared) | **Commands**: 7
