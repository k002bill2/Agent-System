# CLAUDE.md

**Agent Orchestration Service (AOS)** — LangGraph 기반 멀티 에이전트 오케스트레이션 서비스.
Claude Code 설정 + 시스템 소스 코드를 함께 관리하는 하이브리드 모노레포.

## Quick Start

```bash
# 인프라 (PostgreSQL, Redis, Qdrant)
cd infra/scripts && ./dev.sh

# Backend
cd src/backend && uv pip install -e . && uvicorn api.app:app --reload

# Dashboard
cd src/dashboard && npm install && npm run dev
```

**URLs**: Backend `localhost:8000`, Dashboard `localhost:5173`

## Testing

```bash
# Backend
cd src/backend && pytest ../../tests/backend

# Dashboard
cd src/dashboard && npm test
```

## Verification (커밋 전 필수)

```bash
# Frontend
cd src/dashboard && npx tsc --noEmit && npm run lint && npm test && npm run build

# Backend
cd src/backend && ruff check . && pytest ../../tests/backend
```

## Environment

환경변수: `.env.example` 참조. `cp .env.example .env` 후 값 입력.

## 상세 문서 (필요시 Read)

| 작업 유형 | 문서 |
|-----------|------|
| API 엔드포인트 | `docs/api-reference.md` |
| 백엔드 아키텍처 | `docs/architecture.md` |
| 핵심 기능 | `docs/features.md` |
| Dashboard 컴포넌트 | `docs/dashboard.md` |
| Agent/Task 개념 | `docs/ontology.md` |
| Claude Code 통합 | `docs/architecture/claude-code-integration.md` |
| 문서 업데이트 규칙 | `docs/doc-update-rules.md` |
