# AGS Tasks

**Last Updated**: 2026-01-17

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

### Medium Priority
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
