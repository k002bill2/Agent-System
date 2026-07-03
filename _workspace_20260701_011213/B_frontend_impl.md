# Frontend Implementation Proposal (DRY-RUN): Provider별 Latency 표시

> web-ui-specialist 산출물. **제안(proposal)만** — `src/` 아래 어떤 파일도 수정하지 않음.
> 입력 계약: `_workspace/A_planner_plan.md` (LOAD-BEARING API 계약).

## 소비 API 계약 (확정)

| 항목 | 값 |
|------|-----|
| 엔드포인트 | `GET /api/llm-router/providers` (기존, 확장. 신규 엔드포인트 ✗) |
| 호출 위치 | `LLMRouterSettings.tsx:88-92` `fetchProviders()` → `${API_BASE}/llm-router/providers` |
| 응답 형태 | `LLMProvider[]` (배열) |
| **신규 provider 필드** | `last_latency_ms: number \| null`, `avg_latency_ms: number \| null` |
| 케이스 | **snake_case** 그대로. camelCase 변환 금지 (프로젝트의 다른 API 타입과 동일 관례 — 기존 `cost_per_1k_input`, `last_health_check` 등 모두 snake_case 유지) |

### ⚠️ 필드명 구분 (integration-qa 체크포인트 — load-bearing)
- **Provider별**: `avg_latency_ms` (단수 avg, 신규 추가 대상)
- **전역 Stats**: `average_latency_ms` (기존, `interface RouterStats` line 78 / 렌더 line 335) — **무수정·무손상**

두 필드는 이름·소속 인터페이스가 다르다. provider→`avg_latency_ms`, stats→`average_latency_ms`. 혼동 금지.

---

## 파일: `src/dashboard/src/components/llm-router/LLMRouterSettings.tsx`

### 변경 1 — `interface LLMProvider`에 필드 추가

**위치**: `LLMRouterSettings.tsx:35-50` (`interface LLMProvider`, 마지막 멤버 `last_health_check` 다음)

**Before** (line 47-50):
```tsx
  status: ProviderStatus
  consecutive_failures: number
  last_health_check: string | null
}
```

**After**:
```tsx
  status: ProviderStatus
  consecutive_failures: number
  last_health_check: string | null
  last_latency_ms: number | null
  avg_latency_ms: number | null
}
```

- 계약 준수: snake_case 키, `number | null` (계약이 `| null`이므로 non-optional).
- 기존 `RouterStats.average_latency_ms`(line 78)는 **건드리지 않음**.

### 변경 2 — 확장 패널 그리드에 latency 행 추가

**위치**: `LLMRouterSettings.tsx:451-478` 확장 상세 그리드. 4번째 셀(Failures, line 469-477)의 닫는 `</div>` 다음, 그리드 컨테이너 `</div>`(line 478) 직전에 신규 셀 삽입.

**컨텍스트** — 현재 그리드 컨테이너:
```tsx
<div className="grid grid-cols-2 gap-3 text-sm">
  ... Timeout / Retries / Cost / Failures (4 cells) ...
</div>
```

**삽입할 신규 셀** (Failures 셀 직후, 그리드 닫기 직전):
```tsx
                      <div className="col-span-2 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-500 dark:text-gray-400">Last/Avg:</span>
                        <span className="text-gray-900 dark:text-white">
                          {provider.last_latency_ms ?? '—'}ms / {provider.avg_latency_ms?.toFixed(0) ?? '—'}ms
                        </span>
                      </div>
```

#### 결정 포인트 — 그리드 배치 (taste, 명시 surface)
- **채택: `col-span-2` (full-width 행)**. 사유: (a) 지시가 "latency **행** 추가"이고 Last/Avg 합산 텍스트가 단일 셀보다 넓다. (b) 현 그리드는 `grid-cols-2`+4셀(2행). 5번째 셀을 일반 셀로 넣으면 3행 좌측만 차고 우측 1셀이 비어 비대칭. `col-span-2`로 전체 폭을 채워 깔끔한 1행 확보.
- **대안 (미채택)**: `col-span-2` 없이 평범한 셀 → 3행 우측 빈칸 비대칭 발생. 권장하지 않음.

#### 표기 형식 (계약 그대로 — literal)
- `{provider.last_latency_ms ?? '—'}ms / {provider.avg_latency_ms?.toFixed(0) ?? '—'}ms`
- `null`/`undefined` → `—` 플레이스홀더 (`??` 사용).
- `avg`는 소수 발생 가능 → `.toFixed(0)`으로 정수화 (값이 null이면 `?.` 단락 → `'—'`).
- **관찰(observation, 무수정)**: `ms`가 `??` 바깥이라 null일 때 `—ms / —ms`로 렌더됨. 계약이 그렇게 지시하므로 그대로 구현. "고치지" 않음.

