# Integration QA Report — Provider별 Latency 노출 (DRY-RUN 경계면 교차검증)

> integration-qa 산출물. **제안된** 변경의 생산자(backend)↔소비자(frontend) 계약 정합성만 교차검증.
> `src/` 무수정. 모든 판정은 실제 파일:라인 증거로 뒷받침(프로포절 self-claim 전사 아님).
>
> 검증 입력: `B_backend_impl.md`, `B_frontend_impl.md`, `A_planner_plan.md`
> 실측 소스: `src/dashboard/src/components/llm-router/LLMRouterSettings.tsx`,
> `src/dashboard/src/components/llm-router/__tests__/LLMRouterSettings.test.tsx`,
> `src/backend/api/llm_router.py`, `src/backend/models/llm_router.py`,
> `src/backend/services/llm_router_service.py`

---

## 최종 판정: 🟢 PASS — FAIL 0건 / UNVERIFIED 0건

경계면 5개 항목 모두 정적 교차검증으로 계약 일치 확인. 런타임 깨짐을 유발하는 생산자↔소비자 불일치 **없음**.
경계면 교차 비교(grep 완전 열거·alias 부재·라우터 마운트 prefix 실측)는 전부 결론적 — UNVERIFIED 없음.
DRY-RUN 특성상 실제 `tsc --noEmit`/`pytest`만 미실행 → 각 PASS 항목에 **실행 게이트 각주**로 부기(아래).
별도로, 본 기능과 무관한 기존 잠재 버그 1건(`provider.name`)은 read 경로 밖이라 **경계면 비차단**으로 확정.

> **분류 기준(integration-qa.md 준수):** 🟢 PASS의 근거는 "경계면 교차 비교 결과"이지 "빌드 통과"가 아니다.
> 본 보고는 grep 완전 열거·Pydantic alias 부재·라우터 prefix 실측으로 교차 비교를 **결론적으로** 끝냈으므로
> PASS다. DRY-RUN이라 미실행된 `tsc`/`pytest`는 "정보 부족(🟡)"이 아니라 적용 시 통과를 확인할 **실행 게이트**
> — 각 PASS 항목 끝 `[실행 게이트]`에 명시한다. (빌드 통과를 PASS 근거로 삼지 않음.)

---

### 🔴 FAIL (경계면 불일치 — 런타임 에러 위험)

없음.

---

### 🟡 UNVERIFIED (교차 비교 불가 — 정보 부족)

없음. (5개 항목 모두 실제 파일:라인으로 결론적 교차 비교 완료. 미실행 `tsc`/`pytest`는 정보 부족이
아니라 각 PASS 항목의 `[실행 게이트]` 각주로 부기 — 정적 결론을 적용 시 재확인하는 절차일 뿐.)

---

### 🟢 PASS (계약 일치 확인 — 실측 교차검증)

- **[Item 1] 타입 매핑 일치 (int/float→number, None→null, snake_case 유지, unwrap 불필요).**
  - 생산자: 백엔드 제안 `last_latency_ms: int | None`, `avg_latency_ms: float | None`
    (`B_backend_impl.md` line 14, 45-46). 모델은 `LLMProviderConfig`(`models/llm_router.py:31`),
    `alias`/커스텀 직렬화 없음 → snake_case 그대로 노출.
  - 소비자: 프론트 제안 `last_latency_ms: number | null`, `avg_latency_ms: number | null`
    (`B_frontend_impl.md` line 43-44). 실측 `LLMRouterSettings.tsx:88` `fetchProviders(): Promise<LLMProvider[]>`,
    line 91 `return res.json()` — **변환 인터셉터 없음**. 응답을 그대로 배열로 기대(unwrap 불필요,
    백엔드도 `list[LLMProviderConfig]` 직접 반환).
  - TS는 `int|float`를 모두 `number`로, Python `None`을 `null`로 받음 → 매핑 정합. 기존 형제 필드
    (`cost_per_1k_input: number`, `last_health_check: string | null`, `LLMRouterSettings.tsx:45,49`)와
    동일한 snake_case 관례 — 일관성 확인.
  - `[실행 게이트]` 적용 시 `pytest`로 `GET /api/llm-router/providers` 응답에 `last_latency_ms`/
    `avg_latency_ms` 키가 snake_case·`int|null`/`float|null`로 실재함을 재확인(정적 결론의 런타임 확정).

