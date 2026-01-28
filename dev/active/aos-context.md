# AOS (Agent Orchestration System) Context

**Last Updated**: 2026-01-17 (Session End)
**Status**: Active Development

---

## Current State

### Completed Features (PRD/TRD 기준)
| Feature | Status | Notes |
|---------|--------|-------|
| HITL 승인 시스템 | ✅ | `ApprovalModal`, WebSocket 연동 완료 |
| LLM 기반 태스크 분해 | ✅ | `PlannerNode` 구조화된 출력 |
| 데이터베이스 지속성 | ✅ | PostgreSQL + SQLAlchemy async |
| 토큰/비용 모니터링 | ✅ | `CostMonitor`, `TokenUpdatePayload` |
| Self-Correction | ✅ | `SelfCorrectionNode`, max 3 retries |
| Parallel Execution | ✅ | `ParallelExecutorNode` 연결 완료 |

### Session Summary (2026-01-17)

#### 완료 작업
1. **ParallelExecutorNode 연결 수정**
   - `engine.py`에서 누락된 초기화 코드 추가
   - `create_orchestrator_graph()`에 `parallel_executor_node` 전달
   - 최대 3개 동시 실행 설정

2. **전체 기능 검증**
   - Orchestrator: 5개 노드 완전 구현
   - Parallel Agents: 연결 완료
   - Sub-agents: 11개, Hooks: 8개, Skills: 13개, Commands: 12개
   - ACE Framework: Layer 1-5 완전 구현

3. **이전 세션 작업** (컨텍스트 복원)
   - 서버 연결 이슈 해결 (SQLAlchemy 설치)
   - DB 모드 활성화 (`USE_DATABASE=true`)
   - Warp Terminal 연동 (3개 tools 추가)
   - ChatInput autocomplete 비활성화
   - 런타임 에러 수정 (async, JSON serialization)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    OrchestrationEngine                       │
├─────────────────────────────────────────────────────────────┤
│  OrchestratorNode → route → PlannerNode                     │
│                   ↓                                          │
│             ExecutorNode ←→ ParallelExecutorNode            │
│                   ↓                                          │
│             ReviewerNode                                     │
│                   ↓                                          │
│         SelfCorrectionNode (on failure, max 3 retries)      │
└─────────────────────────────────────────────────────────────┘
```

### Key Files
| File | Purpose |
|------|---------|
| `orchestrator/engine.py` | 메인 엔진, 노드 초기화 |
| `orchestrator/nodes.py` | 5개 코어 노드 정의 |
| `orchestrator/graph.py` | LangGraph 그래프 구성 |
| `orchestrator/parallel_executor.py` | 병렬 실행 노드 |
| `api/websocket.py` | WebSocket 스트리밍 |
| `db/repository.py` | Repository 패턴 + 직렬화 |

---

## Environment

```bash
# Required
USE_DATABASE=true
LLM_PROVIDER=ollama  # or "anthropic"
OLLAMA_MODEL=qwen2.5:7b

# Database
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/agent_orchestrator
```

---

## Next Session Priority

1. **E2E 테스트** - 대시보드에서 실제 태스크 실행 테스트
2. **병렬 실행 검증** - 복수 서브태스크가 동시 실행되는지 확인
3. **HITL 플로우 테스트** - 위험 작업 승인/거부 플로우

---

## Known Issues

- Python 3.14 + Pydantic V1 호환성 경고 (기능에 영향 없음)
- Sandbox 모드에서 서버 백그라운드 실행 제한

---

## References

- PRD: `/docs/prd/aos-prd.md`
- TRD: `/docs/trd/aos-trd.md`
- Plan: `~/.claude/plans/zesty-napping-parrot.md`
