# LLM Runtime and Key Systems

AOS에는 **CLI 구독권 기반 런타임 관리**와 목적이 다른 LLM key 시스템이 함께 존재한다. 기본 실행은 API 과금이 아닌 CLI subscription을 우선하며, API key는 fallback 또는 provider billing reconciliation이 필요한 경우에만 사용한다. 새 세션이 이 영역을 만지기 전 반드시 이 문서를 읽을 것.

> 관련: `docs/architecture.md`(서비스 구조), `docs/api/monitoring.md`(External Usage API), `.env.example`(env 키).
> 현재 구현 운영 안내: `docs/guides/llm-cli-subscription-usage-guide.md`.
> CLI 구독권 중심 전환 계획: `docs/architecture/llm-runtime-usage.md`, `docs/architecture/cli-subscription-llm.md`, `docs/plans/cli-subscription-usage-monitoring.md`.
> 운영 배포 기준: `docs/deployment.md#cli-구독권과-사용자별-profile-격리`.

## 한눈에

| # | 시스템 | 용도 | 저장 | 설정 주체 | 기본 사용 |
|---|--------|------|------|----------|----------|
| 0 | CLI profile/entitlement | 사용자별 CLI 실행 권한, quota, fallback 허용 정책 | `llm_cli_profiles`, `user_llm_entitlements` | admin/manager | **primary** |
| 1 | 런타임 기본값/fallback 키 | AOS 에이전트/LangGraph의 기본 provider와 API fallback | `.env`(config) | 배포 운영자 | fallback |
| 2 | 유저 채팅 프록시 키 | 사용자가 자기 키로 legacy chat proxy 사용 | `user_llm_credentials`(DB, 암호화) | 각 사용자 | compatibility |
| 3 | 배포 usage admin 키 | provider billing API reconciliation | `deployment_usage_credentials`(DB, 암호화) | admin/manager | optional |

공통: DB 저장 키는 `db/types.py`의 `EncryptedString`(AES-256-GCM)로 암호화. `ENCRYPTION_MASTER_KEY` 미설정 시 일부 legacy credential은 평문 폴백될 수 있으나, deployment usage admin key는 fail-closed로 처리한다.

---

## [0] CLI profile/entitlement

사용자별 LLM 실행 권한의 현재 기본 경로다. 실제 모델 호출은 CLI subscription 세션을 우선 사용하고, ledger는 이 내부 사용량을 기록한다.

- **저장**: `llm_cli_profiles`(CLI command/home/env/policy), `user_llm_entitlements`(user/org별 profile 연결, fallback 허용, quota).
- **서비스/API**: `services/llm_access_service.py`, `api/llm_access.py`.
- **UI**: Settings → `LLM Access`(`components/usage/LLMAccessSettings.tsx`, `stores/llmAccess.ts`).
- **소비**: `services/llm_runtime_resolver.py`가 provider/mode/source별 실행 경로를 결정하고, `services/llm_usage_ledger_service.py`가 사용량을 `llm_usage_ledger`에 기록한다.
- **실행 프로바이더**: CLI 런타임은 `codex_cli`(기본, 자동 시딩·`/me` 합성 대상)와 `claude_cli`(`services/claude_cli_chat_model.py`, `claude -p` stdout 어댑터) 2종. `claude_cli`는 자동 시딩 없이 **명시적 profile/entitlement로만** 선택되며, 모델 미지정 시 resolver는 codex_cli를 우선한다. env: `CLAUDE_CLI_COMMAND`(기본 `claude`) / `CLAUDE_CLI_ARGS`(기본 `-p --output-format text --permission-mode plan` — codex `--sandbox read-only`에 대응하는 읽기전용 장벽) / `CLAUDE_CLI_TIMEOUT_SECONDS`(기본 300). codex와 동일하게 profile의 command/args_json이 아니라 **env가 런타임 SSOT**다. ledger의 `claude_cli` 행이 CLAUDE_CLI External Usage 카드 집계에서 제외되는 기존 계약(아래 "핵심 함정")은 그대로 유지된다.
- **정책**: 개인 Docker 배포는 개인 profile을 기본값으로 둘 수 있고, 다중 사용자 배포는 Organization 단위 entitlement와 quota로 분리한다.

## [1] 런타임 프로바이더 키

AOS의 에이전트/오케스트레이터가 **기본 provider와 예외 fallback**을 결정할 때 사용.

