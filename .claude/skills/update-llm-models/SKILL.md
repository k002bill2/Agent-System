---
name: update-llm-models
description: "AOS LLM 모델 레지스트리 갱신 절차 스킬. '새 LLM 모델 추가해줘', '모델 버전 업데이트', '모델 가격 변경', 'sonnet/opus/haiku/gpt/gemini 신모델 나왔어', '신모델로의 default 교체', '모델 레지스트리 갱신', 'claude-*-5 추가' 등 LLM 모델 스펙(_MODELS)·가격표·context 한도를 건드리는 요청에는 반드시 이 스킬을 사용하라. provider별 가격표 매트릭스 동반 갱신·prefix 순서·per-1k 단위 등 누락 시 $0 정산/과소 집계가 발생하는 함정이 많다. 단, 이미 등록된 **enabled** 모델 간 default만 전환하는 요청은 이 스킬 없이 PATCH /api/llm/models/{id} {\"is_default\": true} 안내로 충분하다 (disabled 모델을 default로 만들려면 가격 검증 후 is_enabled:true도 함께 필요 — get_default()는 enabled만 검색한다)."
---

# Update LLM Models

AOS의 LLM 모델 레지스트리(SSOT: `src/backend/models/llm_models.py` `_MODELS`)에 신모델을 추가하거나 스펙·가격을 갱신하는 검증된 절차. 2026-07-11 claude-sonnet-5 추가 세션에서 실측하고 Codex 리뷰 3라운드를 통과한 절차이므로 임의로 단계를 생략하지 말 것.

## 페르소나 규칙 (프로젝트 규칙 — 필수)

- 구현(코드 수정·테스트 작성)은 **worker(Opus) 위임**이 기본값. 조언자는 이 스킬을 브리프로 삼아 worker에게 단계·완료 기준·시도 상한을 전달한다.
- worker의 "완료" 보고를 그대로 믿지 않는다. **Codex 검증**(`/codex:review`)을 통과했을 때만 승인 (아래 8단계).
- 예외: 단일 파일 30줄 이내 문서·설정 수정만 조언자 직접 처리 가능 — 이 스킬의 범위(다중 파일 코드 변경)는 예외에 해당하지 않는다.

## 사전 확인 (mandatory-docs)

수정 전 Read 필수: `docs/architecture.md`(백엔드), `docs/llm-key-systems.md`(LLM 키/usage), API 변경 시 `docs/api-reference.md`. 프론트 미러(settings.ts)를 건드리므로 `docs/dashboard.md`도 읽는다.

## 0. 신모델 스펙 확정

- **Anthropic 모델: 모델 ID를 절대 추측하지 말 것.** `claude-api` 스킬(공식 모델표) 또는 https://platform.claude.com/docs/en/about-claude/models/overview.md 로 정확한 ID·가격($/1M)·context window를 확인한다.
  - 왜: LLM이 기억으로 지어낸 모델 ID는 프록시 라우팅·정산 전체를 오염시킨다.
- **자동 발견과 수동 추가의 역할 구분:** `model_update_service`(24h 폴링, 수동 트리거는 `POST /api/llm/models/check-updates`)는 Anthropic·OpenAI·Google 3사 모두의 provider API를 폴링해 신모델을 `is_enabled=False`·가격 0으로 DB insert한다 (admin이 활성화+가격 입력). **Google/OpenAI는 원칙적으로 이 자동 발견에 맡기고**, Anthropic은 정확한 가격·context를 코드 레벨 SSOT(`_MODELS`)에 넣어야 하므로 이 스킬의 수동 절차를 적용한다. Google/OpenAI도 사용자가 명시적으로 코드 레벨 추가를 원하면 동일 절차 적용.
  - **자동화 전제 조건:** 24h 폴링 태스크는 `USE_DATABASE=true`에서만 기동되고(`api/app.py` lifespan, ~304행 `if USE_DATABASE:`), 폴링 자체도 해당 provider의 API key가 env에 설정된 경우만 수행된다(`model_update_service.py` `check_all_providers`, ~320행 — 키 없는 provider는 skip). 자동 발견에 맡기기 전에 이 두 조건을 확인하라.
