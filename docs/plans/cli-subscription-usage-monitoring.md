# CLI Subscription Usage Monitoring - Implementation Plan

**Date:** 2026-07-02
**Status:** Draft
**Approach:** CLI-first internal ledger, API fallback gated

---

## 1. 목적

Agent-System의 LLM 실행/사용량 관리를 API key billing 중심에서 CLI subscription 중심으로 전환한다.

성공 기준:

- 기본 LLM 호출은 `codex_cli` 등 CLI provider를 사용한다.
- Settings와 External Usage가 같은 내부 usage ledger를 본다.
- API key는 기본 경로가 아니라 fallback / reconciliation 용도로만 남는다.
- organization/user/source별 사용량을 집계할 수 있다.
- 기존 Playground, Task Analyzer, Git, Session 흐름은 동작을 유지한다.

---

## 2. Phase 0 - 문서 및 인벤토리

산출물:

- `docs/architecture/llm-runtime-usage.md`
- `docs/architecture/cli-subscription-llm.md`
- `docs/plans/cli-subscription-usage-monitoring.md`
- `docs/llm-key-systems.md`에 전환 문서 링크 추가

확인 대상:

- `services/llm_service.py`
- `services/codex_cli_chat_model.py`
- `services/playground_service.py`
- `agents/base.py`
- `agents/lead_orchestrator.py`
- `orchestrator/engine.py`
- `orchestrator/nodes.py`
- `services/tmux_service.py`
- `api/git.py`
- `api/agents.py`
- `api/llm_proxy.py`
- `api/external_usage.py`
- `services/external_usage_service.py`
- `components/usage/LLMAccountsSettings.tsx`
- `components/usage/AdminKeyManager.tsx`
- `stores/externalUsage.ts`

---

## 3. Phase 1 - DB 모델과 API 계약

### 3.1 신규 모델

`db/models/llm.py`에 추가한다.

```python
class UserLLMEntitlementModel(Base):
    __tablename__ = "user_llm_entitlements"

    id: str
    user_id: str
    organization_id: str | None
    provider: str
    mode: str                  # cli | api | local
    source_scope: str          # all | playground | task_analyzer | git | session
    enabled: bool
    cli_profile_id: str | None
    allow_api_fallback: bool
    quota_policy_id: str | None
    created_at: datetime
    updated_at: datetime
```

```python
class LLMCLIProfileModel(Base):
    __tablename__ = "llm_cli_profiles"

    id: str
    owner_user_id: str | None
    organization_id: str | None
    provider: str              # codex_cli | claude_cli | etc.
    profile_name: str
    command: str
    args_json: dict
    working_directory: str | None
    auth_status: str           # unknown | connected | disconnected | error
    metadata_json: dict
    created_at: datetime
    updated_at: datetime
```

```python
class LLMUsageLedgerModel(Base):
    __tablename__ = "llm_usage_ledger"

    id: str
    user_id: str | None
    organization_id: str | None
    provider: str
    mode: str                  # cli | api | local
    source: str
    model: str | None
    input_tokens: int | None
    output_tokens: int | None
    total_tokens: int | None
    measurement_method: str    # provider_metadata | cli_metadata | estimated | unknown
    estimated_cost_usd: float | None
    status: str                # success | error | timeout | cancelled
    session_id: str | None
    task_id: str | None
    analysis_id: str | None
    project_id: str | None
    latency_ms: int | None
    error_message: str | None
    metadata_json: dict
    started_at: datetime
    completed_at: datetime | None
    created_at: datetime
```

### 3.2 신규 service/API

Backend:

- `services/llm_usage_ledger_service.py`
- `services/llm_runtime_resolver.py`
- `api/llm_access.py`
- `api/llm_usage.py`

API 초안:

```text
GET    /api/llm-access/me
GET    /api/llm-access/profiles
POST   /api/llm-access/profiles
PATCH  /api/llm-access/profiles/{id}
GET    /api/llm-access/entitlements
POST   /api/llm-access/entitlements
PATCH  /api/llm-access/entitlements/{id}
GET    /api/llm-usage/summary
GET    /api/llm-usage/records
GET    /api/llm-usage/breakdown/users
GET    /api/llm-usage/breakdown/sources
```

기존 `/api/external-usage/summary`는 1차 마이그레이션 기간 동안 내부 ledger summary를 호출하도록 adapter를 둔다.

---

## 4. Phase 2 - Runtime resolver