- **설정** (`config.py`): `LLM_PROVIDER`(기본 `codex_cli`, 로컬 우선), `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY`, 모델 변수.
- **소비**: `services/llm_service.py` `create_llm()` → provider별 LangChain 모델(`ChatOpenAI`/`ChatAnthropic`/`ChatGoogleGenerativeAI`/`ChatOllama`/`CodexCliChatModel`/`ClaudeCliChatModel`) 생성, settings 키 주입. 라우팅/페일오버 `services/llm_router_service.py`.
- **범위**: env는 배포 기본값과 fallback 정책을 제공한다. 사용자/조직별 CLI 실행 권한은 `llm_cli_profiles`와 `user_llm_entitlements`가 담당한다.

## [2] 유저 채팅 프록시 키

각 사용자가 등록한 키로 AOS가 외부 LLM에 **채팅 요청을 프록시**.

- **저장**: `db/models/llm.py` `UserLLMCredentialModel` — `user_id`별, `provider`+`key_name` 다중 허용.
- **서비스**: `services/credential_service.py` — CRUD, `get_raw_key(db, user_id, provider)`(복호화, 최신 active 1건), `_test_key`(verify는 `/v1/models`만 → 채팅 티어 유효성).
- **API**: `api/llm_credentials.py`, prefix `/api/users/me/llm-credentials` (CRUD + `/verify`). 인증 사용자 self-scoped.
- **UI**: `pages/SettingsPage.tsx` → `components/usage/LLMAccountsSettings.tsx` (store `stores/llmCredentials.ts`).
- **소비**: `api/llm_proxy.py`, prefix `/api/proxy`, `POST /chat/completions`. 헤더 `X-Provider`로 provider 선택 → `get_raw_key`로 키 → `PROVIDER_BASE_URLS`(openai/anthropic/google_gemini)로 프록시 + 사용량 `add_record`(인메모리 `_proxy_records`).
- **키 종류**: 일반 채팅 키(`sk-proj-`, `sk-ant-api-` 등).

## [3] 배포 usage admin 키

provider billing API에서 org 전체 사용량/비용을 읽는 **admin 키**. 내부 ledger와 별도이며, 현재 External Usage의 primary source가 아니라 reconciliation source다.

- **저장**: `db/models/llm.py` `DeploymentUsageCredentialModel` — provider당 1행(`UniqueConstraint(provider)`), 채팅 키 테이블과 물리 분리(→`get_raw_key` 오라우팅 차단).
- **서비스**: `services/deployment_usage_credential_service.py` — `resolve_admin_key(db, provider)`(우선순위: **활성 DB 키 > `EXTERNAL_*` env > None**), CRUD, `verify_deployment_key`(실제 usage 엔드포인트 호출로 `usage_capable` 판정, HTTP status만 관찰).
- **API**: `api/external_usage.py`, `/api/external-usage/admin-keys` (CRUD + `/verify`). **admin/manager만**(`api/deps.py` `get_current_admin_or_manager_user`). 조회 엔드포인트(`/summary`·`/sync`·`/providers`·`/health`)는 인증 필수.
- **UI**: External Usage 페이지의 reconciliation 설정 → `components/usage/AdminKeyManager.tsx` (store `stores/deploymentUsageKeys.ts`).
- **소비**: `services/external_usage_service.py`가 요청 시 `_build_collectors(db)`로 키 해석해 org usage API 호출(OpenAI `/organization/usage/completions`, Anthropic `usage_report/messages`, GitHub `copilot/metrics`). OpenAI는 `_COST_TABLE`로 비용 로컬 계산.
- **env 폴백**: `EXTERNAL_OPENAI_ADMIN_KEY`, `EXTERNAL_ANTHROPIC_ADMIN_KEY`, `EXTERNAL_GITHUB_TOKEN` + `EXTERNAL_GITHUB_ORG`.
- **키 종류**: **org Admin 키(`sk-admin-`)** — 채팅 키로는 401/403.

---

## 핵심 함정: 내부 ledger ≠ provider billing API

