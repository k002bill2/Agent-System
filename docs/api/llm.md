# API Reference - LLM

LLM 모델 레지스트리, 라우터, 자격증명, 프록시, Playground API입니다.

## Base URL
- Development: `http://localhost:8000`

---

## LLM Models (Central Registry)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/llm/models` | 전체 모델 목록 |
| GET | `/api/llm/models?provider=xxx` | Provider별 필터링 |
| GET | `/api/llm/models?available_only=true` | 사용 가능한 모델만 |
| GET | `/api/llm/models/default` | 기본 모델 조회 |
| GET | `/api/llm/models/{model_id}` | 특정 모델 상세 |
| PATCH | `/api/llm/models/{model_id}` | 모델 설정 수정 |
| GET | `/api/llm/providers` | 지원 프로바이더 목록 |

**응답 형식** (GET /api/llm/models):
```json
{
  "models": [
    {
      "id": "claude-sonnet-4-6",
      "display_name": "Claude Sonnet 4.6",
      "provider": "anthropic",
      "context_window": 200000,
      "pricing": {"input": 0.003, "output": 0.015},
      "available": true,
      "is_default": true,
      "supports_tools": true,
      "supports_vision": true
    }
  ],
  "total": 14
}
```

**프로바이더**: `anthropic`, `google`, `openai`, `ollama`

> **Note**: 이 API는 중앙 레지스트리(`models/llm_models.py`)에서 모델 정보를 제공합니다.
> 새 모델 추가 시 해당 파일만 수정하면 전체 시스템에 반영됩니다.

---

## LLM Router

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/llm-router/providers` | LLM 프로바이더 목록 |
| POST | `/api/llm-router/providers` | 프로바이더 등록 |
| GET | `/api/llm-router/providers/{id}` | 프로바이더 상세 |
| PATCH | `/api/llm-router/providers/{id}` | 프로바이더 업데이트 |
| DELETE | `/api/llm-router/providers/{id}` | 프로바이더 삭제 |
| POST | `/api/llm-router/providers/{id}/toggle` | 활성화 토글 |
| GET | `/api/llm-router/health` | 전체 헬스체크 |
| GET | `/api/llm-router/health/{id}` | 프로바이더별 헬스체크 |
| GET | `/api/llm-router/select` | 최적 프로바이더 선택 |
| POST | `/api/llm-router/record` | 요청 결과 기록 |
| GET | `/api/llm-router/config` | 라우터 설정 조회 |
| PATCH | `/api/llm-router/config` | 라우터 설정 업데이트 |
| GET | `/api/llm-router/state` | 라우터 상태 |
| GET | `/api/llm-router/stats` | 라우팅 통계 |
| POST | `/api/llm-router/initialize` | 환경변수에서 초기화 |

**라우팅 전략**: `priority`, `round_robin`, `least_cost`, `least_latency`, `fallback_chain`

---

## LLM Credentials

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/users/me/llm-credentials` | LLM 자격증명 목록 조회 |
| POST | `/api/users/me/llm-credentials` | LLM 자격증명 추가 |
| PUT | `/api/users/me/llm-credentials/{id}` | LLM 자격증명 수정 |
| DELETE | `/api/users/me/llm-credentials/{id}` | LLM 자격증명 삭제 |
| POST | `/api/users/me/llm-credentials/{id}/verify` | 자격증명 연결 검증 |

---

## LLM Proxy

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/proxy/chat/completions` | LLM 채팅 완료 프록시 (OpenAI 호환) |

---

## Playground

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/playground/sessions` | 플레이그라운드 세션 목록 |
| POST | `/api/playground/sessions` | 세션 생성 |
| GET | `/api/playground/sessions/{id}` | 세션 상세 조회 |
| DELETE | `/api/playground/sessions/{id}` | 세션 삭제 |

---

## Playground Extended

| Method | Path | 설명 |
|--------|------|------|
| PATCH | `/api/playground/sessions/{id}/settings` | 세션 설정 변경 |
| POST | `/api/playground/sessions/{id}/clear` | 대화 이력 초기화 |
| POST | `/api/playground/sessions/{id}/execute/stream` | 스트리밍 실행 |
| GET | `/api/playground/sessions/{id}/history` | 대화 이력 조회 |
| GET | `/api/playground/tools` | 사용 가능 도구 목록 |
| POST | `/api/playground/tools/test` | 도구 테스트 실행 |
| POST | `/api/playground/compare` | 에이전트 비교 실행 |
| GET | `/api/playground/models` | 사용 가능 모델 목록 |
