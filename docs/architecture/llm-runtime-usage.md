# LLM Runtime Usage Map

**Status:** Draft
**Date:** 2026-07-02

이 문서는 Agent-System 내부에서 LLM이 실제로 호출되는 지점을 정리한다. 목표는 사용량 집계의 기준을 provider billing API가 아니라 AOS 내부 실행 원장으로 옮기기 전에, 어떤 기능이 어떤 런타임을 쓰는지 고정하는 것이다.

관련 문서:

- `docs/llm-key-systems.md`
- `docs/architecture/cli-subscription-llm.md`
- `docs/plans/cli-subscription-usage-monitoring.md`

---

## 1. Runtime 원칙

Agent-System의 기본 LLM 실행 모델은 CLI subscription 기반이다.

```text
User action
  -> AOS feature entrypoint
  -> LLM runtime resolver
  -> entitlement check
  -> optional org quota pre-flight
  -> CLI runtime or explicitly allowed API fallback
  -> LLMUsageLedger record
  -> feature response
```

현재 구현에서는 `LLMService`, `BaseAgent`, LangGraph orchestrator node가 명시 `llm_access` context를 받은 경우에만 resolver를 strict 적용한다. access context가 없으면 기존 `LLM_PROVIDER`/model selection 동작을 보존한다. Playground authenticated API, Git draft commit API, Task Analyzer 분석 API, Session API는 current user의 access state를 조회하여 이 context를 전달한다.

기본 정책:

- `codex_cli`를 기본 runtime provider로 사용한다.
- API key 기반 provider는 기본 경로가 아니라 fallback / emergency / reconciliation 용도이다.
- Settings의 LLM 사용 권한과 External Usage는 같은 내부 사용량 원장(`LLMUsageLedger`)을 본다.
- provider가 token metadata를 주지 않으면 request/response 길이 기반 추정치를 기록한다.
- 비용은 실제 billing cost가 아니라 `estimated_cost_usd`로 취급하며 nullable이어야 한다.
- organization monthly token quota는 기본적으로 호출을 막지 않고 ledger write 이후 counter를 갱신한다. 운영자가 `LLM_USAGE_PREFLIGHT_QUOTA_ENABLED=true`를 설정한 경우에만 `LLMService` 호출과 `tmux_service/usage.py` Claude CLI 실행 전에 strict quota gate를 적용한다.

---

## 2. 현재 LLM 호출 지점

| 사용처 | Backend 시작점 | 실제 호출 경로 | 제안 source | 비고 |
|---|---|---|---|---|
| Playground 일반 실행 | `api/playground.py` | `services/playground_service/service.py` -> `LLMService.invoke()` / `invoke_with_tools()` / `stream_with_tokens()` | `playground` | session model이 stale하면 configured default로 fallback |
| Playground 모델 목록 | `api/playground.py` | `LLMService.get_available_models()` -> `LLMModelRegistry` | none | 실행이 아니라 capability 조회 |
| Task Analyzer 분석 | `api/agents.py` | `LeadOrchestrator.execute()` -> `BaseAgent._invoke_llm()` | `task_analyzer` | 분석 결과는 `TaskAnalysisService`에 저장 |
| Task Analyzer 이미지 OCR | `api/agents.py` | vision model 후보 -> runtime resolver -> `LLMService._get_llm()` -> `ainvoke()` | `task_analyzer_ocr` | API vision 모델은 explicit fallback entitlement가 있을 때만 실행 |
| Task Analyzer 터미널 실행 | `api/agents.py` | `services/tmux_service/` -> `claude -p` | `task_analyzer_execution` | LangChain을 거치지 않는 CLI 실행 경로 |
| Warp Claude launch | `api/warp.py` | `services/warp_service.py` -> Warp launch config -> host `claude` | `warp_launch` | AOS는 launch prompt 입력 추정치만 기록, 후속 Warp 세션 token은 미계상 |
| Warp AI agent tool | `tools/warp_tools.py` | Warp CLI `agent run` subprocess | `warp_agent` | Warp 자체 AI agent 실행. ExecutorNode 경로는 user/org/project context를 전달 |
| Git draft commits | `api/git/commits.py` | `LLMService.invoke()` | `git_draft_commit` | 응답의 `total_tokens`를 API response에도 반환 |
| Session / LangGraph | `api/sessions.py` -> `orchestrator/engine.py` | state `llm_access` -> graph nodes -> resolver -> `LLMService._get_llm()` -> `ainvoke()` | `orchestrator` | access context가 없으면 기존 engine 기본 LLM을 사용 |
| Agent execution | `agents/base.py` | `LLMService._get_llm()` -> `ainvoke()` | `agent` | agent name을 ledger metadata에 넣어야 함 |
| Context compressor | `orchestrator/engine.py` -> `services/context_compressor.py` | state access context -> `LLMService.invoke()` | `context_compression` | 세션 압축 summary 사용량을 background/utility로 분류 |
| LLM proxy | `api/llm_proxy.py` | user API key -> provider API | `api_fallback_proxy` | 기본 경로가 아니라 fallback / compatibility |
| External Usage collector | `api/external_usage.py` | `ExternalUsageService` -> provider org usage APIs | `reconciliation` | 내부 원장의 secondary comparison source |

