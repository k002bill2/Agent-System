# Backend Implementation Proposal: Provider별 Latency 노출 (DRY-RUN)

> backend-integration-specialist 산출물. **제안만** — `src/` 무수정.
> 계획서: `_workspace/A_planner_plan.md` (LOAD-BEARING 계약 준수).

## 한 줄 요약
기존 `_latency_tracker[provider_id]: list[float]`를 집계하는 `_latency_for()` 헬퍼를 추가하고, `list_providers()`/`get_provider()`가 반환 직전 `model_copy(update=...)`로 만든 **사본**에 `last_latency_ms`/`avg_latency_ms`를 주입한다. 신규 측정·신규 엔드포인트 없음. `api/llm.py` 무수정.

## 노출 API 계약 (확정)
| 항목 | 값 |
|------|-----|
| 엔드포인트 | `GET /api/llm-router/providers` (확장), `GET /api/llm-router/providers/{provider_id}` (확장) |
| 신규 엔드포인트 | 없음 |
| provider별 필드 (snake_case) | `last_latency_ms: int \| None`, `avg_latency_ms: float \| None` |
| 응답 모델 | `LLMProviderConfig` (Pydantic), `/providers`는 `list[LLMProviderConfig]` |
| 데이터 없음 | 둘 다 `null` |
| 전역 stats 평균과 구분 | provider별 = `avg_latency_ms`. 전역 = `LLMRoutingStats.average_latency_ms` (별개, 무변경) |
| 비주입 표면 | `get_router_state()`의 `providers[]`는 `_providers.values()` 직접 → 필드 default `None` 유지 (계약상 `/providers`만 필수, 범위 내) |

---

## 파일 1: `src/backend/models/llm_router.py`

### 변경 위치
`LLMProviderConfig` 클래스, Health tracking 블록 직후 (line 52 `consecutive_failures` 다음 / line 53 `# Metadata` 앞). additive 필드 2개.

### before (line 49-55)
```python
    # Health tracking
    status: LLMProviderStatus = LLMProviderStatus.UNKNOWN
    last_health_check: datetime | None = None
    consecutive_failures: int = 0
    # Metadata
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
```

### after
```python
    # Health tracking
    status: LLMProviderStatus = LLMProviderStatus.UNKNOWN
    last_health_check: datetime | None = None
    consecutive_failures: int = 0
    # Latency tracking (populated on read from _latency_tracker; None when no data)
    last_latency_ms: int | None = None
    avg_latency_ms: float | None = None
    # Metadata
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
```

### 노출 필드/케이스
- `last_latency_ms` — snake_case, `int | None`, 기본 `None`
- `avg_latency_ms` — snake_case, `float | None`, 기본 `None`

> 주의: 전역 stats의 `LLMRoutingStats.average_latency_ms` (line 161)와 **혼동 금지**. 접두사(`avg_` vs `average_`)·대상(provider별 vs 전역)이 다른 별개 필드. `LLMRoutingStats`는 무변경.

---

## 파일 2: `src/backend/services/llm_router_service.py`

### 변경 A — 집계 헬퍼 추가

**위치:** `LLMRouterService` 클래스 내 Provider Management 섹션, `list_providers()` (line 68-73) 직후. 빈 리스트/미존재 키 안전.

#### after (신규 메서드)
```python
    @staticmethod
    def _latency_for(provider_id: str) -> tuple[int | None, float | None]:
        """Aggregate (last, avg) latency in ms from _latency_tracker.

        Returns (None, None) when no latency has been recorded for the
        provider (empty or missing list). last is the most recent sample
        (float→int cast); avg is the unrounded arithmetic mean over the
        retained window (last 100).
        """
        latencies = _latency_tracker.get(provider_id)
        if not latencies:
            return None, None
        last_ms = int(latencies[-1])
        avg_ms = sum(latencies) / len(latencies)
        return last_ms, avg_ms

    @staticmethod
    def _with_latency(provider: LLMProviderConfig) -> LLMProviderConfig:
        """Return an immutable copy of provider with latency fields injected.

        Uses model_copy(update=...) so the stored _providers entry is never
        mutated (prevents api_key-masking corruption at the API layer and
        keeps the in-memory source of truth clean).
        """
        last_ms, avg_ms = LLMRouterService._latency_for(provider.id)
        return provider.model_copy(
            update={"last_latency_ms": last_ms, "avg_latency_ms": avg_ms}
        )
```

### 변경 B — `get_provider()` 사본 반환

**위치:** line 62-65.

#### before
```python
    @staticmethod
    def get_provider(provider_id: str) -> LLMProviderConfig | None:
        """Get a provider by ID."""
        return _providers.get(provider_id)
```

