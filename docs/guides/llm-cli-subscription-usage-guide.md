# CLI 구독권 기반 LLM 운영 안내

**상태:** 구현 반영 가이드
**기준일:** 2026-07-04
**대상:** AOS 운영자, self-host 배포자, Settings/External Usage 유지보수자

이 문서는 Agent-System의 LLM 실행과 사용량 집계를 API 과금 키 중심에서 CLI 구독권 중심으로 전환한 현재 구현을 설명한다. 설계 배경은 [CLI Subscription LLM Architecture](../architecture/cli-subscription-llm.md), 실제 호출 지점은 [LLM Runtime Usage](../architecture/llm-runtime-usage.md), 단계별 구현 이력은 [CLI Subscription Usage Monitoring Plan](../plans/cli-subscription-usage-monitoring.md)을 참고한다.

---

## 1. 핵심 정책

현재 기본 정책은 다음과 같다.

1. 기본 LLM runtime은 API key가 아니라 CLI 구독권이다.
2. `codex_cli`와 `mode=cli`가 기본값이다.
3. Settings의 LLM Access와 External Usage는 같은 내부 원장인 `llm_usage_ledger`를 본다.
4. External Usage의 provider billing API는 primary source가 아니라 reconciliation 비교용이다.
5. API fallback은 전역 env와 entitlement가 모두 허용한 경우에만 가능하다.
6. 개인 Docker에서는 단일 CLI profile로 시작할 수 있고, 여러 사용자/조직은 AOS user/org 기준으로 ledger를 분리한다.

기본 env는 다음 상태를 유지한다.

```bash
LLM_PROVIDER=codex_cli
LLM_DEFAULT_MODE=cli
LLM_USAGE_SOURCE=internal_ledger
LLM_API_FALLBACK_ENABLED=false
LLM_USAGE_PREFLIGHT_QUOTA_ENABLED=false
EXTERNAL_USAGE_INCLUDE_PROVIDER_BILLING=false
```

---

## 2. 구현된 구성 요소

### DB 테이블

Alembic migration `f4c9d8e7a6b5_add_llm_usage_ledger.py`가 다음 테이블을 추가한다.

| 테이블 | 역할 |
|---|---|
| `llm_cli_profiles` | CLI 실행 command, args, working directory, auth status, owner user/org metadata |
| `user_llm_entitlements` | 사용자 또는 조직이 어떤 provider/mode/source를 사용할 수 있는지 |
| `llm_usage_ledger` | AOS가 실행한 LLM 호출의 내부 사용량 원장 |

마이그레이션 실행:

```bash
cd src/backend
alembic upgrade head
```

### Backend API

| API | 역할 |
|---|---|
| `GET /api/llm-access/me` | 현재 사용자의 LLM access 상태 조회 |
| `GET /api/llm-access/profiles` | CLI profile 목록 조회, admin/manager |
| `POST /api/llm-access/profiles` | CLI profile 생성, admin/manager |
| `PATCH /api/llm-access/profiles/{profile_id}` | CLI profile 수정, admin/manager |
| `DELETE /api/llm-access/profiles/{profile_id}` | CLI profile 삭제 및 entitlement 매핑 해제 |
| `POST /api/llm-access/profiles/{profile_id}/health-check` | CLI command/auth 상태 점검 |
| `GET /api/llm-access/entitlements` | entitlement 목록 조회, admin/manager |
| `POST /api/llm-access/entitlements` | entitlement 생성, admin/manager |
| `PATCH /api/llm-access/entitlements/{entitlement_id}` | entitlement 수정, admin/manager |
| `GET /api/llm-usage/summary` | 내부 LLM 사용량 summary |
| `GET /api/llm-usage/records` | 내부 LLM ledger record 목록 |
| `GET /api/external-usage/summary` | legacy External Usage 호환 summary와 reconciliation metadata |

`/api/llm-access/me`는 DB에 profile/entitlement가 없어도 기본 `codex_cli` profile과 `mode=cli`, `source_scope=all` entitlement를 합성해서 반환한다.

### Dashboard UI