- **가격 단위 주의: 공식 가격은 $/1M tokens, AOS 테이블은 전부 per-1k.** 예: $3/$15 → `0.003`/`0.015`.
  - 왜: 단위 혼동 시 1000배 과대/과소 정산 — 이 절차에서 가장 흔한 실수.
- **티어 열 주의: 공식 가격표는 한 모델에 Standard / Batch / Flex / Cached 를 나란히 싣는다. AOS 가 쓰는 값은 Standard 뿐이다.**
  - 실사례(2026-09-08 교정): `o4-mini` 가 `$0.55/$2.20` 으로 등록돼 있었는데 이는 **Batch·Flex 단가**였고 표준은 `$1.10/$4.40` — 표준 사용분을 2배 과소 집계했다.
  - 왜 안 걸리나: 오차가 정확히 2배라 per-1k 환산 자릿수 검산(위 항목)으로는 통과한다. 검색 요약도 출처마다 열이 갈려 같은 모델에 두 값이 동시에 나온다.
  - 어떻게: 1차 출처(https://developers.openai.com/api/docs/pricing, https://ai.google.dev/gemini-api/docs/pricing)에서 **행 전체를 열 이름째 인용**한 뒤 Standard 열만 옮긴다. 검색 스니펫으로 옮기지 않는다.
  - **날짜 조건부 가격도 같은 계열이다.** 예: Gemini 3.8 Flash 는 `$0.75/$3.75` 이지만 공식 표에 "through December 31, 2026 / $1.50·$7.50 starting January 1, 2027" 로 적혀 있다(2026-09-08 확인). `_MODELS` 는 시점 가격만 담으므로 **발효일에 갱신이 필요하다** — 옮길 때 발효 조건이 붙어 있는지 확인하고, 붙어 있으면 행 주석에 남긴다.

## 1. SSOT 갱신: `src/backend/models/llm_models.py` `_MODELS`

- **기존 항목 절대 삭제 금지** (과거 정산 근거 + 아직 서비스 중인 세션 존재). 신규 `LLMModelConfig`를 sibling 항목 관례(필드 순서·주석 스타일)에 맞춰 추가한다.
- **is_default 이관 규칙 (enabled default 존재 여부로 갈린다):**
  - 기존 DB에 **enabled default가 있으면**: 신규 모델은 `sync_to_db`의 이중-default 가드에 의해 demote되어 `is_default=False`로 INSERT된다 → default 전환은 admin 수동 절차(9단계) 필요.
  - 기존 DB에 **enabled default가 없으면** (default 행이 아예 없거나 disabled뿐이면): 신규 코드 default가 그대로 `is_default=True`로 적용되고, 잔존 disabled default 행은 UPDATE의 SQL WHERE(`is_enabled IS FALSE`)로 클리어된다.
  - 왜: 운영 중 admin이 고른 default를 코드 배포가 임의로 뒤집으면 안 되기 때문 (설계 의도).
- `USE_DATABASE=true`면 startup lifespan이 `sync_to_db()`를 실행하므로(`api/app.py` ~171행 `if USE_DATABASE:` 블록, 이후 12h 주기 재동기화 태스크 포함) **이 파일 수정 + 백엔드 재시작만으로 DB 전파**된다. 별도 마이그레이션 불필요. `USE_DATABASE=false`(DB 미사용) 배포에서는 sync가 아예 돌지 않고 in-memory `_MODELS`가 그대로 서빙된다.

## 2. 가격표 동반 갱신 — provider × 경로 매트릭스 (신모델마다 확인 필수)

prefix 불일치·ID 누락 시 $0 정산 또는 오정산이 조용히 발생한다. **provider에 따라 갱신할 테이블 조합이 다르다**:

| Provider | 갱신 대상 가격표 |
|----------|----------------|
| Anthropic | ① llm_proxy `COST_TABLE` + ② `AnthropicUsageCollector` costs + ③ claude_session `MODEL_COSTS` — **3곳** |
| OpenAI (코드 레벨 추가 시) | ① llm_proxy `COST_TABLE` + ④ `OpenAIUsageCollector._COST_TABLE` |
| Google | ① llm_proxy `COST_TABLE` |

**prefix 테이블 두 가지 추가 함정 (2026-09-08 실사례):**
- **generic 행은 SSOT 미등재 변종까지 삼킨다.** `("o3", ...)` 하나만 넣으면 `o3-mini`·`o3-pro` 도 o3 단가로 청구된다(외부 usage 수집은 레지스트리 밖 id 를 그대로 받는다). 신규 행이 generic 이면 그 family 의 실재 변종을 조사해 구체 행을 **앞에** 함께 넣어라. 넣을 단가의 출처가 없으면 넣지 말고 PR 본문에 남긴다.
- **표에 행이 있어도 응답에서 모델 id 를 못 읽으면 무효다.** `llm_proxy._extract_usage` 가 provider 별로 다른 필드를 읽는다 — OpenAI/Anthropic 은 top-level `model`, **Gemini 는 `modelVersion`**(공식 `GenerateContentResponse` 에 top-level `model` 이 없다). 새 provider 를 붙일 때 이 추출 경로를 함께 확인하지 않으면 표를 다 채워도 계속 $0 이다.

각 테이블의 위치·매칭 방식 (행번호는 2026-07-11 기준 앵커 — 드리프트 시 심볼로 검색):

1. `src/backend/api/llm_proxy.py` `COST_TABLE`(~42행) — **startswith 선착 매칭**
   - 기존 generic prefix가 신모델과 매칭되고 가격도 정확히 일치할 때만 항목 추가를 생략할 수 있다 (반드시 매칭·가격을 확인). family 신설 또는 같은 family 내 가격 변동이면 구체 prefix 항목을 추가한다.
   - startswith 순회라 **삽입 순서 의존** — 구체 prefix(`claude-opus-4-8`)를 generic(`claude-opus-4`)보다 **앞에** 둔다.
   - 왜: startswith는 선착 매칭이라 generic이 앞에 있으면 구체 모델이 generic 가격으로 잘못 매칭된다.
2. `src/backend/services/external_usage_service.py` `AnthropicUsageCollector.collect`의 `costs` dict(~583행) — **startswith 선착 매칭** (dict 삽입순 = 매칭순)
   - llm_proxy와 동일 규칙(구체 prefix 먼저, 동일 적용 조건)으로 미러. **unlisted → $0 폴백은 의도된 동작 — 변경 금지.**
3. `src/backend/models/claude_session.py` `MODEL_COSTS`(~222행) — **정확-ID 조회** (`calculate_cost`가 레지스트리가 아닌 `MODEL_COSTS.get`을 직접 사용)
   - **신규 ID는 예외 없이 추가한다** (기존 family 여부 무관). 누락 시 sonnet 가격으로 폴백되어 오집계된다 — 신모델이 sonnet보다 비싸면 과소, 싸면 과대 집계.
   - **기존 정확-ID 모델의 가격이 변경된 경우에도 여기 기존 값을 반드시 갱신한다** — 레지스트리(`_MODELS`)만 고치면 이 테이블은 구 가격으로 남는다.
4. `src/backend/services/external_usage_service.py` `OpenAIUsageCollector._COST_TABLE`(~344행) — **startswith 선착 매칭** (구체 prefix를 앞에 배치, 예: `gpt-4o-mini`가 `gpt-4o`보다 앞)
   - OpenAI 모델을 코드 레벨로 추가/가격 변경할 때만 해당. **unlisted → $0 폴백은 의도된 동작 — 변경 금지.**

## 3. context 한도: `src/backend/models/context_usage.py`

- `get_context_limit()`이 `LLMModelRegistry`를 우선 조회하므로 **레지스트리(1단계)에 등록한 모델은 추가 작업 불필요**.
- `PROVIDER_CONTEXT_LIMITS` dict는 레지스트리에 없는 legacy ID 폴백 전용 — 신모델을 여기에 넣지 않는다.

## 4. 프론트 미러: `src/dashboard/src/stores/settings.ts`

- `fallbackModels`(provider별 id 목록)과 `fallbackDefaultModelIds`(백엔드 is_default 미러)를 `_MODELS`와 동기화한다.
  - 왜: API 장애 시 오프라인 폴백용 수동 미러라 자동 동기화가 없다 — 여기를 빼먹으면 장애 시 신모델이 드롭다운에서 사라진다.
- **enabled 모델만 `fallbackModels`에 추가한다** — `is_enabled=False`로 등록한 모델(예: gpt-5.x 계열)은 제외. 프론트 폴백 빌더가 모든 항목을 `available: true`로 노출하기 때문에, disabled 모델을 넣으면 장애 시 선택 불가능한 모델이 선택 가능한 것처럼 보인다.

## 5. 테스트

- `tests/backend/test_llm_model_registry.py`: 신모델 존재·스펙·default 해석, 가격 prefix 매칭(구체 vs generic 순서), `calculate_cost` 정확값.
  - **이미 있는 불변식이 먼저 RED 로 잡아준다** (2026-09-08 추가): `TestCostTableRegistryDrift`(`_MODELS` 전수 ↔ 두 비용표, `is_enabled` 무관), `TestCostTablePrefixOrdering`(구체 prefix 가 generic 뒤에 오면 실패), `TestDashboardFallbackMirror`(`settings.ts` 미러 집합 비교), `TestOpenAIStandardTierPricing`(Batch 단가 복귀 감지). 2단계·4단계를 빼먹으면 여기서 실패하므로, 실패 메시지의 모델 id 를 보고 어느 표가 빠졌는지 판단하라.
  - 새로 단가를 단언할 때 **입력·출력 토큰 수를 다르게 준다**(예: 1000/3000). 같은 수면 비용이 `in+out` 대칭 합이라 두 단가를 뒤바꿔 적은 전치 오류가 그대로 통과한다(실측).
  - **신규 async 테스트는 `@pytest.mark.asyncio` 명시를 관례로 유지하라.** `src/backend/pyproject.toml`에 `asyncio_mode=auto`가 있으나, pytest rootdir이 repo 루트로 해석되는 실행 경로에서는 이 설정이 적용되지 않아 CI "async not supported"로 실패한 실사례가 있다. auto가 적용되는 환경에서도 marker는 무해하므로 항상 붙인다.
- `src/dashboard/src/stores/__tests__/settings.test.ts`: fallback 목록/default 검증을 갱신.

## 6. 게이트 (전부 fresh 실행 — 이전 실행 결과는 증거 불인정)

백엔드:
```bash
cd src/backend && .venv/bin/ruff check . && .venv/bin/mypy . --ignore-missing-imports --no-error-summary && .venv/bin/pytest ../../tests/backend -q
```

프론트:
```bash
cd src/dashboard && npx tsc --noEmit && npm run lint && npm test -- --run && npm run build
```

- 알려진 플레이크: `test_rag_verification.py::test_embedding_model_consistency`는 로컬 `.env` 의존 pre-existing — `-k`로 제외 가능.

런타임 스모크 (Evidence-Based Completion — 코드 테스트만으로는 DB 전파를 증명 못 함):
- 백엔드 재시작 (`--reload` 미사용이면 수동 재시작 필요) 후 시작 로그의 `llm_model_sync` inserted 수 확인.
- `GET /api/llm/models` 응답에 신모델 ID가 존재하는지 확인. is_default 기대값은 1단계 규칙을 따른다: 기존 DB에 **enabled default가 있으면** `is_default: false`가 정상(demote), **enabled default가 없으면**(없거나 disabled뿐) 신규 코드 default가 `is_default: true`로 들어오는 것이 정상.

## 7. 문서 동기화 (mandatory-docs)

- `docs/api/llm.md`: 모델 예시 JSON, is_default 마이그레이션 주의사항.
- `docs/dashboard.md`: settings 스토어 행.
- `docs-sync` 에이전트(`.claude/agents/docs-sync.md`)를 활용해도 좋다.

## 8. Codex 독립 리뷰 (필수 게이트)

- `/codex:review`로 worker 결과를 검증. 집중 검토 포인트:
  - 과금 단위 (per-1k vs per-1M)
  - COST_TABLE prefix 순서 (구체 → generic)
  - 이중-default 가드 동작 (enabled DB default 보존, disabled default 클리어)
  - 경계 계약 (백엔드 `_MODELS` ↔ 프론트 fallback 미러 일치)
- 지적사항 반영 지시 → 통과 시에만 승인.

## 9. 커밋/PR + 배포 후 안내

- `feature/` 브랜치에서 작업. **명시적 `git add <파일>` (`git add .` 금지)**, Conventional Commits 형식.
- **기존 DB에 enabled default가 있으면 배포 후 default 전환은 자동으로 되지 않는다 (설계임 — 1단계 이관 규칙 참조).** 이 경우 사용자에게 안내:
  - Settings → LLM Access 카드 → Default model 드롭다운, 또는
  - `PATCH /api/llm/models/{id}` body `{"is_default": true}`
  - 로 admin이 직접 전환해야 한다.

## 완료 기준 체크리스트

- [ ] 모델 ID를 공식 소스(claude-api 스킬 / platform.claude.com 모델표)로 확인 (추측 금지)
- [ ] 가격을 per-1k로 환산해 입력 ($/1M ÷ 1000)
- [ ] 공식 가격표의 **Standard 열**에서 옮겼는지 확인 (Batch/Flex/Cached 아님 — 오차가 2배라 단위 검산으로 안 걸린다)
- [ ] `_MODELS`에 신규 항목 추가, 기존 항목 삭제 없음
- [ ] 가격표 매트릭스(2단계) 확인: provider별 대상 테이블에서 prefix 테이블은 매칭·가격 검증(필요 시 구체 prefix를 generic보다 앞에 추가), `MODEL_COSTS`는 신규 정확 ID 무조건 추가 + **기존 ID 가격 변경 시 기존 값도 갱신**
- [ ] `settings.ts` `fallbackModels` + `fallbackDefaultModelIds` 동기화 (enabled 모델만 추가)
- [ ] 백엔드/프론트 테스트 갱신 (async 테스트에 `@pytest.mark.asyncio`)
- [ ] 백엔드 게이트 fresh 통과: `cd src/backend && .venv/bin/ruff check . && .venv/bin/mypy . --ignore-missing-imports --no-error-summary && .venv/bin/pytest ../../tests/backend -q`
- [ ] 프론트 게이트 fresh 통과: `cd src/dashboard && npx tsc --noEmit && npm run lint && npm test -- --run && npm run build`
- [ ] 런타임 스모크: 백엔드 재시작 후 `GET /api/llm/models`에 신모델 존재 확인
- [ ] `docs/api/llm.md`·`docs/dashboard.md` 동기화
- [ ] generic prefix 행을 추가했다면 그 family 의 실재 변종에 구체 행을 앞에 배치 (없으면 PR 본문에 기록)
- [ ] `/codex:review` 통과 (지적사항 반영 완료)
- [ ] 기존 DB에 enabled default가 있는 경우 default 전환은 admin 수동 절차임을 사용자에게 안내
