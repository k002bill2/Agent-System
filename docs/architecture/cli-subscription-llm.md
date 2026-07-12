# CLI Subscription LLM Architecture

**Status:** Draft
**Date:** 2026-07-02

이 문서는 Agent-System이 LLM을 API 과금 키가 아니라 CLI 구독권 기반으로 사용하는 목표 아키텍처를 정의한다.

관련 문서:

- `docs/llm-key-systems.md`
- `docs/guides/llm-cli-subscription-usage-guide.md`
- `docs/architecture/llm-runtime-usage.md`
- `docs/plans/cli-subscription-usage-monitoring.md`

---

## 1. 목표

Agent-System의 기본 LLM 호출은 CLI subscription을 사용한다.

요구사항:

1. 기본적으로 모든 LLM 모델은 API가 아니라 CLI 구독권으로 사용한다.
2. 부득이한 경우를 제외하고 API 사용과 API 과금 정책을 배제한다.
3. Settings의 LLM 사용 권한과 External Usage는 같은 CLI 사용량을 표시한다.
4. 사용량은 외부 API billing usage가 아니라 AOS 내부 CLI 실행량을 측정한다.
5. 개인 Docker로 실행하되 여러 사용자가 사용할 수 있게 배포한다.
6. Organization은 개인/회사 사용자의 사용량을 모두 수용한다.
7. `.env`의 개인 사용자별 API key 설계를 시스템 기본값/정책 중심으로 바꾼다.
8. Playground, Task Analyzer, Git, Session 등 전체 LLM 사용처를 한 경로로 계측한다.

---

## 2. 새 개념 모델

기존 문서의 세 키 시스템은 유지하되 역할을 낮춘다.

| 기존 시스템 | 새 역할 |
|---|---|
| Runtime provider env key | API fallback을 위한 선택적 secret |
| User chat proxy key | Advanced / API fallback credential |
| Deployment usage admin key | Optional reconciliation credential |

새 권위 모델:

| 개념 | 역할 |
|---|---|
| Runtime Provider | `codex_cli`, `claude_cli`, `openai_api`, `ollama` 같은 실행 방식 |
| Runtime Mode | `cli`, `api`, `local` |
| User Entitlement | 사용자가 어떤 provider/mode/source를 쓸 수 있는지 |
| CLI Profile | Docker/host 안의 CLI 로그인 상태와 실행 설정 |
| Usage Ledger | AOS가 실행한 모든 LLM 호출의 내부 원장 |
| Reconciliation | provider usage API와 내부 원장을 보조 비교하는 기능 |

---

## 3. Runtime flow

```text
Feature request
  -> identify user / organization / source
  -> resolve requested model
  -> resolve runtime provider and mode
  -> check user entitlement
  -> optional org quota pre-flight
  -> select CLI profile
  -> execute CLI runtime
  -> normalize response and usage
  -> write LLMUsageLedger
  -> return feature response
```

API fallback이 필요한 경우:

```text
CLI runtime unavailable
  -> fallback policy check
  -> admin-approved API credential required
  -> execute API runtime
  -> write ledger with mode=api and source detail
```

---

## 4. Provider modes

| Provider | Mode | 1차 범위 | 설명 |
|---|---|---:|---|
| `codex_cli` | `cli` | Yes | 기본 LLM runtime. `codex exec` 사용 |
| `claude_cli` | `cli` | Yes | opt-in 실행 runtime. `claude -p` 사용, 명시적 profile/entitlement로만 선택 (Task Analyzer tmux/Warp launch intent 계측 포함) |
| `warp_ai` | `cli` | Tool only | Warp CLI `agent run` 도구 실행. ChatGPT/Claude CLI subscription과 분리 |
| `ollama` | `local` | Existing | 로컬 runtime. API 과금 없음 |
| `openai` | `api` | Fallback only | emergency / compatibility |
| `anthropic` | `api` | Fallback only | OCR/vision 또는 emergency |
| `google` | `api` | Fallback only | OCR/vision 또는 emergency |
| `github_copilot` | `external` | Reconciliation only | LLM runtime이 아니라 usage comparison 대상 |

---

## 5. Docker and multi-user model

1차 구현은 "단일 CLI profile + AOS 내부 사용자 분리"를 사용한다.