- **[Item 2] provider별 `avg_latency_ms` ↔ 전역 `average_latency_ms` 혼동 없음 (양쪽 정확 구분).**
  - 백엔드: provider별 `avg_latency_ms`는 `LLMProviderConfig`에 추가, 전역 `average_latency_ms`는
    `LLMRoutingStats`(`models/llm_router.py:161`, 실측 `average_latency_ms: float = 0.0`)로 **별개 클래스**.
    백엔드 제안이 무변경 명시(`B_backend_impl.md` line 17, 56).
  - 프론트: provider별은 `interface LLMProvider`에 추가, 전역은 `interface RouterStats.average_latency_ms`
    (실측 `LLMRouterSettings.tsx:78`)로 별개 인터페이스. 렌더도 분리 — stats 평균은 line 335
    `{stats.average_latency_ms.toFixed(0)}ms` (무수정), provider Last/Avg는 신규 확장 셀.
  - 접두사(`avg_` vs `average_`)·소속(provider vs stats) 양측 모두 정확히 구분 — 혼동 0.

- **[Item 3] 요청 경로 일치 (`/api/llm-router/providers`).**
  - 소비자 실측: `LLMRouterSettings.tsx:86` `const API_BASE = import.meta.env.VITE_API_URL || '/api'`,
    line 89 `fetch(`${API_BASE}/llm-router/providers`)` → dev/기본값에서 `/api/llm-router/providers`.
  - 생산자 실측: `api/llm_router.py:20` `APIRouter(prefix="/llm-router")` + line 28
    `@router.get("/providers")`. app 마운트 prefix **실측 확인**: `api/app.py:546`
    `app.include_router(llm_router, prefix="/api")` → 최종 경로 `/api` + `/llm-router` + `/providers`
    = `/api/llm-router/providers` (추론 아님, 실측).
  - 경로 일치 확인. (참고: `VITE_API_URL`이 `/api` 없는 순수 호스트로 설정된 prod 환경에선 경로가
    어긋날 수 있으나, 이는 본 기능이 도입한 게 아니라 동일 컴포넌트의 모든 형제 호출
    `/llm-router/config|health|stats|...`이 공유하는 **기존 패턴** — 본 기능 경계면 회귀 아님.)

- **[Item 4 ★] fixture fan-out = 0 — 프론트의 두 근거 모두 실측 참 + advisor 보강 위험도 반증.**
  - **근거(a) 비-export 확인**: `LLMRouterSettings.tsx:35` `interface LLMProvider {` — **`export` 키워드
    없음**(실측). 모듈 로컬 → 외부 모듈이 `: LLMProvider`로 annotate 불가.
  - **다른 곳 import 없음 확인**: `grep -rn "LLMProvider" src/dashboard/src` 실행 결과, 이 `interface
    LLMProvider`를 참조하는 곳은 **선언 파일 내부 3곳뿐** (line 35 선언, 88 `Promise<LLMProvider[]>`,
    178 `useState<LLMProvider[]>([])`). 둘 다 안전(반환 타입 + 빈 배열 init — full-field 객체 리터럴 아님).
  - **동명 무관 타입 분리 확인(프론트 주장 검증)**: 다른 파일의 `LLMProvider`는 전부 **별개 문자열 union**
    (`stores/settings.ts:5`, `stores/orchestration/types.ts:96`)이며 그 소비처
    (`MemberDetailPanel.tsx:28`, `CostMonitor.tsx:5`, `SettingsPage.tsx:2`, `index.ts:7`,
    `wsConnection.ts:4`)는 전부 무관 — 프론트 문서의 red-herring 주장 **실측 일치**.
  - **advisor 보강 위험 반증**: 비-export는 *크로스모듈*만 차단. 파일 *내부*의 full-field `: LLMProvider`
    리터럴은 별도 위험 → `grep -nE ": LLMProvider|as LLMProvider|<LLMProvider"`로 직접 확인.
    매칭은 line 88·178뿐(둘 다 안전 형태), full-field 리터럴 **0건**.
  - **근거(b) mock 미주석 확인**: `__tests__/LLMRouterSettings.test.tsx:30-46` `mockProvider`는
    `(overrides?: Record<string, unknown>) => ({...})` — **반환 타입 미주석**, plain object literal.
    인터페이스로 제약되지 않으므로 non-optional 필드 2개 추가해도 구조 비교 미발생 → tsc 무영향.
  - 결론: non-optional 필드 추가에도 갱신 필수 픽스처 **0개**. 계획서의 "타입된 full-field 픽스처가
    tsc를 깬다" 가정은 이 코드베이스에 해당 픽스처가 없어 전제 불성립 — 프론트 정정이 옳음.
  - `[실행 게이트]` fan-out=0은 grep 완전 열거로 결론적(이 역할이 픽스처 fan-out에 규정한 방법 그대로).
    적용 시 `cd src/dashboard && npx tsc --noEmit` exit 0으로 런타임 확정(정적 결론의 재확인 절차).

