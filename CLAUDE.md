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
| Backend | LangGraph 0.2+, FastAPI 0.115+, SQLAlchemy 2.0+, PostgreSQL, Redis, Qdrant |
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
| `/verify-app` | Boris Cherny 스타일 종합 검증 루프 |
| `/test-coverage` | 테스트 커버리지 분석 및 미흡 영역 식별 |
| `/auto` | E2E 자동화 파이프라인 (feature/bugfix/refactor 자동 감지) |
| `/start-all` | 전체 서비스 시작 (인프라 + Backend + Dashboard) |
| `/stop-all` | 전체 서비스 중지 |
| `/run-eval` | AI 에이전트 평가 태스크 실행 및 pass@k 지표 계산 |
| `/gemini-review` | Gemini CLI로 코드 변경사항 크로스 리뷰 |

전체 명령어 목록은 `.claude/commands/` 디렉토리 참조. `/sync-registry`로 레지스트리 동기화.

## Rules

프로젝트 규칙은 `.claude/rules/`에서 자동 로드됩니다:
- `aos-backend.md` - FastAPI, SQLAlchemy, LangGraph 패턴
- `aos-frontend.md` - React, Tailwind, Zustand 패턴
- `aos-workflow.md` - 스킬 라우팅, 검증 체크리스트

글로벌 규칙 (`~/.claude/rules/`):
- `golden-principles.md` - 코드 원칙 (DRY, KISS, YAGNI)
- `security.md` - 보안 규칙
- `verification.md` - 검증 규칙
- `interaction.md` - 소통 규칙

## Environment Variables

```bash
# LLM
LLM_PROVIDER=google  # google, anthropic, ollama
GOOGLE_API_KEY=...
ANTHROPIC_API_KEY=...

# Database
DATABASE_URL=postgresql+asyncpg://aos:aos@localhost:5432/aos
USE_DATABASE=true

# Auth
SESSION_SECRET_KEY=...
GOOGLE_CLIENT_ID=...   # OAuth (선택)
GITHUB_CLIENT_ID=...   # OAuth (선택)

# URLs
FRONTEND_URL=http://localhost:5173

# Claude Code Usage (배포 시 설정, 로컬은 자동)
# CLAUDE_OAUTH_TOKEN=...         # non-macOS 필수
# CLAUDE_STATS_CACHE_PATH=...    # default: ~/.claude/stats-cache.json
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
- **RAG**: Qdrant 기반 의미론적 검색
- **MCP**: 외부 도구 연동 (filesystem, github, playwright)
- **Agent Registry**: 에이전트 등록/검색/선택
- **인증**: OAuth (Google/GitHub) + Email/Password
- **Git 협업**: 브랜치 관리, MR 시스템, 충돌 감지, GitHub PR 통합

## Multi-Agent Orchestration

메인 에이전트(Opus)가 직접 Task 도구로 서브에이전트를 스폰합니다.

| 복잡도 | 에이전트 수 | 기준 |
|--------|------------|------|
| Trivial | 0 | 단일 파일, 명확한 수정 |
| Simple | 1 | 2-3 파일, 한 영역 |
| Moderate | 2-3 | UI+API 또는 크로스 영역 |
| Complex | 3+ | 풀스택, 아키텍처 변경 |

**에이전트**: aos-orchestrator(opus), web-ui-specialist(inherit), backend-integration-specialist(inherit),
test-automation-specialist(haiku), performance-optimizer(haiku), quality-validator(haiku)
**평가**: eval-task-runner(inherit), eval-grader(inherit)
**품질 기준**: `.claude/agents/shared/quality-reference.md`

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

**문서 업데이트**: 기능 구현 후 `docs/` 관련 문서 업데이트 필수 (상세: `docs/doc-update-rules.md` 참조)

## 상세 문서 (필요시 Read)

| 작업 유형 | 문서 |
|-----------|------|
| API 엔드포인트 추가/수정 | `docs/api-reference.md` |
| 백엔드 아키텍처 이해 | `docs/architecture.md` |
| 핵심 기능 구현/수정 | `docs/features.md` |
| Dashboard 컴포넌트 작업 | `docs/dashboard.md` |
| Agent/Task 개념 이해 | `docs/ontology.md` |
| Claude Code 통합 아키텍처 | `docs/architecture/claude-code-integration.md` |