```text
Docker container
  -> one mounted/default CLI profile
  -> AOS auth users
  -> user/org entitlement rows
  -> per-user ledger records
```

장점:

- 개인 Docker 배포에서 바로 동작한다.
- CLI 인증 복잡도를 낮춘다.
- usage 화면은 여러 사용자/조직 기준으로 분리할 수 있다.

한계:

- provider 입장에서는 하나의 CLI 계정에서 실행된다.
- provider 약관상 다중 사용자 위임 가능 여부는 별도 확인이 필요하다.
- 사용자별 실제 provider account 분리는 2차 구현에서 CLI profile 격리가 필요하다.

2차 확장:

```text
User A -> CLI profile A
User B -> CLI profile B
Org workspace -> CLI profile org-shared
```

운영 배포 기준은 [배포 가이드의 CLI profile 격리 섹션](../deployment.md#cli-구독권과-사용자별-profile-격리)을 따른다.

---

## 6. Environment variable policy

`.env`는 개인 API key 입력 중심에서 시스템 정책 중심으로 바꾼다.

| 항목 | 기존 | 변경 방향 |
|---|---|---|
| `LLM_PROVIDER` | provider 선택 | 기본 runtime provider 선택, 기본값 `codex_cli` |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` | runtime key | fallback API credential, 기본 empty |
| `EXTERNAL_*_ADMIN_KEY` | External Usage primary source | optional reconciliation key |
| `CODEX_CLI_*` | Codex CLI 실행 설정 | primary runtime 설정 |
| 신규 `LLM_API_FALLBACK_ENABLED` | 없음 | 기본 `false` |
| 신규 `LLM_USAGE_SOURCE` | 없음 | 기본 `internal_ledger` |
| 신규 `LLM_DEFAULT_MODE` | 없음 | 기본 `cli` |
| 신규 `LLM_USAGE_PREFLIGHT_QUOTA_ENABLED` | 없음 | 기본 `false`, org quota를 호출 전 차단할 때만 `true` |

---

## 7. Settings UX target

Settings의 기본 화면은 API key가 아니라 LLM access를 보여준다.

```text
LLM Access
  Codex CLI      Connected      Enabled      Default
  Claude CLI     Connected      Execution only
  Ollama         Local          Optional

Usage Policy
  API fallback   Disabled
  Primary usage  Internal ledger
  Organization   Personal / Company

Advanced
  API fallback keys
  Reconciliation admin keys
```

기존 `LLMAccountsSettings`는 Advanced 영역으로 이동한다. 기존 credential API는 compatibility와 emergency fallback을 위해 유지한다.

---

## 8. External Usage UX target

External Usage는 내부 원장 집계를 보여준다.

필수 breakdown:

- organization
- user
- provider
- mode
- source
- model
- status
- measurement method

비용 표시는 "actual billing"이 아니라 "estimated"임을 UI model에 반영한다. API fallback usage는 별도 경고/필터로 노출한다.

---

## 9. Security and policy notes

- CLI profile secret과 API key는 서로 다른 credential type으로 관리한다.
- API fallback은 권한이 있는 admin/manager만 활성화할 수 있다.
- Organization token quota pre-flight는 기본적으로 비활성화한다. CLI subscription 사용량은 내부 ledger에 기록하고 post-hoc counter를 갱신하되, 운영자가 `LLM_USAGE_PREFLIGHT_QUOTA_ENABLED=true`를 설정한 경우에만 `LLMService` 호출과 `tmux_service.py` Claude CLI 실행 시작 전에 차단한다.
- 사용자에게 API key 원문은 절대 반환하지 않는다.
- CLI command execution은 allowlist, timeout, working directory, sandbox 정책을 가져야 한다.
- ledger는 감사 목적이 있으므로 request prompt 원문 저장을 피하고 correlation id와 token/cost metadata 중심으로 저장한다.

---

## 10. Non-goals for first implementation

- provider별 정확한 billing reconciliation을 완성하지 않는다.
- 모든 CLI provider를 동시에 구현하지 않는다.
- 사용자별 CLI profile 격리를 강제하지 않는다.
- 기존 API key/proxy 기능을 즉시 삭제하지 않는다.
