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
      "id": "claude-sonnet-5",
      "display_name": "Claude Sonnet 5",
      "provider": "anthropic",
      "context_window": 1000000,
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

**프로바이더**: `codex_cli`, `claude_cli`, `anthropic`, `google`, `openai`, `ollama`

> **Note**: 이 API는 중앙 레지스트리(`models/llm_models.py`)에서 모델 정보를 제공합니다.
> 새 모델 추가 시 해당 파일만 수정하면 전체 시스템에 반영됩니다.
>
> **`is_default` 마이그레이션 주의** (`USE_DATABASE=true` 배포): `sync_to_db`는
> 이미 해당 provider의 default 행이 DB에 있으면, `_MODELS`에서 `is_default=True`로
> 추가된 신규 모델을 `is_default=False`로 INSERT합니다(이중 default 방지). 즉 신규
> 기본 모델 이관은 기존 배포에 자동 반영되지 않으며, admin이 Settings UI에서 직접
> default를 전환해야 합니다. 인메모리 폴백(`USE_DATABASE` 미설정)에서는 `_MODELS`의
> `is_default`가 그대로 적용됩니다.

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

이 API는 CLI 구독권을 사용할 수 없는 fallback/compatibility 경로의 API key 관리용입니다. 기본 LLM 실행 권한은 아래 `LLM Access` API가 담당합니다.

---

## LLM Access

CLI-first LLM profile과 user/org entitlement를 조회하고 관리합니다.

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/llm-access/me` | 현재 사용자의 LLM access 상태 조회 |
| GET | `/api/llm-access/me?organization_id={id}` | 조직 범위를 포함한 현재 사용자 access 조회 |
| GET | `/api/llm-access/profiles` | CLI profile 목록 조회 (admin/manager) |
| POST | `/api/llm-access/profiles` | CLI profile 생성 (admin/manager) |
| PATCH | `/api/llm-access/profiles/{profile_id}` | CLI profile 수정 (admin/manager) |
| DELETE | `/api/llm-access/profiles/{profile_id}` | CLI profile 삭제 및 연결된 entitlement profile 매핑 해제 (admin/manager) |
| GET | `/api/llm-access/entitlements` | LLM entitlement 목록 조회 (admin/manager) |
| POST | `/api/llm-access/entitlements` | LLM entitlement 생성 (admin/manager) |
| PATCH | `/api/llm-access/entitlements/{entitlement_id}` | LLM entitlement 수정 (admin/manager) |

`/me`는 DB에 별도 설정이 없어도 `codex_cli` 기본 profile과 `mode=cli`, `source_scope=all` entitlement를 합성해서 반환합니다. `LLM_API_FALLBACK_ENABLED=false`가 기본이며, API fallback 허용 여부는 response의 `api_fallback_enabled`와 entitlement의 `allow_api_fallback`에 분리되어 표시됩니다.

CLI profile은 command, args, working directory, auth status, metadata만 반환하며 CLI 로그인 토큰이나 API key 원문은 반환하지 않습니다. `organization_id`가 있고 `owner_user_id`가 없는 profile은 조직 공용 profile로 취급합니다.

Settings UI에서 CLI profile을 생성하면 같은 provider/mode/source_scope의 persisted entitlement가 없는 경우 대상 사용자에게 `mode=cli`, `source_scope=all`, `allow_api_fallback=false` entitlement를 1개 자동 생성합니다. 조직 profile은 전체 조직에 일괄 권한을 부여하지 않고 profile owner 또는 현재 사용자 1명만 대상으로 합니다.

---

## LLM Proxy

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/proxy/chat/completions` | LLM 채팅 완료 프록시 (OpenAI 호환) |

---

## Internal LLM Usage Ledger

CLI 구독권 중심 사용량의 내부 원장 조회 API입니다. External Usage의 새 primary source로 사용합니다.

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/llm-usage/summary` | 내부 LLM 사용량 요약 |
| GET | `/api/llm-usage/records` | 내부 LLM 사용량 원장 레코드 목록 |

공통 필터:

- `start_time`, `end_time`
- `provider`, `mode`, `source`
- `user_id`, `organization_id`, `project_id`
- `limit` (`/records` only)

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