#### after
```python
    @staticmethod
    def get_provider(provider_id: str) -> LLMProviderConfig | None:
        """Get a provider by ID (latency-injected immutable copy)."""
        provider = _providers.get(provider_id)
        if provider is None:
            return None
        return LLMRouterService._with_latency(provider)
```

### 변경 C — `list_providers()` 사본 반환

**위치:** line 67-73.

#### before
```python
    @staticmethod
    def list_providers() -> list[LLMProviderConfig]:
        """List all providers sorted by priority (highest first)."""
        return sorted(
            _providers.values(),
            key=lambda p: (-p.priority, p.created_at),
        )
```

#### after
```python
    @staticmethod
    def list_providers() -> list[LLMProviderConfig]:
        """List all providers sorted by priority (latency-injected copies)."""
        ordered = sorted(
            _providers.values(),
            key=lambda p: (-p.priority, p.created_at),
        )
        return [LLMRouterService._with_latency(p) for p in ordered]
```

### 노출 필드/케이스 (서비스 → API)
- `_latency_for()` 반환 `tuple[int | None, float | None]` → `(last_latency_ms, avg_latency_ms)`
- `last_latency_ms`: `int(latencies[-1])` (최근 1개, float→int 캐스트 — 모델 타입 `int|None`과 일치)
- `avg_latency_ms`: `sum/len` (최근 100 윈도우 산술평균, **반올림 없는 float**)
  - 근거: 프론트가 `avg?.toFixed(0)` 수행 → 백엔드에서 round 시 이중 반올림. raw float 유지가 계약.
- 데이터 없음(빈/미존재 리스트) → `(None, None)` → JSON `null`

---

## 변경 C·B의 Immutability·blast-radius 검증 (조사 결과)

`model_copy(update=...)`로 `get_provider()`/`list_providers()`가 **사본**을 반환하므로,
반환 객체를 mutate-and-persist 하는 호출자가 있으면 조용히 깨진다. 전체 백엔드 grep:

```
grep -rn "LLMRouterService.get_provider\|LLMRouterService.list_providers\|\.list_providers()\|\.get_provider(" src/backend tests/backend
```

결과 — mutate-and-persist 호출자 **0건**:
| 위치 | 사용 | 사본 영향 |
|------|------|-----------|
| `api/llm_router.py:31` `list_providers()` | api_key 마스킹 후 반환 | 안전. 사본을 마스킹 → **원본 무오염** |
| `api/llm_router.py:58` `get_provider()` | api_key 마스킹 후 반환 | 안전. 동일 |
| `api/llm_router.py:102` `toggle_provider` | `provider.enabled` **읽기**만, 실제 변경은 `update_provider()` (→ `_providers` dict 직접) | 안전. 읽기 전용 |
| `external_usage_service.py:419` `collector.get_provider()` | `LLMRouterService`와 무관한 다른 객체 메서드 | 영향 없음 |

내부 로직(`select_provider`, `check_provider_health`, `update_provider`)은 `_providers` dict를 직접 만지므로 이 정적 메서드를 경유하지 않음 → 사본화 무영향.

## 부수 발견 (incidental — 무수정)
현재 `list_providers()`/`get_provider()`는 **live `_providers` 참조**를 반환한다. API 레이어가 `p.api_key = "***..."`로 in-place 마스킹하므로, `/providers` 호출마다 **저장된 실제 api_key가 마스킹 값으로 영구 오염**되는 잠재 버그가 존재. 본 제안의 사본 반환(`model_copy`)이 이 버그를 **부수적으로 함께 해결**한다 (계획 step 2 "마스킹 충돌 방지"의 근거와 일치). 별도 수정 대상 아님 — 본 변경으로 자연 해소.

## Step 3 (조사·문서화만, 범위 외)
`record_request_result()` (line 287-322)는 `_latency_tracker`에 지연을 누적하지만, `POST /api/llm-router/record`로만 호출된다. `LLMService.invoke()` 실호출 경로에 자동 기록 훅이 없어, `/record` 수동 호출 전에는 `_latency_tracker`가 비어 두 필드 모두 `null`로 노출된다. **자동 배선은 본 작업 범위 외 (후속).** 본 제안은 "데이터 있으면 노출, 없으면 null" 계약만 충족한다.

## Quality Gates (제안 기준 — 실제 적용 시)
- 타입 힌트: `_latency_for` → `tuple[int|None, float|None]`, `_with_latency` → `LLMProviderConfig` ✓
- Immutability: `model_copy(update=...)`, 원본 `_providers` 무변경 ✓
- 시크릿 하드코딩 없음 ✓
- additive only — 기존 필드/엔드포인트/직렬화 무회귀 ✓
- 제안 pytest (적용 시): `_latency_for` 빈 리스트→`(None,None)`, 1개→`(int, float)`, 다수→평균 검증 / `list_providers` 후 `_providers[id].last_latency_ms is None` (원본 무오염) 검증
```
