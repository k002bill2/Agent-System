# Claude Code Configuration

Claude Code configuration for AOS (Agent Orchestration Service) Dashboard.

## Directory Structure

```
.claude/
├── skills/           # 5개 AI 스킬
├── agents/           # 5개 서브 에이전트
│   └── shared/       # 공유 프레임워크 (Quality Gates 등)
├── commands/         # 5개 슬래시 명령어
├── hooks/            # 훅 스크립트 (ethicalValidator + verificationGuard + agentLearnings)
├── evals/            # 평가 시스템 (10 tasks, 4 rubrics)
├── hooks.json        # 훅 설정 (5개: security + path protection + verification + learnings + notification)
├── settings.json     # 로컬 설정
└── mcp.json          # MCP 서버 설정
```

## Commands

### 검증 및 품질

| Command | Purpose |
|---------|---------|
| `/check-health` | 타입체크, 린트, 테스트, 빌드 종합 검증 |
| `/test-coverage` | 테스트 커버리지 분석 |

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
| `verification-loop` | 검증 피드백 루프 (verify-app 병합) |
| `run-eval` | AI 에이전트 평가 및 pass@k 지표 계산 |
| `ace-framework` | 4-Pillar 거버넌스 모델 (참조 문서) |

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
| `context7` | 시맨틱 검색 (글로벌 설정) |
| `tavily` | 웹 검색 (글로벌 설정, API 키 필요) |

---

**Skills**: 5 | **Agents**: 5 (+shared) | **Commands**: 5