`/api/external-usage/summary`는 legacy External Usage 화면 호환을 위해 내부 ledger를 `providers`/`records` 형태로 매핑한다. 같은 응답의 `reconciliation` 객체는 `primary_source=internal_ledger`, 내부 token/request/cost totals, optional provider billing totals, provider별 delta/status를 포함한다. `EXTERNAL_USAGE_INCLUDE_PROVIDER_BILLING=false`가 기본이면 provider billing totals는 0이고 비교 status는 ledger-only 또는 disabled 계열로 남는다.

---

## 3. 현재 provider 결정 방식

현재 provider/model 결정은 여러 경로에 흩어져 있다.

| 경로 | 현재 기준 | 변경 방향 |
|---|---|---|
| `config.py` | `LLM_PROVIDER=codex_cli` 기본값과 API key env | env는 시스템 기본값/feature flag만 담당 |
| `models/llm_models.py` | `LLMModelRegistry.get_default(LLM_PROVIDER)` | provider/mode별 default model 유지 |
| `services/llm_service.py` | model config의 provider로 LangChain model 생성 | `RuntimeResolver`가 user/org entitlement와 mode를 먼저 결정 |
| `orchestrator/engine.py` | 별도 `get_llm()` 구현 | `LLMService` 또는 runtime resolver로 통합 |
| `api/agents.py` OCR | 사용 가능한 vision model 자동 선택 | CLI vision 가능 여부와 API fallback 정책 반영 |
| `services/tmux_service/usage.py` | `claude -p` 직접 실행 | CLI runtime execution event로 원장 기록 |

---

## 4. 사용량 데이터의 권위 소스

### 기존

```text
External Usage
  -> deployment usage admin key
  -> provider org usage API
  -> optional in-memory proxy records
```

이 방식은 provider별 admin key가 필요하고, CLI 구독권으로 실행한 AOS 내부 사용량과 일치하지 않는다.

### 변경

```text
External Usage
  -> LLMUsageLedger
  -> user/org/provider/source/model 집계
  -> optional provider usage API reconciliation
```

원장에 기록할 최소 필드:

| 필드 | 설명 |
|---|---|
| `user_id` | 요청 사용자 |
| `organization_id` | org 집계 기준, nullable |
| `provider` | `codex_cli`, `claude_cli`, `openai`, `anthropic`, etc. |
| `mode` | `cli`, `api`, `local` |
| `source` | `playground`, `task_analyzer`, `git_draft_commit`, etc. |
| `model` | 실행 모델 |
| `input_tokens` / `output_tokens` / `total_tokens` | 실제 또는 추정 token |
| `measurement_method` | `provider_metadata`, `cli_metadata`, `estimated`, `unknown` |
| `estimated_cost_usd` | nullable 추정 비용 |
| `status` | `success`, `error`, `timeout`, `cancelled` |
| `session_id` / `task_id` / `analysis_id` / `project_id` | 기능별 correlation |
| `started_at` / `completed_at` / `latency_ms` | 시간/성능 분석 |

---

## 5. Integration notes

### Playground

