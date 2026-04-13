# CLAUDE.md

AOS (Agent Orchestration Service) - LangGraph 기반 멀티 에이전트 오케스트레이션 서비스.

## Quick Start

```bash
# 인프라 (Postgres, Redis, Qdrant)
cd infra/scripts && ./dev.sh

# Backend
cd src/backend && uv pip install -e . && uvicorn api.app:app --reload

# Dashboard
cd src/dashboard && npm install && npm run dev
```

Backend: `localhost:8000` | Dashboard: `localhost:5173` | 환경변수: @.env.example 참조

## Testing

```bash
# Backend
cd src/backend && pytest ../../tests/backend

# Dashboard (Vitest)
cd src/dashboard && npm test

# 전체 검증 (tsc + lint + test + build)
/check-health
```

## Common Pitfalls

- Docker 포트 충돌 시 `.env`의 `PG_PORT`, `REDIS_PORT` 등으로 오버라이드
- Vite proxy 설정(`vite.config.ts`)이 `/api` → `localhost:8000`으로 프록시함
- Zustand store 테스트 시 각 테스트마다 store 리셋 필요 (격리)
- SQLAlchemy async session은 반드시 `async with` 패턴 사용 (수동 close 금지)
- CORS 문제 발생 시 `.env`의 `CORS_ORIGINS` 확인
- `docker compose` 명령은 항상 `-f infra/docker/docker-compose.yml` 경로 명시

## Compact 시 보존할 컨텍스트

`/compact` 실행 시 반드시 보존:
1. 현재 작업 중인 파일 경로와 변경 의도
2. 실패한 검증 결과와 에러 메시지
3. `dev/active/` 아래 진행 중인 태스크 이름
4. 아직 커밋하지 않은 변경사항의 git diff 요약
5. 사용자와 합의한 설계 결정사항

## 상세 문서 (필요시 Read)

| 작업 유형 | 문서 |
|-----------|------|
| API 엔드포인트 추가/수정 | docs/api-reference.md (→ docs/api/ 도메인별 인덱스) |
| 백엔드 아키텍처 이해 | docs/architecture.md |
| 핵심 기능 구현/수정 | docs/features.md |
| Dashboard 컴포넌트 작업 | docs/dashboard.md |
| Agent/Task 개념 이해 | docs/ontology.md |
| Claude Code 통합 아키텍처 | docs/architecture/claude-code-integration.md |
| 문서 업데이트 규칙 | docs/doc-update-rules.md |

## 문서 관리 원칙

- **CLAUDE.md에 새 기능 설명 추가 금지** → `docs/`에 추가 후 위 테이블에 참조
- 기능 구현 후 `docs/` 관련 문서 업데이트 필수
- CLAUDE.md는 65줄 이하 유지 목표