목표:

- LLM 호출 전에 user/org/source/provider/mode를 하나의 resolver에서 결정한다.
- 기본 mode는 `cli`이다.
- API fallback은 명시적으로 허용된 경우만 가능하다.

새 service 책임:

```text
LLMRuntimeResolver.resolve(request)
  -> model
  -> provider
  -> mode
  -> cli_profile
  -> fallback_policy
  -> ledger_context
```

수정 대상:

- `services/llm_service.py`
- `services/llm_runtime_resolver.py`
- `orchestrator/engine.py`
- `agents/base.py`
- `api/agents.py` vision/OCR path

주의:

- `orchestrator/engine.py`의 별도 `get_llm()`은 중복 runtime factory다. 장기적으로 `LLMService`/resolver로 통합한다.
- `CodexCliChatModel`은 기존 동작을 유지하되 usage metadata 수집 hook을 추가한다.

현재 구현 상태:

- 완료: `services/llm_runtime_resolver.py`가 `LLMAccessResponse`의 enabled entitlement, source scope, provider/mode, API fallback policy를 해석한다
- 완료: `LLMService.invoke()`, `invoke_with_tools()`, `stream_with_tokens()`는 명시 `usage_context["llm_access"]`가 있을 때 provider 생성 전에 resolver를 적용한다
- 완료: Playground authenticated API 실행/스트리밍 경로는 current user의 `/llm-access/me`와 같은 access state를 조회하여 `usage_context["llm_access"]`로 전달한다
- 완료: Git draft commit API 경로는 current user의 access state를 조회하여 `source=git_draft_commit` 호출에 전달한다
- 완료: `BaseAgent._invoke_llm()`은 명시 `usage_context["llm_access"]`가 있을 때 resolver를 적용하고, Task Analyzer 분석 API는 private context로 access state를 전달한다
- 완료: Task Analyzer OCR 경로는 vision-capable 후보 모델을 `source=task_analyzer_ocr` resolver로 검증하고, API fallback entitlement가 없으면 provider 호출 전 차단한다
- 완료: Session API는 authenticated user의 access state를 세션 state에 JSON payload로 저장하고, LangGraph Planner/Executor/SelfCorrection 노드는 state의 `llm_access`를 resolver에 적용한다
- 완료: Session context compression summary 호출은 `source=context_compression` usage context를 `LLMService.invoke()`로 전달하여 같은 resolver를 적용한다

---

## 5. Phase 3 - Usage ledger 계측

우선순위:

1. `LLMService.invoke()` 공통 계측
2. `LLMService.invoke_with_tools()` 계측
3. `LLMService.stream_with_tokens()` 종료 시점 계측
4. `BaseAgent._invoke_llm()` 또는 그 하위 공통 계층 계측
5. `orchestrator/nodes.py`의 token update와 ledger correlation
6. `tmux_service.py`의 `claude -p` 실행 시작/완료 계측
7. `api/llm_proxy.py` API fallback 계측

현재 구현 상태:

- 완료: `LLMService.invoke()`, `LLMService.invoke_with_tools()`, `LLMService.stream_with_tokens()`에 `usage_context` 기반 best-effort ledger write 추가
- 완료: Playground 실행/스트리밍 경로에서 `source=playground`, `session_id`, `project_id`, execution metadata 전달
- 완료: Git draft commit 생성 경로에서 `source=git_draft_commit`, `project_id`, changed file metadata 전달
- 완료: `BaseAgent._invoke_llm()` 직접 호출 경로 계측 및 `LeadOrchestratorAgent._analyze_task()`에서 `source=task_analyzer` 전달
- 완료: Task Analyzer OCR 직접 vision 호출 경로를 `source=task_analyzer_ocr`로 pre-flight/ledger 기록
- 완료: Context compressor summary 호출을 `source=context_compression`으로 pre-flight/ledger 기록
- 완료: `api/llm_proxy.py` API fallback/proxy 경로를 `source=api_fallback_proxy`, `mode=api`로 내부 ledger에 기록
- 완료: `tmux_service.py` Claude CLI 실행 요청을 `source=task_analyzer_execution`, `mode=cli`로 내부 ledger에 기록
- 완료: `orchestrator/nodes.py` token update를 `source=orchestrator`로 내부 ledger에 기록
- 완료: `orchestrator/nodes.py` token update metadata에 runtime resolver 결과를 포함하여 Session/Orchestrator 사용량도 entitlement와 correlation한다
- 완료: tmux session 종료 감지/강제 종료 시 completion/cancelled event를 내부 ledger에 기록
- 완료: tmux Claude CLI 출력 transcript를 남기고 JSON/labeled usage metadata가 있으면 completion event를 `measurement_method=cli_metadata`와 실제 token/cost 값으로 기록

