# LLM API Key Systems

AOS에는 **목적이 다른 3개의 독립된 LLM 키 시스템**이 있다. 서로 저장소·설정 주체·키 종류가 다르며, 특히 [2]와 [3]의 혼동이 External Usage "No data" 버그의 근원이었다. 새 세션이 이 영역을 만지기 전 반드시 이 문서를 읽을 것.

> 관련: `docs/architecture.md`(서비스 구조), `docs/api/monitoring.md`(External Usage API), `.env.example`(env 키).

## 한눈에

| # | 시스템 | 용도 | 저장 | 설정 주체 | 키 종류 |
|---|--------|------|------|----------|---------|
| 1 | 런타임 프로바이더 키 | AOS 에이전트/LangGraph가 LLM 호출 | `.env`(config) | 배포 운영자 | 채팅/추론 |
| 2 | 유저 채팅 프록시 키 | 사용자가 자기 키로 채팅 프록시 | `user_llm_credentials`(DB, 암호화) | 각 사용자 | 채팅/추론(`sk-proj-`) |
| 3 | 배포 usage admin 키 | External Usage 모니터링(org 사용량) | `deployment_usage_credentials`(DB, 암호화) | admin/manager | **org admin(`sk-admin-`)** |

공통: DB 저장 키는 `db/types.py`의 `EncryptedString`(AES-256-GCM)로 암호화. `ENCRYPTION_MASTER_KEY` 미설정 시 평문 폴백(주의 — [3]은 PR #139에서 fail-closed 처리).

---

## [1] 런타임 프로바이더 키

AOS의 에이전트/오케스트레이터가 **직접 LLM을 호출**할 때 사용.

- **설정** (`config.py`): `LLM_PROVIDER`(기본 `codex_cli`, 로컬 우선), `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY`, 모델 변수.
- **소비**: `services/llm_service.py` `create_llm()` → provider별 LangChain 모델(`ChatOpenAI`/`ChatAnthropic`/`ChatGoogleGenerativeAI`/`ChatOllama`/`CodexCliChatModel`) 생성, settings 키 주입. 라우팅/페일오버 `services/llm_router_service.py`.
- **범위**: 배포당 한 벌, 사용자 구분 없음. env로만 설정.

## [2] 유저 채팅 프록시 키

각 사용자가 등록한 키로 AOS가 외부 LLM에 **채팅 요청을 프록시**.

- **저장**: `db/models/llm.py` `UserLLMCredentialModel` — `user_id`별, `provider`+`key_name` 다중 허용.
- **서비스**: `services/credential_service.py` — CRUD, `get_raw_key(db, user_id, provider)`(복호화, 최신 active 1건), `_test_key`(verify는 `/v1/models`만 → 채팅 티어 유효성).
- **API**: `api/llm_credentials.py`, prefix `/api/users/me/llm-credentials` (CRUD + `/verify`). 인증 사용자 self-scoped.
- **UI**: `pages/SettingsPage.tsx` → `components/usage/LLMAccountsSettings.tsx` (store `stores/llmCredentials.ts`).
- **소비**: `api/llm_proxy.py`, prefix `/api/proxy`, `POST /chat/completions`. 헤더 `X-Provider`로 provider 선택 → `get_raw_key`로 키 → `PROVIDER_BASE_URLS`(openai/anthropic/google_gemini)로 프록시 + 사용량 `add_record`(인메모리 `_proxy_records`).
- **키 종류**: 일반 채팅 키(`sk-proj-`, `sk-ant-api-` 등).

## [3] 배포 usage admin 키 (PR #136에서 신설)

org 전체 사용량/비용을 읽는 **admin 키**. [1]·[2]와 완전 분리.

- **저장**: `db/models/llm.py` `DeploymentUsageCredentialModel` — provider당 1행(`UniqueConstraint(provider)`), 채팅 키 테이블과 물리 분리(→`get_raw_key` 오라우팅 차단).
- **서비스**: `services/deployment_usage_credential_service.py` — `resolve_admin_key(db, provider)`(우선순위: **활성 DB 키 > `EXTERNAL_*` env > None**), CRUD, `verify_deployment_key`(실제 usage 엔드포인트 호출로 `usage_capable` 판정, HTTP status만 관찰).
- **API**: `api/external_usage.py`, `/api/external-usage/admin-keys` (CRUD + `/verify`). **admin/manager만**(`api/deps.py` `get_current_admin_or_manager_user`). 조회 엔드포인트(`/summary`·`/sync`·`/providers`·`/health`)는 인증 필수.
- **UI**: External Usage 페이지 → `components/usage/AdminKeyManager.tsx` (store `stores/deploymentUsageKeys.ts`).
- **소비**: `services/external_usage_service.py`가 요청 시 `_build_collectors(db)`로 키 해석해 org usage API 호출(OpenAI `/organization/usage/completions`, Anthropic `usage_report/messages`, GitHub `copilot/metrics`). OpenAI는 `_COST_TABLE`로 비용 로컬 계산.
- **env 폴백**: `EXTERNAL_OPENAI_ADMIN_KEY`, `EXTERNAL_ANTHROPIC_ADMIN_KEY`, `EXTERNAL_GITHUB_TOKEN` + `EXTERNAL_GITHUB_ORG`.
- **키 종류**: **org Admin 키(`sk-admin-`)** — 채팅 키로는 401/403.

---

## ⚠️ 핵심 함정: [2] 채팅 키 ≠ [3] admin 키

- Settings에 등록하는 키([2])는 **채팅용**이고 `/v1/models`로 검증된다.
- org usage API([3])는 **Admin 키**(`sk-admin-`, org 스코프)를 요구한다.
- 둘은 **다른 종류의 키**다. 채팅 키로 usage API를 치면 401/403 → 컬렉터가 조용히 빈 결과 반환 → 대시보드 "No data".
- 그래서 [3]은 별도 테이블 + admin 전용 UI + **실제 usage 엔드포인트로 verify**하도록 설계됐다.

## 현재 상태 (2026-07-01 기준)

- **PR #136** (`feat/external-usage-admin-key-sourcing`) — 시스템 [3] 신설, **main에 머지 완료**.
- **PR #139** (`fix/external-usage-review-followup`) — 코드리뷰 findings 7건 수정, **리뷰 대기 중(미머지)**. 아래 결함들이 main엔 아직 존재, #139에서 수정:
  - 폼 A5 무력화(빈 키 편집/인라인 토글), github 배지 거짓말(`enabled=token`→`token AND org`), label 소실(부분 업데이트), 평문 저장 fail-closed, 마스킹 source 불일치, verify 오스탬프(active-only), payload immutability, verify 예외 키 미노출.
  - **주의**: main에서 이 영역을 만지면 #139와 충돌 가능 — 먼저 #139 머지 여부 확인.

## 후속 작업 (Open, 미착수)

External Usage([3]) 관련 범위 밖 항목 + 리뷰 LOW:

1. **멀티-org (Option A)** — 현재 [3]은 배포당 단일-org(provider당 1키). 여러 독립 org를 서빙하려면 org별 테이블 + 요청별 컬렉터 팩토리 필요. `USE_DATABASE=true` + 권위적 org 멤버십 전제.
2. **`_proxy_records` 영속화** — [2] 프록시 실시간 사용량이 인메모리 per-worker 리스트(재시작 시 손실, 멀티워커 분산). DB/Redis로 이전 필요. `total_cost_usd`가 proxy 레코드 제외하는 불일치도 함께.
3. **Gemini usage 컬렉터** — [3]에 Gemini usage 수집기 없음(admin-keys CRUD도 gemini 제외). 신설 시 external_usage_service에 컬렉터 추가.
4. **`/sync` 인증 상향(리뷰 SEC-2, LOW)** — `/sync`가 `get_current_user`라 일반 사용자가 외부 API 호출 트리거 가능. 단 `/summary`도 collect를 트리거하므로 `/sync`만 게이팅으론 불충분 → 근본은 collection 캐싱/rate-limit(범위 큼).

## 작업 시작점 (빠른 참조)

| 하려는 것 | 시작 파일 |
|-----------|----------|
| AOS 에이전트 LLM 프로바이더 추가/변경 | `services/llm_service.py`, `config.py` |
| 채팅 프록시 provider/동작 | `api/llm_proxy.py`, `services/credential_service.py` |
| 채팅 키 Settings UI | `components/usage/LLMAccountsSettings.tsx`, `stores/llmCredentials.ts` |
| External Usage 키/수집 | `services/deployment_usage_credential_service.py`, `services/external_usage_service.py` |
| External Usage admin UI | `components/usage/AdminKeyManager.tsx`, `stores/deploymentUsageKeys.ts` |

풀스택 기능은 `aos-feature-harness` 스킬 사용. 백엔드 게이트: `ruff + mypy + pytest`(비동기 테스트는 CI/config에서 `asyncio_mode` 처리됨). 프론트 게이트: `tsc + eslint + vitest + build`.