| 화면 | 구현 내용 |
|---|---|
| Settings -> LLM Access | CLI profile, entitlement, API fallback 정책, org usage scope 표시 |
| Settings -> LLM Access profile 목록 | 전체 profile 표시, 생성, 삭제, health check |
| Settings -> LLM Access auto entitlement | profile 생성 시 동일 provider/mode/source entitlement가 없으면 대상 사용자용 `mode=cli`, `source_scope=all`, `allow_api_fallback=false` entitlement 1개 자동 생성 |
| External Usage -> LLM Usage | 내부 ledger 기반 provider/user/model/source/token/cost 표시 |
| External Usage -> Usage Reconciliation | 내부 ledger와 optional provider billing totals/delta/status 비교 |
| AdminKeyManager | provider billing reconciliation key 관리로 재라벨링 |

---

## 3. Runtime 적용 범위

다음 경로가 내부 ledger와 runtime resolver 흐름에 연결되어 있다.

| 사용처 | source | provider/mode 처리 | 사용량 기록 |
|---|---|---|---|
| Playground 실행/스트리밍 | `playground` | current user access state를 `LLMService`에 전달 | provider metadata 또는 추정치 |
| Git draft commit | `git_draft_commit` | current user access state를 `LLMService`에 전달 | provider metadata 또는 추정치 |
| Task Analyzer 분석 | `task_analyzer` | `BaseAgent._invoke_llm()`에서 resolver 적용 | provider metadata 또는 추정치 |
| Task Analyzer OCR | `task_analyzer_ocr` | vision 후보 모델을 resolver로 검증 | provider metadata 또는 추정치 |
| Task Analyzer tmux 실행 | `task_analyzer_execution` | `claude -p` CLI 실행 | 시작/완료/cancelled/error event |
| Session / LangGraph | `orchestrator` | session state의 `llm_access`를 node call-time에 적용 | node token update를 ledger에 normalize |
| Context compression | `context_compression` | state access context로 `LLMService.invoke()` 호출 | summary 호출 사용량 |
| LLM proxy fallback | `api_fallback_proxy` | API fallback 허용 시에만 `mode=api` | API response metadata 또는 error |
| Warp launch | `warp_launch` | AOS가 launch prompt intent만 기록 | prompt 입력 추정치 |
| Warp AI agent tool | `warp_agent` | Warp 자체 runtime으로 분리 | prompt 추정치, timeout, exit code |

---

## 4. 사용량 측정 기준

`llm_usage_ledger.measurement_method`는 다음 중 하나다.

| 값 | 의미 |
|---|---|
| `provider_metadata` | provider 또는 LangChain response가 token metadata를 제공 |
| `cli_metadata` | CLI transcript나 CLI output에서 token/cost metadata를 파싱 |
| `estimated` | prompt/response 길이 기반 추정치 |
| `unknown` | token metadata가 없고 추정하지 않는 경로 |

비용은 항상 `estimated_cost_usd`로 취급한다. 실제 청구 비용은 아니다.

Claude CLI tmux 경로는 stdout/stderr를 transcript 파일로 남긴다. 완료 시 다음 형식을 파싱할 수 있으면 `cli_metadata`로 기록한다.

```json
{"usage": {"input_tokens": 123, "output_tokens": 45, "total_tokens": 168, "cost_usd": 0.0123}}
```

또는 labeled line:

```text
Input tokens: 1,000
Output tokens: 250
Total cost: $0.045
```

metadata가 없으면 token 값을 비워 두고 `measurement_method=unknown`으로 남긴다.

---

## 5. 개인 Docker 운영 절차

1. Self-host 머신에서 CLI를 로그인한다.

```bash
codex --version
codex login
```

2. `.env`에서 CLI-first 기본값을 유지한다.

```bash
LLM_PROVIDER=codex_cli
LLM_DEFAULT_MODE=cli
LLM_API_FALLBACK_ENABLED=false
```

3. Docker에는 전체 home을 마운트하지 말고 CLI profile 디렉터리만 마운트한다.

```yaml
services:
  backend:
    volumes:
      - ./runtime/llm-profiles/codex/default:/home/aos/.codex:ro
```

4. DB migration을 적용한다.

```bash
cd src/backend
alembic upgrade head
```

5. Dashboard Settings -> LLM Access에서 CLI profile을 생성한다.

권장 값:

| 필드 | 값 |
|---|---|
| provider | `codex_cli` |
| command | `codex` |
| args | `exec --sandbox read-only --color never` |
| working directory | 사용자가 접근 가능한 workspace |
| owner | 개인 사용자는 `owner_user_id`, 조직 공용은 `organization_id` |

6. Health check를 실행한다.

```text
POST /api/llm-access/profiles/{profile_id}/health-check
```

7. entitlement가 생성되었는지 확인한다.

기본 profile 생성 UI는 같은 provider/mode/source entitlement가 없을 때 현재 사용자에게 아래 entitlement를 자동 생성한다.

```json
{
  "provider": "codex_cli",
  "mode": "cli",
  "source_scope": "all",
  "enabled": true,
  "allow_api_fallback": false
}
```

---

## 6. 여러 사용자와 Organization 운영

1차 운영은 두 가지 모드를 지원한다.

| 모드 | 설명 | 사용량 해석 |
|---|---|---|
| 단일 기본 profile | 하나의 CLI 계정을 여러 AOS user/org가 공유 | provider 계정은 하나지만 ledger는 AOS user/org별로 분리 |
| 사용자/조직별 profile | user/org마다 CLI profile 디렉터리 분리 | provider 계정과 AOS ledger를 모두 user/org 기준으로 분리 |

조직별 사용량은 `organization_id`가 ledger에 기록될 때 집계된다. `OrganizationService.get_member_usage_async()`와 member detail은 `llm_usage_ledger`를 우선 조회한다.

quota 정책:

- 기본값은 post-hoc 집계다. 호출을 막지 않고 ledger write 이후 organization counter를 갱신한다.
- 호출 전에 막아야 하는 운영 환경에서만 `LLM_USAGE_PREFLIGHT_QUOTA_ENABLED=true`를 켠다.
- pre-flight gate는 `LLMService`, Task Analyzer tmux, Warp launch/tool usage context에 적용된다.

---

## 7. API fallback과 provider billing reconciliation

### API fallback

API fallback은 예외 경로다. 다음 두 조건이 모두 true여야 한다.

```bash
LLM_API_FALLBACK_ENABLED=true
```

그리고 entitlement:

```json
{
  "allow_api_fallback": true
}
```

fallback 호출도 내부 ledger에 `mode=api`로 기록된다. fallback API key는 기본 runtime key가 아니라 emergency/compatibility credential이다.

### Provider billing reconciliation

External Usage의 primary source는 내부 ledger다. provider billing API를 비교값으로 포함하려면 다음 env를 켠다.

```bash
EXTERNAL_USAGE_INCLUDE_PROVIDER_BILLING=true
```

이 경우 `GET /api/external-usage/summary` 응답의 `reconciliation` 객체에 다음 값이 포함된다.

- `primary_source=internal_ledger`
- 내부 ledger token/request/cost totals
- provider billing token/request/cost totals
- provider별 `delta_tokens`, `delta_cost_usd`, `status`

provider billing key는 AdminKeyManager에서 reconciliation key로 관리한다. 이 키는 채팅 키가 아니라 provider usage API를 읽는 admin/org key다.

---

## 8. 확인 방법

### Backend API 확인

```bash
curl http://localhost:8000/api/llm-access/me
curl http://localhost:8000/api/llm-usage/summary
curl http://localhost:8000/api/external-usage/summary
```

인증이 켜져 있으면 dashboard session cookie 또는 bearer token이 필요하다.

### Dashboard 확인

1. Settings -> LLM Access
   - CLI profile이 보이는지 확인
   - entitlement enabled 상태 확인
   - API fallback disabled 상태 확인
2. External Usage -> LLM Usage
   - Total Tokens가 내부 ledger 기준으로 표시되는지 확인
   - provider card에 `Codex CLI`, `Claude CLI`, `Internal CLI` 등이 표시되는지 확인
   - Usage Reconciliation 패널에서 primary source가 `Internal CLI ledger`인지 확인

### 개발 검증 명령

Backend:

