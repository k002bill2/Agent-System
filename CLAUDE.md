# CLAUDE.md

## Project Overview

**Agent Orchestration Service (AOS)** - LangGraph 기반 멀티 에이전트 오케스트레이션 서비스.
Claude Code 설정과 실제 시스템 소스 코드를 함께 관리하는 하이브리드 모노레포.

## Directory Structure

```
Agent System/
├── .claude/       # Claude Code 설정 (skills, agents, commands, hooks)
├── src/backend/   # Python (LangGraph + FastAPI)
├── src/dashboard/ # React 대시보드 (Vite + Tailwind + Zustand)
├── infra/         # Docker, 스크립트
├── docs/          # 아키텍처, API, 기능 문서
└── tests/         # Backend/Dashboard 테스트
```

## Quick Start

```bash
# 전체 시작 (인프라 + Backend + Dashboard)
./infra/scripts/start-all.sh

# 또는 개별 시작
cd src/backend && uv pip install -e . && uvicorn api.app:app --reload
cd src/dashboard && npm install && npm run dev
```

**URLs**: Backend `localhost:8000`, Dashboard `localhost:5173`

## Rules

프로젝트 규칙은 `.claude/rules/`에서 자동 로드:
- `aos-backend.md`, `aos-frontend.md`, `aos-workflow.md`

Commands: `.claude/commands/` | Skills: `.claude/skills/`

## Multi-Agent Orchestration

| 복잡도 | 에이전트 수 | 기준 |
|--------|------------|------|
| Trivial | 0 | 단일 파일, 명확한 수정 |
| Simple | 1 | 2-3 파일, 한 영역 |
| Moderate | 2-3 | UI+API 또는 크로스 영역 |
| Complex | 3+ | 풀스택, 아키텍처 변경 |

품질 기준: `.claude/agents/shared/quality-reference.md`

## 상세 문서 (필요시 Read)

CLAUDE.md는 60줄 이하 유지. 기능 구현 후 `docs/` 문서 업데이트 필수.

| 작업 유형 | 문서 |
|-----------|------|
| API/백엔드 | `docs/api-reference.md`, `docs/architecture.md` |
| 기능/Dashboard | `docs/features.md`, `docs/dashboard.md` |
| 환경변수/배포 | `docs/deployment.md` |
