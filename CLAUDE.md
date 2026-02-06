# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**Agent Orchestration Service (AOS)** - LangGraph 기반 멀티 에이전트 오케스트레이션 서비스.
Claude Code 설정과 실제 시스템 소스 코드를 함께 관리하는 하이브리드 모노레포.

## Directory Structure

```
Agent System/
├── .claude/              # Claude Code 설정 (skills, agents, commands, hooks)
├── src/
│   ├── backend/          # Python (LangGraph + FastAPI)
│   │   ├── agents/       # 에이전트 정의 (base, specialists, lead_orchestrator)
│   │   ├── orchestrator/ # 오케스트레이션 (engine, graph, nodes, parallel)
│   │   ├── services/     # 비즈니스 로직 (auth, mcp, rag, feedback 등)
│   │   ├── api/          # FastAPI 라우터
│   │   ├── db/           # SQLAlchemy ORM
│   │   └── models/       # 데이터 모델
│   └── dashboard/        # React 대시보드 (Vite + Tailwind + Zustand)
├── infra/                # Docker, 스크립트
├── docs/                 # PRD, TRD, 아키텍처 문서
└── tests/                # Backend/Dashboard 테스트
```

## Tech Stack

| Layer | Stack |
|-------|-------|
| Backend | LangGraph 0.2+, FastAPI 0.115+, SQLAlchemy 2.0+, PostgreSQL, Redis, ChromaDB |
| Frontend | React 18.3, Zustand 5.0, Tailwind CSS 3.4, Vite 6.0+, TypeScript 5.6+ |
| LLM | Google Gemini (기본), Anthropic Claude, Ollama |

## Quick Start

```bash
# 1. 인프라
cd infra/scripts && ./dev.sh

# 2. Backend
cd src/backend && uv pip install -e . && uvicorn api.app:app --reload

# 3. Dashboard
cd src/dashboard && npm install && npm run dev
```

**URLs**: Backend `localhost:8000`, Dashboard `localhost:5173`

## Commands

| 명령어 | 설명 |
|--------|------|
| `/check-health` | 타입체크, 린트, 테스트, 빌드 종합 검증 |
| `/verify-app` | Boris Cherny 스타일 검증 루프 |
| `/test-coverage` | 테스트 커버리지 분석 |
| `/commit-push-pr` | Git 워크플로우 자동화 |
| `/save-and-compact` | 컨텍스트 저장 후 /compact |
| `/resume` | 이전 세션 컨텍스트 복원 |

## Code Patterns

**Backend** (Python):
```python
class MyAgent(BaseAgent):
    async def execute(self, task: str, context: dict) -> AgentResult:
        return AgentResult(success=True, output=await self._invoke_llm(task, context))
```

**Frontend** (React/TypeScript):
```tsx
export const useStore = create<State>((set) => ({
  data: null,
  fetchData: async () => { /* ... */ },
}))
```

**경로 별칭**: Backend `from ..models import ...` / Dashboard `@/components/...`

## Environment Variables

```bash
# LLM
LLM_PROVIDER=google  # google, anthropic, ollama
GOOGLE_API_KEY=...
ANTHROPIC_API_KEY=...

# Database
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/agent_orchestrator
USE_DATABASE=false

# Auth
SESSION_SECRET_KEY=...
GOOGLE_CLIENT_ID=...   # OAuth (선택)
GITHUB_CLIENT_ID=...   # OAuth (선택)

# URLs
FRONTEND_URL=http://localhost:5173
```

## Testing

```bash
# Backend
cd src/backend && pytest ../../tests/backend

# Dashboard
cd src/dashboard && npm test
```

## Key Features