- Settings의 LLM Access([0])가 현재 기본 실행 권한이다.
- External Usage의 기본 수치는 provider billing API가 아니라 내부 `llm_usage_ledger`다.
- 단, **Claude CLI** 카드만은 예외다. `llm_usage_ledger`가 아니라 `claude_session_snapshots`(호스트 전체 `~/.claude/projects/` 스캔, launcher 무관 — cmux/tmux/iterm 포함)에서 온다. ledger의 `claude_cli` 행은 이중집계 방지를 위해 CLAUDE_CLI 집계에서 제외된다(`external_usage_service._collect_internal_ledger_records`). `tmux_service.py`·`api/warp.py`의 claude_cli writer는 유지되나 그 값은 CLAUDE_CLI 카드에 반영되지 않는다.
- Settings에 등록하는 fallback/compatibility 키([2])는 **채팅용**이고 `/v1/models`로 검증된다.
- provider billing API([3])는 **Admin 키**(`sk-admin-`, org 스코프)를 요구한다.
- 채팅 키로 usage API를 치면 401/403이 발생하므로 [3]은 별도 테이블 + admin 전용 UI + **실제 usage 엔드포인트 verify**로 분리한다.

## 현재 상태 (2026-07-04 기준)

CLI 구독권 중심 전환이 적용되어 기본 사용량 source는 provider billing API가 아니라 내부 `llm_usage_ledger`다.

- Settings의 기본 LLM 화면은 `LLM Access`이며, CLI profile과 entitlement를 관리한다.
- `LLMAccountsSettings`의 사용자 API key는 fallback/compatibility 용도다.
- External Usage 화면은 `LLM Usage`로 동작하며 내부 ledger summary를 primary로 표시한다.
- provider billing collector와 deployment usage admin key는 optional reconciliation 비교용이다.
- 현재 구현 운영 절차는 `docs/guides/llm-cli-subscription-usage-guide.md`를 기준으로 한다.

## 후속 작업 (운영 정책/확장)

External Usage([3]) 관련 범위 밖 항목 + 리뷰 LOW:

1. **멀티-org (Option A)** — 현재 [3]은 배포당 단일-org(provider당 1키). 여러 독립 org를 서빙하려면 org별 테이블 + 요청별 컬렉터 팩토리 필요. `USE_DATABASE=true` + 권위적 org 멤버십 전제.
2. **`_proxy_records` 영속화** — legacy fallback deployment에서 [2] 프록시 인메모리 레코드가 재시작 시 손실될 수 있다. 기본 경로는 `llm_usage_ledger`지만, DB ledger 없이 proxy fallback만 쓰는 배포는 DB/Redis 이전 필요.
3. **Gemini usage 컬렉터** — [3]에 Gemini usage 수집기 없음(admin-keys CRUD도 gemini 제외). 신설 시 external_usage_service에 컬렉터 추가.
4. **`/sync` 인증 상향(리뷰 SEC-2, LOW)** — `/sync`가 `get_current_user`라 일반 사용자가 외부 API 호출 트리거 가능. 단 `/summary`도 collect를 트리거하므로 `/sync`만 게이팅으론 불충분 → 근본은 collection 캐싱/rate-limit(범위 큼).
5. **provider 약관 확인** — 단일 CLI subscription을 여러 AOS 사용자에게 위임하는 운영 모델은 provider 약관을 별도로 확인해야 한다.

## 작업 시작점 (빠른 참조)

| 하려는 것 | 시작 파일 |
|-----------|----------|
| AOS 에이전트 LLM 프로바이더 추가/변경 | `services/llm_service.py`, `config.py` |
| CLI profile/entitlement 관리 | `services/llm_access_service.py`, `api/llm_access.py`, `components/usage/LLMAccessSettings.tsx` |
| 내부 LLM 사용량 집계 | `services/llm_usage_ledger_service.py`, `api/llm_usage.py`, `stores/llmUsage.ts` |
| 채팅 프록시 provider/동작 | `api/llm_proxy.py`, `services/credential_service.py` |
| 채팅 키 Settings UI | `components/usage/LLMAccountsSettings.tsx`, `stores/llmCredentials.ts` |
| External Usage adapter/reconciliation | `services/external_usage_service.py`, `stores/externalUsage.ts`, `pages/ExternalUsagePage.tsx` |
| provider billing reconciliation key | `services/deployment_usage_credential_service.py`, `components/usage/AdminKeyManager.tsx`, `stores/deploymentUsageKeys.ts` |

풀스택 기능은 `aos-feature-harness` 스킬 사용. 백엔드 게이트: `ruff + mypy + pytest`(비동기 테스트는 CI/config에서 `asyncio_mode` 처리됨). 프론트 게이트: `tsc + eslint + vitest + build`.