#### 스타일 일관성 (Quality Gates 준수)
- `Clock` 아이콘 **재사용** (이미 line 24에서 import됨, Timeout 셀에서도 사용 중). 신규 import 불필요.
- 셀 내부 클래스는 기존 셀과 동일: `flex items-center gap-2`, 라벨 `text-gray-500 dark:text-gray-400`, 값 `text-gray-900 dark:text-white`.
- **다크모드 무손상**: 모든 색상 클래스에 `dark:` prefix 유지 (기존 셀과 1:1 동일).
- 그리드 컨테이너(`grid grid-cols-2 gap-3 text-sm`)·배경(`bg-gray-50 dark:bg-gray-900/50`) 무수정.

---

## 테스트 픽스처 영향 — 전체 열거

### tsc 영향: **없음 (0개 픽스처 수정 필요)**

근거 (executed evidence 아님 — DRY-RUN이므로 **추론 기반 예측**):

1. **`interface LLMProvider`는 export되지 않음** (`LLMRouterSettings.tsx:35`, 모듈 로컬). 따라서 외부 모듈이 이 인터페이스로 annotate 불가 → llm-router 스코프 grep이 **구조적으로 완전**. 컴포넌트 외부에 `: LLMProvider` 픽스처가 존재할 수 없음.
2. 유일한 픽스처 `mockProvider()` (`__tests__/LLMRouterSettings.test.tsx:30-46`)는 **타입 미주석** 함수. `Record<string, unknown>` overrides를 plain object literal에 spread → 반환 타입이 **추론(inferred)**되며 `LLMProvider`로 제약되지 않음. `json: async () => [mockProvider()]`를 `as Response`로 캐스팅해 전달하므로 인터페이스와 구조 비교가 일어나지 않음.
3. 따라서 non-optional 필드 2개를 추가해도 기존 픽스처/기존 테스트는 tsc를 깨뜨리지 않음.

> **계획서의 조건부 경고 정정**: 계획 [Frontend] 주의사항은 "`: LLMProvider`로 타입된 전체-필드 픽스처가 tsc를 깬다"고 가정했으나, **그런 픽스처는 이 코드베이스에 존재하지 않는다** (인터페이스 비-export + 유일 mock 미주석). 경고의 전제가 성립하지 않으므로 영향 픽스처 = 0.

### 혼동 주의 — 무관한 동명 타입 (수정 대상 아님)
다음 파일들의 `LLMProvider`는 **별개의 문자열 union 타입**으로, 이 컴포넌트의 `interface LLMProvider`와 무관하며 영향 없음:
- `src/dashboard/src/stores/settings.ts:5` — `type LLMProvider = 'anthropic' | 'openai' | ...`
- `src/dashboard/src/stores/orchestration/types.ts:96` — `type LLMProvider = 'google' | 'anthropic' | ...`
- 위 타입을 소비하는 `CostMonitor.tsx`, `MemberDetailPanel.tsx`, `SettingsPage.tsx`, `settings.test.ts`, `SettingsPage.test.tsx` 등 — **전부 무관**.

### 선택적(optional) 픽스처 갱신 — 신규 테스트 작성 시에만
`mockProvider()` (`__tests__/LLMRouterSettings.test.tsx:30-46`)에 두 필드 추가는 **다음 경우에만 필요**:
- 렌더된 latency **값**을 검증하는 신규 테스트를 추가할 때.
- 미추가 시 런타임에 `provider.last_latency_ms`는 `undefined` → `?? '—'` → `—` 렌더 → **기존 테스트는 그대로 통과** (값 미검증).

권장 추가(신규 테스트용, 선택):
```tsx
// mockProvider() override 또는 기본값에
last_latency_ms: 180,
avg_latency_ms: 142.7,
```
신규 테스트 예: 확장 패널에서 `screen.getByText('180ms / 143ms')` (또는 null 케이스 `—ms / —ms`) 검증.

---

## 검증 체크리스트 (DRY-RUN — 명령 미실행, 예측)

- [x] `LLMProvider` 키 1:1 백엔드 계약 일치 (`last_latency_ms`/`avg_latency_ms`, snake_case)
- [x] `avg_latency_ms`(provider) vs `average_latency_ms`(stats line 78/335) 구분 — stats 무수정
- [x] `null`→`—` 플레이스홀더 (`??`)
- [x] `Clock` 아이콘 재사용 (신규 import 0)
- [x] 다크모드 `dark:` prefix 유지, 기존 셀 스타일 동일
- [~] tsc 통과: **예측** (인터페이스 비-export + mock 미주석 근거). DRY-RUN이라 실제 `tsc --noEmit` 미실행.
- [x] 영향 픽스처: tsc 필수 **0개**, 선택(신규 값 검증 테스트 시) `mockProvider()` 1개
- [x] 변경 범위: `LLMRouterSettings.tsx`만 (`src/` 무수정 — 본 문서는 제안)