실패 기록:

- CLI command not found
- auth disconnected
- timeout
- model unavailable
- API fallback denied
- provider API failure

---

## 6. Phase 4 - Settings UI 전환

수정 대상:

- `src/dashboard/src/pages/SettingsPage.tsx`
- `src/dashboard/src/components/usage/LLMAccountsSettings.tsx`
- 신규 `src/dashboard/src/components/usage/LLMAccessSettings.tsx`
- 신규 `src/dashboard/src/stores/llmUsage.ts`

변경:

- 기본 섹션: `LLM Access`
- 표시 항목: provider, mode, connected/auth status, enabled, organization, default model
- Advanced 섹션: 기존 API key credential UI
- API fallback enabled 상태는 명확히 표시한다.

현재 구현 상태:

- 완료: `models/llm_access.py`, `services/llm_access_service.py`, `api/llm_access.py`를 추가하여 CLI profile과 entitlement 조회/생성/수정 계약 구현
- 완료: `/api/llm-access/me`는 persisted 설정이 없어도 `codex_cli` 기본 profile과 `mode=cli` entitlement를 합성하여 반환
- 완료: admin/manager용 `/api/llm-access/profiles`, `/api/llm-access/entitlements` 목록/생성/수정 API 추가
- 완료: `api/app.py`에 `llm-access` router 등록
- 완료: `llmUsage` dashboard store가 `/api/llm-usage/summary`를 조회하고 mode/source/project/user/org 필터를 query parameter로 전달
- 완료: `llmAccess` dashboard store가 `/api/llm-access/me`를 조회하고 persisted entitlement `enabled` 값을 PATCH로 수정
- 완료: Settings에 `LLM Access` 카드를 추가하여 CLI subscription, internal ledger, API fallback 관측 상태를 표시
- 완료: Settings `LLM Access` 카드에 현재 CLI profile command/auth status와 entitlement mode/source/API fallback 상태 표시
- 완료: Settings에서 persisted entitlement는 enabled 토글을 통해 직접 편집하고, 합성 default entitlement는 read-only로 표시
- 완료: Settings에서 admin/manager/org admin만 persisted entitlement enabled, CLI profile 매핑, API fallback 허용 값을 편집하도록 role-aware 제어 추가
- 완료: Settings에서 현재 provider의 기본 모델을 기존 `/api/llm/models/{id}` PATCH API로 변경 가능하게 연결
- 완료: Settings에서 개인 CLI profile을 생성하고, entitlement별 CLI profile을 선택할 수 있는 1차 UI 추가
- 완료: Settings에서 현재 사용자의 organization membership을 불러와 개인 profile 또는 organization 공용 profile 생성 범위를 선택
- 완료: Settings CLI profile 생성 시 working directory와 Codex sandbox preset을 지정하고 `args_json`/`metadata`에 반영
- 완료: `LLMAccessSettings` UI를 `llm-access/` 하위 컴포넌트와 상태 훅으로 분리하여 이후 profile health/edit 기능 추가 지점을 정리
- 완료: Settings에서 CLI profile auth health check를 실행하고 `auth_status`/health metadata를 갱신하는 API와 UI 액션 추가
- 완료: Settings에서 기존 CLI profile의 working directory와 sandbox preset을 수정하고 기존 `args_json`/metadata를 보존 갱신하는 UI 추가
- 완료: Settings에서 organization scope profile 생성 시 shared organization 또는 특정 member owner를 선택하는 delegated profile 생성 UI 추가
- 완료: Settings에서 전체 CLI profile 목록을 렌더링하고 persisted profile 삭제 시 연결된 entitlement의 `cli_profile_id` 매핑을 해제
- 완료: Settings CLI profile 생성 시 같은 provider/mode/source_scope의 persisted entitlement가 없으면 대상 사용자에게 `mode=cli`, `source_scope=all`, `allow_api_fallback=false` entitlement를 1개 자동 생성
- 완료: mode별 `cli/api/local` 사용량과 source별 상위 사용처를 내부 ledger 기준으로 표시
- 완료: 기존 `LLM API Keys` 카드는 Advanced fallback/compatibility credential 관리 경로로 보존