Playground는 가장 먼저 원장 계측을 붙일 수 있는 경로다. `LLMService.invoke()` 계층에서 공통 계측을 넣으면 일반 실행, 도구 실행, 일부 stream 실행을 커버한다. stream은 final token event가 없을 수 있으므로 close 시점의 추정 기록이 필요하다.

### Task Analyzer

Task Analyzer는 세 종류의 LLM 사용이 있다.

1. 분석: `LeadOrchestrator`가 LLM으로 JSON 실행 계획을 만든다.
2. 실행: `tmux_service/service.py`가 `claude -p`를 터미널에서 실행한다.
3. OCR: 이미지 텍스트 추출은 vision-capable 후보 모델을 `source=task_analyzer_ocr`로 resolver에 통과시킨 뒤 실행한다.

각 경로는 같은 UI 기능에 속하지만 runtime 경로가 다르므로 source를 분리한다.

`tmux_service/service.py`는 Claude CLI stdout/stderr를 transcript 파일로 남긴다. 완료 이벤트 기록 시 transcript 안의 JSON usage block 또는 `Input tokens`, `Output tokens`, `Total cost` 형식의 labeled line을 파싱할 수 있으면 `measurement_method=cli_metadata`로 token/cost를 기록한다. 파싱 가능한 metadata가 없으면 기존처럼 token 값을 비워 둔다.

### Warp launch

Warp launch config는 AOS가 Claude CLI 프로세스를 직접 소유하지 않는다. 따라서 `source=warp_launch`는 실제 세션 전체 token이 아니라 AOS가 launch config에 넣은 prompt 입력 추정치와 launch intent만 기록한다. `LLM_USAGE_PREFLIGHT_QUOTA_ENABLED=true`일 때도 이 prompt 추정치 기준으로만 pre-flight를 수행한다.

### Warp AI agent tool

`tools/warp_tools.py`는 Warp CLI의 `agent run`을 subprocess로 직접 실행한다. 이 경로는 Claude CLI subscription이 아니라 Warp 자체 AI runtime이므로 `provider=warp_ai`, `source=warp_agent`로 분리한다. AOS는 prompt 입력 추정치, timeout, exit code, MCP 사용 여부를 기록한다. `ExecutorNode`는 LangChain tool schema에 새 인자를 노출하지 않고 숨김 `usage_context`로 user/org/session/task/project correlation을 전달하므로, `LLM_USAGE_PREFLIGHT_QUOTA_ENABLED=true`인 경우 org-scoped pre-flight도 적용된다.

### Git

Git draft commit은 이미 `LLMService.invoke()` 응답의 `total_tokens`를 반환한다. 원장 계측 후에는 API response의 token usage와 ledger record가 같은 호출에서 나온 값이어야 한다.

### Session / Orchestrator

Session API는 인증 사용자의 `LLMAccessResponse`를 조회해 세션 state에 JSON payload로 저장한다. LangGraph Planner, Executor, SelfCorrection node는 state의 `llm_access`가 있을 때 `resolve_llm_runtime()`으로 call-time LLM을 선택하고, access context가 없으면 engine 초기화 시점의 기본 LLM을 그대로 사용한다.

LangGraph node는 state 내부 `token_usage`를 누적하고 session DB cost를 갱신한다. 원장은 이 state summary를 대체하지 않는다. session UI의 실시간 token update는 유지하고, token update를 `source=orchestrator` 원장 record로 normalize해서 기록한다.

Context compressor는 같은 세션 state에서 `user_id`, `organization_id`, `session_id`, `project_id`, `llm_access`를 받아 summary 생성 호출을 `source=context_compression`으로 기록한다. access context가 있으면 `LLMService.invoke()`가 requested model 없이 resolver 기본 runtime을 선택한다.

---

## 6. Open questions

- Codex CLI가 안정적으로 token metadata를 제공하는가?
- provider 약관상 단일 CLI subscription을 여러 AOS 사용자에게 위임해도 되는가?
- 사용자별 CLI profile의 Docker 운영 기준은 `docs/deployment.md#cli-구독권과-사용자별-profile-격리`에 문서화했다. provider 약관과 실제 계정 위임 정책은 운영자가 별도로 확인해야 한다.
