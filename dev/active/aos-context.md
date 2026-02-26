# AOS (Agent Orchestration System) Context

**Last Updated**: 2026-02-26 (Session End)
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
| Coordination 유틸리티 통합 | ✅ | 4개 유틸리티 → 훅 시스템 실제 연동 |
| RAG (Qdrant) | ✅ | ChromaDB → Qdrant, deterministic UUID |
| ACE 원칙 런타임 주입 | ✅ | 서브에이전트 프롬프트에 `<ace-principles>` 자동 주입 |
| Ethical Validator 강화 | ✅ | 6카테고리 16패턴, 실제 차단 확인 (14/14 → 16/16) |
| Feedback Loop 양방향 | ✅ | 쓰기 전용 → task-allocator 성능 데이터 참조 |

### Session Summary (2026-02-26 #2 — 이론→실제 전환)

#### 완료 작업
1. **프로젝트 시스템 종합 평가** — 5개 영역 병렬 심층 조사
   - ACE Framework ~40%, 서브에이전트 ~30%, Hooks ~75%, Skills ~10%, 병렬조율 ~30% 실제 동작 확인
   - 핵심 발견: ACE 원칙이 서브에이전트에 읽히는 경로 없음, feedback-loop 쓰기 전용, settings.json 비어있음

2. **ACE 원칙 → 서브에이전트 프롬프트 주입 구현**
   - `loadEthicalPrinciples()`: ace-framework.md Layer 1 파싱
   - `injectCoordinationContext()`: `<ace-principles>` 태그로 서브에이전트에 주입
   - 3대 원칙 + 5대 제약 + 의사결정 프레임워크 포함

3. **Ethical Validator 대폭 강화**
   - 신규 카테고리: database (DROP/TRUNCATE/DELETE), secrets (AWS/GitHub/Private Key), dangerous_commands
   - DELETE regex 개선: 세미콜론 없이도 차단, WHERE 있으면 허용
   - 차단 시 feedback-loop.recordLearningEvent() 자동 기록
   - 실제 차단 확인: `rm -rf /` → Hook이 Bash 실행 차단

4. **Feedback Loop 양방향 파이프라인**
   - task-allocator.recommendAgent() → analyzeAgentPerformance() 참조 (성능 기반 추천)
   - 성공률 90%+ → 보너스, 50%- → 페널티

5. **병렬 조율 강화**
   - parallel-state.json atomic write (Gemini 리뷰 반영)
   - 충돌 감지 advisory → enforced (파일 레벨 차단)
   - CLI 모드 추가: `status`, `clear`
   - extractTargetFiles 경로 확장 + projectRoot 기준

6. **Hook/Settings 정비**
   - settings.json에 7개 hook 등록 (이전 비어있음)
   - settings.json ↔ settings.local.json 동기화 완료

### Session Summary (2026-02-26 #1)

#### 완료 작업
1. **Coordination 유틸리티 실제 통합** (6 Phase)
   - Phase 0: `parallel-state.json` 1829줄 stale 데이터 초기화 + `file-lock-manager.js`에 `releaseByAgent()` + atomic write
   - Phase 1: `parallelCoordinator.js` — 파일 락 통합, stale 정리(10분), completedAgents 이력, 에이전트 가용성 체크, ACE 원칙 주입
   - Phase 2: `agentTracer.js` — feedback-loop 연동, spawn/completion 이벤트 분리, 성공 판정 개선(오탐 방지)
   - Phase 3: `stopEvent.js` — checkpoint-manager 연동(세션 체크포인트), feedback 요약 출력
   - Phase 4: `userPromptSubmit.js` — task-allocator 위임(하드코딩 제거), `/resume` 체크포인트 컨텍스트 주입
   - Phase 5: `task-allocator.js` — 10개 에이전트로 확장, 키워드 강화, 가용성 실제 구현, 성능 데이터 반영 추천

2. **Gemini 크로스 리뷰 반영** (자동 적용)
   - `extractTargetFiles()` CWD 독립적 경로 resolve
   - 충돌 감지 advisory → enforced (파일 레벨 차단)
   - 성공 판정 로직 개선 (false positive 방지)

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
DATABASE_URL=postgresql+asyncpg://aos:aos@localhost:5432/aos
```

---

## Next Session Priority

1. **Eval R5 실행** — ACE 원칙 주입 상태에서 서브에이전트 성공률 변화 측정
2. **Edit/Write Hook 검토** — ethicalValidator를 Edit/Write에 연결할지 성능 트레이드오프 평가
3. **Specialist Agent 복구 시도** — general-purpose 외 전문 에이전트 XML 태그 문제 재검증
4. **Feedback Loop 대시보드 연동** — CLI metrics를 백엔드 DB로 브릿지

---

## Known Issues

- Python 3.14 + Pydantic V1 호환성 경고 (기능에 영향 없음)
- Sandbox 모드에서 서버 백그라운드 실행 제한

---

## References

- PRD: `/docs/prd/aos-prd.md`
- TRD: `/docs/trd/aos-trd.md`
- Plan: `~/.claude/plans/zesty-napping-parrot.md`
