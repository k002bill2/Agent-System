# Implementation Plan: LLM 라우터 Provider별 응답 지연(Latency) 표시 (DRY-RUN)

> planner 산출물. orchestrator가 저장 (planner는 read-only).

## ⚠️ 타깃 정정 (load-bearing)
작업 지시가 가리킨 `api/llm.py`의 `GET /providers`(line 209)는 **모델 레지스트리 표면이며 이 UI와 무관**. 실제 `LLMRouterSettings.tsx`가 소비하는 것은 하이픈 들어간 `GET /api/llm-router/providers` — 서빙: `src/backend/api/llm_router.py` + `src/backend/services/llm_router_service.py`. 계약을 `LLMProviderConfig`(`models/llm_router.py`) + `/api/llm-router/providers`에 고정.

## 측정 인프라 (이미 존재 → expose-and-render 범위)
`services/llm_router_service.py:32`의 `_latency_tracker`(provider_id → 최근 100개 지연 리스트)와 `record_request_result()`가 이미 provider별 지연 누적. 단 `record_request_result`는 `POST /api/llm-router/record`로만 호출되고 `LLMService.invoke()` 경로엔 자동 기록 훅 없음 → 데이터 들어오기 전엔 화면에 `—`. 자동 배선은 **범위 외(후속)**.

## ⚠️ LOAD-BEARING API 계약 (backend ∥ frontend ∥ integration-qa)
| 항목 | 확정값 |
|------|--------|
| 측정 지점 | 신규 측정 없음. 기존 `_latency_tracker[provider_id]: list[float]` 재사용 |
| 집계 | `last_latency_ms` = 리스트 마지막값(최근). `avg_latency_ms` = 산술평균(최근 100 윈도우). 데이터 없으면 둘 다 `None` |
| 노출 | 기존 `GET /api/llm-router/providers` 응답 확장 (신규 엔드포인트 ✗) |
| 응답 필드(snake_case) | `last_latency_ms: int \| None`, `avg_latency_ms: float \| None` |
| 응답 모델 | `LLMProviderConfig` (Pydantic), `list[...]` 직렬화 |
| 프론트 TS 필드 | `last_latency_ms: number \| null`, `avg_latency_ms: number \| null` (interface `LLMProvider`) |
| 영속성 | 인메모리, 프로세스 한정 (기존 `_stats`/`_latency_tracker`와 동일) |

> **integration-qa 체크포인트:** provider별 평균은 반드시 `avg_latency_ms`. stats 전역 평균 `average_latency_ms`와 혼동 금지 (접두사·단복수 정확히 구분).

## Steps
### Backend (backend-integration-specialist)
1. `models/llm_router.py` `LLMProviderConfig`에 `last_latency_ms: int|None=None`, `avg_latency_ms: float|None=None` 추가 (additive).
2. `services/llm_router_service.py`: `_latency_for(provider_id) -> tuple[int|None,float|None]` 헬퍼(빈 리스트 안전). `list_providers()`/`get_provider()`가 반환 전 각 provider에 주입. **Immutability**: `model_copy(update=...)`로 사본 반환(원본 `_providers` 오염·마스킹 충돌 방지).
3. (조사·문서화만) `record_request_result` 자동 배선 부재 한계 명시. 범위 외.

### Frontend (web-ui-specialist)
4. `LLMRouterSettings.tsx` `interface LLMProvider`에 `last_latency_ms: number|null`, `avg_latency_ms: number|null` (백엔드와 동일 snake_case 키).
5. 확장 패널 그리드(Timeout/Retries/Cost/Failures, line ~451)에 latency 행 추가. `Clock` 아이콘 재사용. "Last/Avg: `{last ?? '—'}ms / {avg?.toFixed(0) ?? '—'}ms`". `null`→`—`. 다크모드 무손상.

## 부차 발견 (범위 외 — integration-qa 플래그)
`api/llm_router.py:47`이 `provider.name`을 참조하나 `LLMProviderConfig`에 `name` 필드 없음 — 더티 WIP의 잠재 버그. 무수정.

## Success Criteria
- [ ] `/api/llm-router/providers` 각 provider에 `last_latency_ms`/`avg_latency_ms`(snake_case)
- [ ] 데이터 없으면 `null`, 기록되면 실제 값
- [ ] 프론트 `LLMProvider` 키 1:1 일치, tsc 통과
- [ ] 확장 패널 Last/Avg 표시(없으면 `—`), 다크모드 무손상
- [ ] `avg_latency_ms`(provider) vs `average_latency_ms`(stats 전역) 구분
- [ ] pytest+Vitest 신규 통과, 기존 무회귀
- [ ] 변경 범위: `models/llm_router.py`, `services/llm_router_service.py`, `LLMRouterSettings.tsx`만 (`api/llm.py`·더티 WIP 무수정)
