# Feature Input (DRY-RUN / Proposal Mode)

## Feature
LLM 라우터에 provider별 응답 지연 시간(latency) 표시 — 백엔드 측정/노출 + 대시보드 표시

## Mode
DRY-RUN: src/ 파일 수정 금지. 각 에이전트는 "제안 diff/설계"만 _workspace/에 작성.

## Constraint (중요)
- 영향 파일(llm_router.py, llm_models.py, llm_service.py, api/llm.py)이 모두 무관한 WIP로 더티 상태.
- 따라서 절대 src/를 수정하지 말 것. 현재(더티) 상태를 Read로 반영하되, 제안서만 산출.