---

## 7. Phase 5 - External Usage 전환

수정 대상:

- `api/external_usage.py`
- `services/external_usage_service.py`
- `models/external_usage.py`
- `stores/externalUsage.ts`
- `components/usage/MemberUsageTable.tsx`
- `components/usage/AdminKeyManager.tsx`
- External Usage page

변경:

- primary summary source를 `LLMUsageLedger`로 교체한다.
- provider admin key collector는 optional reconciliation으로 낮춘다.
- `AdminKeyManager`는 "Usage admin key"가 아니라 "Reconciliation keys" 영역이 된다.
- `total_cost_usd`는 estimated 값임을 API model 또는 UI label에 반영한다.

현재 구현 상태:

- 완료: `/api/external-usage/summary` 기본 응답을 내부 `llm_usage_ledger` 기반으로 전환
- 완료: 기존 provider billing collector는 `EXTERNAL_USAGE_INCLUDE_PROVIDER_BILLING=true`일 때만 summary에 포함되도록 optional 처리
- 완료: `ExternalProvider`에 `codex_cli`, `claude_cli`, `internal_cli`, `internal_api`, `google`, `ollama`를 추가하여 내부 runtime provider를 legacy External Usage contract로 표현
- 완료: External Usage page를 `LLM Usage` 화면으로 갱신하고 `Codex CLI`/`Claude CLI` 등 내부 provider를 동적으로 표시
- 완료: `AdminKeyManager` UI 라벨을 reconciliation 용도로 재정리
- 완료: External Usage 화면/멤버 표에서 토큰을 1차 지표로 표시하고 비용은 estimated cost 보조 지표로 명시
- 완료: `DailyCostTrend`/`MemberUsageTable`의 provider 렌더링을 내부 CLI provider까지 동적으로 확장
- 완료: `/api/external-usage/summary`에 `reconciliation` 비교 metadata를 추가하고 External Usage 화면에 내부 ledger와 optional provider billing 비교 패널을 표시

---

## 8. Phase 6 - Organization 집계

기존 organization quota/usage service와 충돌하지 않게 ledger를 authoritative event source로 둔다.

필요 작업:

- user -> organization membership resolution
- personal usage와 company usage 구분
- organization summary API
- member breakdown
- quota enforcement 연결 여부 결정

기존 `OrganizationService.track_token_usage_async()`는 유지하되, 새 ledger write 이후 summary update 또는 quota check로 연결한다.

현재 구현 상태:

- 완료: `OrganizationService.get_member_usage_async()`가 `llm_usage_ledger`를 우선 조회하여 org/member별 token, request/session, last active를 집계
- 완료: `OrganizationService.get_member_usage_detail_async()`가 ledger 기반 daily usage, model usage, 월간 비용 추정, org 내 비율을 반환
- 완료: ledger row가 없을 때는 기존 `claude_session_snapshots` source_user 기반 집계로 fallback
- 완료: `record_usage()`가 `user_id`의 단일 활성 organization membership을 자동 해석하여 `organization_id`를 보강
- 완료: 명시된 `organization_id`는 해당 `user_id`의 활성 membership일 때만 org usage로 인정하여 다중 org 사용자의 선택 scope를 검증
- 완료: ledger 저장 후 `track_token_usage_async(commit=False, enforce_quota=False)`로 기존 monthly quota counter를 같은 transaction 안에서 post-hoc 갱신
- 완료: Settings LLM Access 카드에 organization usage scope selector를 추가하여 `llm_usage` summary의 org 필터를 선택 가능하게 함
- 완료: 기본값은 non-blocking으로 유지하고, `LLM_USAGE_PREFLIGHT_QUOTA_ENABLED=true`일 때 `LLMService.invoke()`, `invoke_with_tools()`, `stream_with_tokens()` 시작 전 organization monthly token quota를 strict pre-flight로 차단
- 완료: LangChain을 거치지 않는 `tmux_service.py` Claude CLI 실행 경로도 같은 strict pre-flight를 적용하여 quota 초과 시 tmux 세션 생성 전 차단
- 완료: Warp launch config는 `source=warp_launch` launch intent로 기록하고, AOS가 생성한 Claude prompt 입력 추정치만 ledger/quota pre-flight에 반영한다. Warp 내부의 후속 대화/출력 token은 AOS가 프로세스를 관리하지 않으므로 실제 사용량으로 계상하지 않는다
- 완료: `tools/warp_tools.py`의 Warp AI agent subprocess 실행은 `provider=warp_ai`, `source=warp_agent`로 prompt 입력 추정치와 성공/error/timeout 상태를 기록한다
- 완료: `orchestrator/nodes.py`의 `ExecutorNode`가 Warp agent tool 실행 시 `user_id`, `organization_id`, `session_id`, `task_id`, `project_id`를 숨김 `usage_context`로 전달하여 org-scoped pre-flight와 ledger correlation을 적용한다
- 완료: `LLMService.invoke_with_tools()` -> `execute_tool()` 호출 계약에 `usage_context`를 보존하여 Playground tool executor 경로도 추후 LLM-backed tool 계측을 받을 수 있게 했다