```bash
cd src/backend
./.venv/bin/python -m ruff check \
  services/llm_access_service.py services/llm_runtime_resolver.py \
  services/llm_usage_ledger_service.py services/external_usage_service.py
./.venv/bin/python -m pytest \
  ../../tests/backend/test_llm_access_service.py \
  ../../tests/backend/test_llm_runtime_resolver.py \
  ../../tests/backend/test_llm_usage_ledger_service.py \
  ../../tests/backend/test_llm_usage_instrumentation.py \
  ../../tests/backend/test_external_usage_service.py -q
```

Frontend:

```bash
cd src/dashboard
npm run type-check
npm run lint
npm test -- --run \
  src/stores/__tests__/llmAccess.test.ts \
  src/stores/__tests__/llmUsage.test.ts \
  src/stores/__tests__/externalUsage.test.ts \
  src/pages/SettingsPage.test.tsx \
  src/pages/ExternalUsagePage.test.tsx \
  src/components/usage/__tests__/LLMAccessSettings.test.tsx
npm run build
```

---

## 9. Troubleshooting

| 증상 | 확인할 것 | 조치 |
|---|---|---|
| Settings LLM Access가 비어 있음 | `/api/llm-access/me` 응답 | 기본 synthetic `codex_cli` profile이 나와야 함 |
| CLI command not found | profile `command`, container PATH | profile command를 절대 경로로 바꾸거나 image에 CLI 설치 |
| auth disconnected | mounted CLI profile, HOME 경로 | profile mount 경로와 backend process user HOME 확인 |
| External Usage가 No data | `llm_usage_ledger` record 존재 여부 | 실제 LLM 호출 후 `/api/llm-usage/records` 확인 |
| provider billing 값이 0 | `EXTERNAL_USAGE_INCLUDE_PROVIDER_BILLING` | 비교값이 필요할 때만 true로 변경 |
| API fallback이 차단됨 | env와 entitlement | `LLM_API_FALLBACK_ENABLED=true`와 `allow_api_fallback=true` 둘 다 필요 |
| quota exceeded | org monthly token counter, pre-flight env | 필요 시 `LLM_USAGE_PREFLIGHT_QUOTA_ENABLED=false`로 post-hoc 운영 |
| Playground stale model 403 | saved session model, registry default | saved session fallback과 `LLMModelRegistry` 기본값 확인 |
| tmux completion token이 비어 있음 | Claude CLI transcript metadata | CLI output에 token/cost metadata가 없으면 `unknown`으로 기록됨 |

---

## 10. 아직 운영자가 결정해야 할 것

구현은 완료되었지만 다음은 운영 정책 확인이 필요하다.

1. Codex CLI가 안정적인 token metadata를 제공하는지.
2. 단일 CLI subscription을 여러 AOS 사용자에게 위임하는 것이 provider 약관상 허용되는지.
3. 회사/외부 고객을 같은 인스턴스에서 받을 때 사용자별 CLI profile 격리를 강제할지.
4. provider billing reconciliation을 운영 지표로 사용할지, 감사용 참고값으로만 둘지.

이 네 가지는 코드 구현이 아니라 배포/약관/운영 기준의 문제다.

---

## 11. 파일 맵

| 영역 | 파일 |
|---|---|
| DB 모델 | `src/backend/db/models/llm.py` |
| DB migration | `src/backend/alembic/versions/f4c9d8e7a6b5_add_llm_usage_ledger.py` |
| Access API | `src/backend/api/llm_access.py` |
| Usage API | `src/backend/api/llm_usage.py` |
| Runtime resolver | `src/backend/services/llm_runtime_resolver.py` |
| Usage ledger service | `src/backend/services/llm_usage_ledger_service.py` |
| Common LLM service | `src/backend/services/llm_service.py` |
| Task Analyzer tmux | `src/backend/services/tmux_service.py` |
| External Usage adapter | `src/backend/services/external_usage_service.py` |
| Settings LLM Access UI | `src/dashboard/src/components/usage/LLMAccessSettings.tsx` |
| LLM Access UI modules | `src/dashboard/src/components/usage/llm-access/` |
| LLM Access store | `src/dashboard/src/stores/llmAccess.ts` |
| LLM Usage store | `src/dashboard/src/stores/llmUsage.ts` |
| External Usage store | `src/dashboard/src/stores/externalUsage.ts` |
| External Usage page | `src/dashboard/src/pages/ExternalUsagePage.tsx` |

