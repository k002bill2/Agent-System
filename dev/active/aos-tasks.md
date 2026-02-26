# AOS Tasks

**Last Updated**: 2026-02-26

---

## Completed

- [x] HITL 승인 시스템 구현
- [x] LLM 기반 태스크 분해 (PlannerNode)
- [x] 데이터베이스 지속성 (PostgreSQL)
- [x] 토큰/비용 모니터링
- [x] Self-Correction 노드
- [x] ParallelExecutorNode 구현
- [x] ParallelExecutorNode engine.py 연결 **← 2026-01-17**
- [x] Warp Terminal 연동 (3 tools)
- [x] ChatInput autocomplete 비활성화
- [x] 런타임 에러 수정 (async/JSON serialization)
- [x] 전체 기능 검증

---

## In Progress

(없음)

---

## Recently Completed (2026-02-26 #2 — 이론→실제 전환)

- [x] 프로젝트 시스템 종합 평가 (5개 영역 병렬 심층 조사)
- [x] ACE 원칙 → 서브에이전트 프롬프트 주입 구현
  - [x] `loadEthicalPrinciples()` — ace-framework.md Layer 1 파싱
  - [x] `injectCoordinationContext()` — `<ace-principles>` 태그 주입
- [x] Ethical Validator 강화 (16/16 패턴 테스트 통과)
  - [x] 신규: database, secrets, dangerous_commands 카테고리
  - [x] DELETE regex 개선 (세미콜론 무관, WHERE 허용)
  - [x] 차단 이벤트 → feedback-loop 학습 기록 연동
- [x] Feedback Loop 양방향 파이프라인
  - [x] task-allocator → analyzeAgentPerformance() 성능 데이터 참조
  - [x] 성공률 기반 점수 보정 (90%+ 보너스, 50%- 페널티)
- [x] 병렬 조율 시스템 강화
  - [x] parallel-state.json atomic write (Gemini 리뷰 반영)
  - [x] 충돌 감지 advisory → enforced (파일 레벨 차단)
  - [x] CLI 모드 추가: `status`, `clear`
  - [x] extractTargetFiles 경로 확장 + projectRoot 기준
- [x] settings.json 전체 7개 hook 등록 + local 동기화
- [x] agentTracer 성공 감지 개선 (오탐 방지)

---

## Recently Completed (2026-02-26 #1)

- [x] Coordination 유틸리티 실제 통합 (6 Phase)
  - [x] Phase 0: parallel-state.json 초기화 + releaseByAgent + atomic write
  - [x] Phase 1: parallelCoordinator.js 파일 락/stale 정리/completedAgents
  - [x] Phase 2: agentTracer.js feedback-loop 연동 + completion 이벤트
  - [x] Phase 3: stopEvent.js checkpoint + feedback 요약
  - [x] Phase 4: userPromptSubmit.js task-allocator 위임 + resume 체크포인트
  - [x] Phase 5: task-allocator.js 에이전트 확장 + 가용성 구현

---

## Recently Completed (2026-01-17)

- [x] E2E 통합 테스트 (25/25 테스트 통과)
  - API 엔드포인트 테스트 (7개)
  - OrchestrationEngine 테스트 (7개)
  - HITL 플로우 테스트 (6개)
  - 병렬 실행 테스트 (5개)
- [x] 대시보드에서 실제 태스크 실행 테스트 (API 통합 완료)
- [x] 병렬 실행 E2E 검증 (asyncio.gather + Semaphore)
- [x] HITL 플로우 E2E 테스트 (승인/거부 API 검증)

---

## Backlog

### High Priority
- [ ] Eval R5 실행 — ACE 원칙 주입 효과 측정
- [ ] Specialist Agent 복구 시도 — XML 태그 문제 재검증
- [ ] Edit/Write Hook 검토 — ethicalValidator 연결 트레이드오프

### Medium Priority
- [ ] Feedback Loop → 백엔드 DB 브릿지
- [ ] 에러 핸들링 개선
- [ ] 로깅 시스템 강화
- [ ] 성능 모니터링 대시보드

### Low Priority
- [ ] 문서화 보완
- [ ] 단위 테스트 커버리지 확대

---

## Notes

- Python 3.14 + Pydantic V1 경고는 무시 가능
- 서버 실행: `USE_DATABASE=true uvicorn api.app:app --reload`