- **LangGraph Nodes**: Orchestrator, Planner, Executor, ParallelExecutor, Reviewer, SelfCorrection
- **HITL 승인**: 위험 작업 전 사용자 승인 요청
- **RAG**: ChromaDB 기반 의미론적 검색
- **MCP**: 외부 도구 연동 (filesystem, github, playwright)
- **Agent Registry**: 에이전트 등록/검색/선택
- **인증**: OAuth (Google/GitHub) + Email/Password
- **Git 협업**: 브랜치 관리, MR 시스템, 충돌 감지, GitHub PR 통합

## Agents

**Claude Code Sub-agents** (`.claude/agents/`):
- `web-ui-specialist`: React Web UI/UX
- `backend-integration-specialist`: Firebase, API 통합
- `test-automation-specialist`: Vitest 테스트
- `lead-orchestrator`: 멀티 에이전트 조정
- `performance-optimizer`: 성능 최적화
- `quality-validator`: 품질 검증

**Shared Frameworks** (`.claude/agents/shared/`):
- `ace-framework.md`: 병렬 실행 프로토콜
- `quality-gates.md`: 품질 게이트
- `effort-scaling.md`: 리소스 할당

## Dev Docs System

대규모 작업 컨텍스트 유지를 위한 3-파일 시스템:

```
dev/active/[task-name]/
├── [task-name]-plan.md     # 승인된 계획
├── [task-name]-context.md  # 핵심 결정사항
└── [task-name]-tasks.md    # 체크리스트
```

**워크플로우**: `/dev-docs` → 구현 → `/update-dev-docs` → `/compact`

---

## 문서 관리 원칙

**CLAUDE.md는 슬림하게 유지** (200줄 이하 목표):
- 새 기능 추가 시 CLAUDE.md 확장 금지
- 상세 내용은 `docs/` 문서에 추가 후 참조
- CLAUDE.md에는 핵심 개요만 유지

**문서 자동 업데이트 규칙** (기능 구현 완료 후 필수):

| 변경 내용 | 업데이트 문서 | 업데이트 항목 |
|-----------|--------------|---------------|
| 새 API 엔드포인트 | `docs/api-reference.md` | 엔드포인트 테이블 추가 |
| 새 기능/서비스 | `docs/features.md` | 번호 매긴 새 섹션 추가 |
| 새 페이지 | `docs/dashboard.md` | Pages 테이블에 추가 |
| 새 컴포넌트 | `docs/dashboard.md` | Components 섹션에 추가 |
| 새 Store | `docs/dashboard.md` | Zustand Stores 테이블 추가 |
| 새 디렉토리 | `docs/dashboard.md` | Directory Structure 업데이트 |

**자동화 체크리스트** (구현 완료 시):
1. ✅ Backend: models, services, api 파일 작성
2. ✅ Frontend: store, components, page 파일 작성
3. ✅ Tests: 테스트 파일 작성
4. ⚠️ **Docs: 위 테이블 기준으로 문서 업데이트** ← 필수!

## Coding Guidelines

- **배포 전 검증**: 배포 전 반드시 `tsc --noEmit` + `pytest --tb=short` 실행 후 에러 0 확인
- **타입 안전성**: TypeScript/Python 모두 타입 힌트 일관 사용, 편집 후 타입 체크 실행
- **디버깅 규칙**: 같은 수정을 2회 시도 후 실패하면 멈추고, 근본 원인 분석 후 다른 접근 제안 (같은 전략 3회 재시도 금지)
- **분석 요청 대응**: 값을 요약하지 말고 분석과 구체적 개선 제안을 제공
- **DB 디버깅**: asyncpg/PostgreSQL 이슈 시 prepared statement 캐시 충돌 우선 확인

## 상세 문서 (필요시 Read)

| 작업 유형 | 문서 |
|-----------|------|
| API 엔드포인트 추가/수정 | `docs/api-reference.md` |
| 백엔드 아키텍처 이해 | `docs/architecture.md` |
| 핵심 기능 구현/수정 | `docs/features.md` |
| Dashboard 컴포넌트 작업 | `docs/dashboard.md` |
| Agent/Task 개념 이해 | `docs/ontology.md` |