- **[Item 5] 백엔드 보고 이슈 2건 모두 경계면 계약 **비차단** 확정.**
  - **(5-1) masking 오염 + `model_copy` 해결**: 실측 `services/llm_router_service.py:65` `get_provider`는
    `_providers.get()` **live 참조 반환**, line 68~ `list_providers`도 live values 반환.
    `api/llm_router.py:33-35`(GET 핸들러)가 `p.api_key = "***..."`로 **in-place 마스킹** → 저장
    객체 영구 오염되는 기존 잠재 버그가 실재함을 확인. 백엔드 제안의 `model_copy(update=...)` 사본 반환
    (`B_backend_impl.md` line 84-95)이 이를 부수 해결 — **경계면 계약에는 긍정적 영향만**(프론트가 받는
    JSON shape 불변, 마스킹 동작 동일, 원본 무오염). 경계면 위험 없음.
  - **(5-2) `provider.name` 부재 버그 — read 경로 밖, 비차단 확정**: `LLMProviderConfig`에 `name` 필드
    **없음** 실측(`models/llm_router.py:31` 클래스에 `api_key`(37) 등은 있으나 `name:` 없음).
    `provider.name` 참조는 `grep` 결과 **`api/llm_router.py:47` 단 1곳**, 이는 `create_provider`
    (**POST** `/providers`, line 39-52)의 `AuditService.log` metadata 안. 본 기능이 확장하는 **GET**
    `/providers`(line 28-36)·GET `/providers/{id}`(line 55-64) read 경로에는 `provider.name` 참조
    **전무**(해당 핸들러는 `p.api_key`만 접근). 즉 이 버그는 별도 엔드포인트(생성)에서만 발현하며 본
    latency 노출 경계면을 깨뜨리지 않음 → **비차단**. (계획서 line 34-35의 "범위 외" 분류가 경계면
    관점에서 정당함을 read-path 위치로 실측 확인.)

---

## 양쪽 에이전트 공통 영향 (리포트 명시)

- 경계면 계약(`last_latency_ms`/`avg_latency_ms`, snake_case, `int|null`/`float|null`→`number|null`)은
  **backend·frontend 양측 모두**가 동일 키·동일 nullable로 합의 — 한쪽만 바꾸면 즉시 깨지는 지점.
  적용 시 두 에이전트가 키 철자·nullable·snake_case를 1:1로 유지해야 함.
- **양측 실행 게이트**(정적 PASS의 런타임 재확인): frontend `tsc --noEmit` exit 0,
  backend `pytest`(응답 JSON 키 snake_case·nullable 검증). DRY-RUN 종료 후 실제 적용 시 필수.
  UNVERIFIED는 없음 — 경계면 교차 비교는 정적으로 결론났고, 게이트는 적용 시 확정 절차일 뿐.

## 비차단 참고 (경계면 외 — 후속/무수정)
- `record_request_result` 자동 배선 부재(`A_planner_plan.md` line 9, `B_backend_impl.md` line 179-180):
  `_latency_tracker`가 `/record` 수동 호출 전엔 비어 두 필드 `null` 노출. 프론트는 `?? '—'`로 정상 처리
  (`B_frontend_impl.md` line 68) → 경계면 정합. 데이터 자동화는 범위 외(후속).

---

[LEARNING:integration-qa] boundary: DRY-RUN 프로포절 검증 시 self-claim 전사 금지 — 비-export 주장도 실제 grep으로 반증해야. 비-export는 크로스모듈만 차단하므로 파일 *내부* full-field `: T` 리터럴은 별도 grep 필요.
[LEARNING:integration-qa] api-contract: "범위 외" 플래그된 기존 버그(provider.name)도 경계면 차단 여부는 별도 판정 필요 — 핸들러 위치(GET read path vs POST create path)를 실측해 read 경로 밖이면 비차단으로 확정.