---

## 9. Migration strategy

1. 기존 API key 테이블은 유지한다.
2. 기존 deployment usage admin key 테이블은 유지한다.
3. 새 ledger 테이블을 추가하고 신규 호출부터 기록한다.
4. External Usage summary를 ledger 우선으로 바꾼다.
5. provider org usage collector는 reconciliation 탭으로 이동한다.
6. `.env.example`은 API key를 fallback/reconciliation 용도로 재라벨링한다.
7. 구 API는 deprecation notice 후 제거 여부를 결정한다.

현재 구현 상태:

- 완료: `.env.example` 기본 runtime을 `codex_cli`/`cli`/`internal_ledger`로 명시하고 API key placeholder를 모두 optional fallback 주석으로 전환
- 완료: `LLM_API_FALLBACK_ENABLED=false`를 기본 정책으로 추가
- 완료: `api/llm_proxy.py`가 `LLM_API_FALLBACK_ENABLED=true`일 때만 API proxy/fallback 요청을 허용하고, 차단 이벤트도 ledger에 기록
- 완료: provider billing reconciliation은 `EXTERNAL_USAGE_INCLUDE_PROVIDER_BILLING=false` 기본값으로 opt-in 처리
- 완료: Quick Start/User Guide의 기존 API-key-first 설명을 CLI-first/fallback-only 문구로 정리
- 완료: `docs/deployment.md#cli-구독권과-사용자별-profile-격리`에 per-user CLI profile 격리 운영 전략을 문서화

---

## 10. Tests

Backend focused tests:

- resolver: CLI first, API fallback denied by default
- ledger service: success/error records, aggregation by user/org/source/provider
- `LLMService.invoke`: ledger record created
- Playground: stale model fallback still works and writes source=`playground`
- Git draft commit: response token usage and ledger token usage match
- External Usage: summary reads ledger first
- Organization: member usage aggregation

Frontend focused tests:

- Settings: LLM Access section renders CLI providers
- Settings: API key UI appears only in Advanced/fallback section
- External Usage: source/provider/user breakdown renders
- AdminKeyManager relabeling to reconciliation keys

Verification gates:

```bash
cd src/backend && pytest ../../tests/backend
cd src/dashboard && npm test
/check-health
```

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| CLI token metadata가 없음 | transcript usage metadata가 있으면 `cli_metadata`, 없으면 `unknown`으로 기록하여 과장 집계를 피함 |
| provider 약관상 다중 사용자 위임 불명확 | 문서에 명시하고 1차는 내부 집계로 제한 |
| Docker에서 CLI auth 접근 실패 | CLI profile health check와 명확한 disconnected state 제공 |
| 기존 External Usage 기대와 충돌 | adapter 기간 유지, reconciliation 탭 제공 |
| API fallback이 조용히 비용 발생 | 기본 false, UI/API에서 명시적 승인 필요 |

---

## 12. First implementation slice

첫 구현 slice는 문서와 내부 usage ledger foundation을 포함한다.

- 새 아키텍처 문서 2개
- 새 구현 계획 1개
- 기존 `llm-key-systems.md` 링크 업데이트
- `UserLLMEntitlement`, `LLMCLIProfile`, `LLMUsageLedger` ORM 모델
- `LLMUsageLedger` Alembic migration
- `LLMUsageLedger` Pydantic API 계약과 summary service
- `/api/llm-usage/summary`, `/api/llm-usage/records` 읽기 API

다음 slice는 실제 LLM 호출 경로(`LLMService`, Playground, Git draft commit,
Task Analyzer)에 `record_usage()`를 연결한다.
