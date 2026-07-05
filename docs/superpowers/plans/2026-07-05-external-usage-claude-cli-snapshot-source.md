# External Usage — Claude CLI (snapshot) 소스 추가 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** External Usage 페이지의 Claude CLI 카드가 `claude_session_snapshots` 테이블(호스트 전체 Claude 사용량, launcher 무관)을 소스로 실제 토큰/비용을 표시하게 한다.

**Architecture:** `services/external_usage_service.py`에 국한된 read-only 확장(A2). snapshot 테이블을 `CLAUDE_CLI` 소스로 요약해 primary summary/records/reconciliation의 internal 쪽에 합류시키고, 이중집계 방지를 위해 ledger의 `claude_cli` 행을 집계에서 제외한다. ledger에 새 write·마이그레이션·프론트 변경 없음.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy async, Pydantic, pytest (`@pytest.mark.asyncio`).

## Global Constraints

- 백엔드 게이트: `ruff + mypy + pytest` 모두 통과 (완료 선언 전 fresh 실행 증거 필수).
- 새 async 테스트는 `@pytest.mark.asyncio` 필수 (rootdir=repo루트라 asyncio_mode=auto 미적용 → 실질 STRICT).
- 모든 함수 시그니처·반환값에 타입 힌트 (mypy).
- Immutability: 새 객체 생성, 입력 mutation 금지.
- Surgical: `tmux_service.py`·`api/warp.py`의 기존 claude_cli writer 코드는 **변경하지 않는다**.
- 파일 경로 규약: 테스트는 `tests/backend/test_external_usage_service.py`(기존 파일에 추가).
- snapshot 컬럼(SSOT): `total_input_tokens`, `total_output_tokens`(int), `estimated_cost`(float), `model`(str|None), `session_last_activity`(datetime), `project_name`, `source_user`, `id`(세션 UUID). AOS `user_id`/`organization_id`/`project_id` 없음.
- `ExternalProvider.CLAUDE_CLI = "claude_cli"`, `_LEDGER_PROVIDER_FILTERS[ExternalProvider.CLAUDE_CLI] == {"claude_cli"}`.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/backend/services/external_usage_service.py` | (신규) `summarize_claude_snapshot_records` 순수 함수, `ExternalUsageService._collect_claude_snapshots` 컬렉터, `get_summary` 배선, `_collect_internal_ledger_records`의 claude_cli 제외 |
| `tests/backend/test_external_usage_service.py` | 순수 함수 단위 테스트 + get_summary 통합 테스트(이중집계 가드, snapshot 반영, providers 필터) + 기존 테스트 갱신 |
| `docs/llm-key-systems.md` | CLAUDE_CLI 소스=snapshot 명시 |

---

## Task 1: 순수 함수 `summarize_claude_snapshot_records`

DB 의존 없는 순수 매핑 함수. snapshot ORM row 리스트 → `(list[UnifiedUsageRecord], list[UsageSummary])`. `summarize_internal_ledger_records`(같은 파일 74행)와 대칭.

**Files:**
- Modify: `src/backend/services/external_usage_service.py` (신규 함수 추가; `summarize_internal_ledger_records` 정의 바로 아래 ~139행 뒤)
- Test: `tests/backend/test_external_usage_service.py` (신규 테스트 추가)

**Interfaces:**
- Produces: `summarize_claude_snapshot_records(rows: list[Any], start_time: datetime, end_time: datetime) -> tuple[list[UnifiedUsageRecord], list[UsageSummary]]`. `UsageSummary` 리스트는 0개(빈 입력) 또는 1개(provider=`ExternalProvider.CLAUDE_CLI`).

- [ ] **Step 1: Write the failing test**

`tests/backend/test_external_usage_service.py` 상단 import에 `summarize_claude_snapshot_records`를 추가하고(기존 `from services.external_usage_service import (...)` 블록, 15행 부근), 파일 끝에 테스트 추가:

```python
async def test_summarize_claude_snapshot_records_aggregates_host_usage() -> None:
    """Claude session snapshots should map onto the CLAUDE_CLI external contract."""
    start = datetime(2026, 7, 1, tzinfo=UTC)
    end = datetime(2026, 7, 31, tzinfo=UTC)
    rows = [
        SimpleNamespace(
            id="sess-1",
            model="claude-sonnet-4",
            total_input_tokens=1000,
            total_output_tokens=200,
            estimated_cost=0.5,
            project_name="aos",
            source_user="younghwan",
            session_last_activity=datetime(2026, 7, 5, tzinfo=UTC),
        ),
        SimpleNamespace(
            id="sess-2",
            model="claude-sonnet-4",
            total_input_tokens=300,
            total_output_tokens=100,
            estimated_cost=0.25,
            project_name="other",
            source_user="younghwan",
            session_last_activity=datetime(2026, 7, 6, tzinfo=UTC),
        ),
    ]

    records, summaries = summarize_claude_snapshot_records(rows, start, end)

    assert len(records) == 2
    assert records[0].provider == ExternalProvider.CLAUDE_CLI
    assert records[0].input_tokens == 1000
    assert records[0].output_tokens == 200
    assert records[0].total_tokens == 1200
    assert records[0].request_count == 1
    assert records[0].cost_usd == pytest.approx(0.5)
    assert records[0].raw_data["snapshot_id"] == "sess-1"

    assert len(summaries) == 1
    summary = summaries[0]
    assert summary.provider == ExternalProvider.CLAUDE_CLI
    assert summary.total_input_tokens == 1300
    assert summary.total_output_tokens == 300
    assert summary.total_requests == 2
    assert summary.total_cost_usd == pytest.approx(0.75)
    assert summary.model_breakdown["claude-sonnet-4"] == pytest.approx(0.75)


async def test_summarize_claude_snapshot_records_empty_returns_no_summary() -> None:
    """No snapshots must yield no CLAUDE_CLI summary (card stays absent, not zeroed)."""
    start = datetime(2026, 7, 1, tzinfo=UTC)
    end = datetime(2026, 7, 31, tzinfo=UTC)

    records, summaries = summarize_claude_snapshot_records([], start, end)

    assert records == []
    assert summaries == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && ./.venv/bin/python -m pytest ../../tests/backend/test_external_usage_service.py -k snapshot_records -v`
Expected: FAIL — `ImportError: cannot import name 'summarize_claude_snapshot_records'`

- [ ] **Step 3: Write minimal implementation**

`src/backend/services/external_usage_service.py`에서 `summarize_internal_ledger_records`의 `return external_records, list(summaries_by_provider.values())`(139행) 바로 뒤에 추가:

```python
def summarize_claude_snapshot_records(
    rows: list[Any],
    start_time: datetime,
    end_time: datetime,
) -> tuple[list[UnifiedUsageRecord], list[UsageSummary]]:
    """Map Claude session snapshot rows onto the CLAUDE_CLI External Usage contract.

    Snapshots are the host-wide, launcher-independent source of truth for
    Claude CLI usage (cmux/tmux/iterm all leave transcripts that the session
    monitor already aggregates). One snapshot == one session == one request.
    """
    external_records: list[UnifiedUsageRecord] = []
    summary: UsageSummary | None = None

    for row in rows:
        input_tokens = getattr(row, "total_input_tokens", None) or 0
        output_tokens = getattr(row, "total_output_tokens", None) or 0
        cost_usd = getattr(row, "estimated_cost", None) or 0.0
        timestamp = getattr(row, "session_last_activity", None) or start_time
        model = getattr(row, "model", None)
        record_id = getattr(row, "id", None) or str(uuid.uuid4())

        external_records.append(
            UnifiedUsageRecord(
                id=str(record_id),
                provider=ExternalProvider.CLAUDE_CLI,
                timestamp=timestamp,
                bucket_width="event",
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=input_tokens + output_tokens,
                cost_usd=cost_usd,
                request_count=1,
                model=model,
                raw_data={
                    "snapshot_id": getattr(row, "id", None),
                    "project_name": getattr(row, "project_name", None),
                    "source_user": getattr(row, "source_user", None),
                },
            )
        )

        if summary is None:
            summary = UsageSummary(
                provider=ExternalProvider.CLAUDE_CLI,
                period_start=start_time,
                period_end=end_time,
            )
        summary.total_input_tokens += input_tokens
        summary.total_output_tokens += output_tokens
        summary.total_cost_usd += cost_usd
        summary.total_requests += 1
        if model:
            summary.model_breakdown[model] = summary.model_breakdown.get(model, 0.0) + cost_usd

    return external_records, ([summary] if summary is not None else [])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && ./.venv/bin/python -m pytest ../../tests/backend/test_external_usage_service.py -k snapshot_records -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/external_usage_service.py tests/backend/test_external_usage_service.py
git commit -m "feat(usage): Claude snapshot → CLAUDE_CLI 요약 순수 함수 추가"
```

---

## Task 2: 이중집계 가드 — ledger에서 claude_cli 제외

`_collect_internal_ledger_records`가 fetch 후 `claude_cli` provider 행을 Python 레벨에서 제외한다(mock이 WHERE절을 무시하므로 SQL이 아닌 후처리 필터로 테스트 가능). snapshot이 tmux/warp 실행분 transcript까지 이미 포함하므로, ledger claude_cli(현재 0건, 미래 tmux/warp write분)와 합치면 이중집계.

동시에 이 변경으로 기존 `test_get_summary_includes_reconciliation_totals`가 깨진다(claude_cli ledger 행 전제). 그 테스트를 `codex_cli`로 갱신해 "reconciliation totals" 의도는 유지하되 변경된 claude_cli 의미론과 분리한다.

**Files:**
- Modify: `src/backend/services/external_usage_service.py:653-654` (`_collect_internal_ledger_records` return)
- Test: `tests/backend/test_external_usage_service.py` (기존 `test_get_summary_includes_reconciliation_totals` 갱신 + 신규 가드 테스트)

**Interfaces:**
- Consumes: `_LEDGER_PROVIDER_FILTERS[ExternalProvider.CLAUDE_CLI]` == `{"claude_cli"}` (같은 파일 33-35행).
- Produces: `_collect_internal_ledger_records`는 `provider == "claude_cli"` 행을 반환하지 않는다.

- [ ] **Step 1: Write the failing test (신규 가드 테스트)**

파일 끝에 추가:

```python
async def test_get_summary_excludes_claude_cli_ledger_rows(monkeypatch) -> None:
    """claude_cli ledger rows must NOT feed CLAUDE_CLI summary — snapshots are the
    single source of truth, so ledger claude_cli would double-count (regression)."""
    start = datetime(2026, 7, 1, tzinfo=UTC)
    end = datetime(2026, 7, 31, tzinfo=UTC)
    claude_ledger_row = SimpleNamespace(
        id="ledger-claude-1",
        provider="claude_cli",
        mode="cli",
        source="task_analyzer_execution",
        model="claude-code-cli",
        input_tokens=999,
        output_tokens=999,
        total_tokens=1998,
        estimated_cost_usd=9.99,
        status="success",
        measurement_method="cli_metadata",
        user_id=None,
        organization_id=None,
        project_id=None,
        started_at=start,
    )
    result = MagicMock()
    result.scalars.return_value.all.return_value = [claude_ledger_row]
    db = AsyncMock()
    db.execute.return_value = result

    monkeypatch.setenv("EXTERNAL_USAGE_INCLUDE_PROVIDER_BILLING", "false")

    # Snapshots collected separately; return empty so we isolate the ledger guard.
    with patch.object(
        ExternalUsageService,
        "_collect_claude_snapshots",
        AsyncMock(return_value=[]),
    ):
        response = await ExternalUsageService().get_summary(db, start, end)

    # No CLAUDE_CLI summary from the ledger row, and its tokens are not in the total.
    claude_summaries = [s for s in response.providers if s.provider == ExternalProvider.CLAUDE_CLI]
    assert claude_summaries == []
    assert response.reconciliation.internal_total_tokens == 0
    assert all(r.provider != ExternalProvider.CLAUDE_CLI for r in response.records)
```

> 참고: 이 테스트는 Task 3에서 추가되는 `_collect_claude_snapshots`를 patch한다. Task 2 단독 실행 시 `_collect_claude_snapshots` 미존재로 `AttributeError`가 날 수 있으므로, 이 신규 테스트의 최종 GREEN 검증은 Task 3 완료 후 함께 확인한다. Task 2에서는 아래 "기존 테스트 갱신"으로 가드 자체를 RED→GREEN 검증한다.

- [ ] **Step 2: 기존 테스트 갱신 — RED 확인**

`test_get_summary_includes_reconciliation_totals`(179행 부근)의 row `provider="claude_cli"` → `provider="codex_cli"`, 그리고 마지막 assert `comparisons[0].provider == ExternalProvider.CLAUDE_CLI` → `ExternalProvider.CODEX_CLI`로 변경. `model="claude-code-cli"`는 그대로 두어도 무방(집계엔 영향 없음).

변경 전 현재 코드로 실행해 갱신된 기대치가 아직 실패(또는 이전 통과)임을 확인:
Run: `cd src/backend && ./.venv/bin/python -m pytest ../../tests/backend/test_external_usage_service.py::test_get_summary_includes_reconciliation_totals -v`
Expected: 갱신된 assert(`CODEX_CLI`)는 아직 구현 전 코드에서도 통과할 수 있음(codex_cli는 제외 대상 아님). 이 테스트의 목적은 "제외 도입 후에도 non-claude ledger provider의 reconciliation이 유지됨"을 지키는 회귀 가드다.

- [ ] **Step 3: 구현 — claude_cli 제외 필터**

`src/backend/services/external_usage_service.py`의 `_collect_internal_ledger_records` 끝(653-654행):

```python
        result = await db.execute(stmt.order_by(LLMUsageLedgerModel.started_at.desc()))
        claude_cli_providers = _LEDGER_PROVIDER_FILTERS[ExternalProvider.CLAUDE_CLI]
        # Claude CLI usage is sourced host-wide from session snapshots
        # (launcher-independent). Drop ledger claude_cli rows so they never
        # double-count against the snapshot summary.
        return [
            row
            for row in result.scalars().all()
            if getattr(row, "provider", None) not in claude_cli_providers
        ]
```

- [ ] **Step 4: Run tests to verify green**

Run: `cd src/backend && ./.venv/bin/python -m pytest ../../tests/backend/test_external_usage_service.py::test_get_summary_includes_reconciliation_totals -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/external_usage_service.py tests/backend/test_external_usage_service.py
git commit -m "fix(usage): ledger claude_cli 행을 집계 제외 (snapshot 단일 소스)"
```

---

## Task 3: `_collect_claude_snapshots` 컬렉터 + `get_summary` 배선

snapshot을 조회하는 컬렉터를 추가하고, Task 1의 순수 함수로 요약해 primary summary/records와 reconciliation의 internal 쪽에 합류시킨다.

**Files:**
- Modify: `src/backend/services/external_usage_service.py` (상단에 `logging` import + `logger`; `_collect_claude_snapshots` 메서드 추가; `get_summary` 배선 674-680행·736-741행)
- Test: `tests/backend/test_external_usage_service.py` (snapshot 반영 + providers 필터 테스트, Task 2의 가드 테스트 최종 GREEN)

**Interfaces:**
- Consumes: `summarize_claude_snapshot_records` (Task 1), `ClaudeSessionSnapshotModel` (`from db.models.claude_session import ClaudeSessionSnapshotModel`).
- Produces: `ExternalUsageService._collect_claude_snapshots(self, db: AsyncSession, start_time: datetime, end_time: datetime, providers: list[ExternalProvider] | None) -> list[Any]`. `providers`가 CLAUDE_CLI를 배제하면 `[]`.

- [ ] **Step 1: Write the failing tests**

파일 끝에 추가:

```python
async def test_get_summary_includes_claude_snapshot_usage(monkeypatch) -> None:
    """Snapshots must surface as CLAUDE_CLI tokens in the card and the total."""
    start = datetime(2026, 7, 1, tzinfo=UTC)
    end = datetime(2026, 7, 31, tzinfo=UTC)
    # Ledger returns nothing; snapshots carry the Claude usage.
    ledger_result = MagicMock()
    ledger_result.scalars.return_value.all.return_value = []
    db = AsyncMock()
    db.execute.return_value = ledger_result

    snapshot_row = SimpleNamespace(
        id="sess-1",
        model="claude-sonnet-4",
        total_input_tokens=1000,
        total_output_tokens=200,
        estimated_cost=0.5,
        project_name="aos",
        source_user="younghwan",
        session_last_activity=datetime(2026, 7, 5, tzinfo=UTC),
    )

    monkeypatch.setenv("EXTERNAL_USAGE_INCLUDE_PROVIDER_BILLING", "false")

    with patch.object(
        ExternalUsageService,
        "_collect_claude_snapshots",
        AsyncMock(return_value=[snapshot_row]),
    ):
        response = await ExternalUsageService().get_summary(db, start, end)

    claude = [s for s in response.providers if s.provider == ExternalProvider.CLAUDE_CLI]
    assert len(claude) == 1
    assert claude[0].total_input_tokens == 1000
    assert claude[0].total_output_tokens == 200
    assert claude[0].total_cost_usd == pytest.approx(0.5)
    assert response.total_cost_usd == pytest.approx(0.5)
    assert response.reconciliation.internal_total_tokens == 1200
    claude_records = [r for r in response.records if r.provider == ExternalProvider.CLAUDE_CLI]
    assert len(claude_records) == 1


async def test_collect_claude_snapshots_respects_provider_filter() -> None:
    """When providers is restricted and excludes CLAUDE_CLI, skip the snapshot query."""
    start = datetime(2026, 7, 1, tzinfo=UTC)
    end = datetime(2026, 7, 31, tzinfo=UTC)
    db = AsyncMock()

    rows = await ExternalUsageService()._collect_claude_snapshots(
        db, start, end, [ExternalProvider.CODEX_CLI]
    )

    assert rows == []
    db.execute.assert_not_awaited()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src/backend && ./.venv/bin/python -m pytest ../../tests/backend/test_external_usage_service.py -k "claude_snapshot_usage or provider_filter or excludes_claude_cli" -v`
Expected: FAIL — `AttributeError: ... has no attribute '_collect_claude_snapshots'` / snapshot이 summary에 없음

- [ ] **Step 3: 구현 — import + logger**

`src/backend/services/external_usage_service.py` 상단 import 구역(9행 `from typing import Any` 부근)에 표준 로깅 추가:

```python
import logging
```

그리고 `_LEDGER_PROVIDER_FILTERS` 정의(41행) 뒤에:

```python
logger = logging.getLogger(__name__)
```

- [ ] **Step 4: 구현 — `_collect_claude_snapshots` 메서드**

`_collect_internal_ledger_records` 메서드(623행) 바로 뒤에 추가:

```python
    async def _collect_claude_snapshots(
        self,
        db: AsyncSession,
        start_time: datetime,
        end_time: datetime,
        providers: list[ExternalProvider] | None,
    ) -> list[Any]:
        """Fetch host-wide Claude session snapshots for the CLAUDE_CLI source.

        Best-effort: returns [] when CLAUDE_CLI is filtered out or on any query
        failure, so snapshot issues never break the primary ledger summary.
        """
        if providers is not None and ExternalProvider.CLAUDE_CLI not in providers:
            return []
        try:
            from db.models.claude_session import ClaudeSessionSnapshotModel

            stmt = select(ClaudeSessionSnapshotModel).where(
                ClaudeSessionSnapshotModel.session_last_activity >= start_time,
                ClaudeSessionSnapshotModel.session_last_activity <= end_time,
            )
            result = await db.execute(stmt)
            return list(result.scalars().all())
        except Exception:
            logger.warning("claude_snapshot_collect_failed", exc_info=True)
            return []
```

- [ ] **Step 5: 구현 — `get_summary` 배선**

`get_summary`에서 ledger 요약 블록(674-680행) 직후, `provider_billing_enabled = ...`(682행) 앞에 삽입:

```python
        snapshot_rows = await self._collect_claude_snapshots(
            db,
            start_time,
            end_time,
            providers,
        )
        snapshot_records, snapshot_summaries = summarize_claude_snapshot_records(
            snapshot_rows,
            start_time,
            end_time,
        )
        all_records.extend(snapshot_records)
        summaries.extend(snapshot_summaries)
```

그리고 `build_reconciliation_summary(...)` 호출(736-741행)의 `ledger_summaries=ledger_summaries`를 아래로 변경(snapshot을 internal 쪽에 포함해 reconciliation 총계 일관):

```python
            reconciliation=build_reconciliation_summary(
                ledger_summaries=ledger_summaries + snapshot_summaries,
                provider_billing_summaries=provider_billing_summaries,
                provider_billing_enabled=provider_billing_enabled,
                provider_billing_record_count=len(provider_billing_records),
            ),
```

- [ ] **Step 6: Run tests to verify green (신규 + Task 2 가드 + 전체 파일)**

Run: `cd src/backend && ./.venv/bin/python -m pytest ../../tests/backend/test_external_usage_service.py -v`
Expected: PASS (기존 + 신규 전부; `test_get_summary_excludes_claude_cli_ledger_rows` 포함)

- [ ] **Step 7: Commit**

```bash
git add src/backend/services/external_usage_service.py tests/backend/test_external_usage_service.py
git commit -m "feat(usage): External Usage에 Claude snapshot 소스 배선 (cmux 포함 호스트 전체)"
```

---

## Task 4: 게이트 + 문서 동기화

전체 백엔드 게이트를 돌리고, mandatory-docs 규칙(`docs/llm-key-systems.md`)에 CLAUDE_CLI 소스를 명시한다.

**Files:**
- Modify: `docs/llm-key-systems.md`
- (검증) `src/backend/services/external_usage_service.py`, `tests/backend/test_external_usage_service.py`

- [ ] **Step 1: 백엔드 게이트 실행 (ruff + mypy + pytest)**

Run:
```bash
cd src/backend && ./.venv/bin/ruff check services/external_usage_service.py && \
  ./.venv/bin/mypy services/external_usage_service.py && \
  ./.venv/bin/python -m pytest ../../tests/backend/test_external_usage_service.py -v
```
Expected: ruff 0 errors, mypy Success, pytest all PASS. 실패 시 수정 후 재실행(같은 수정 2회 실패 시 STOP → 근본 원인 분석).

- [ ] **Step 2: 문서 갱신**

`docs/llm-key-systems.md`의 "핵심 함정: 내부 ledger ≠ provider billing API" 섹션(66행 부근)에 한 줄 추가:

```markdown
- External Usage의 **Claude CLI** 수치는 ledger가 아니라 `claude_session_snapshots`(호스트 전체 `~/.claude/projects/` 스캔, launcher 무관)에서 온다. ledger의 `claude_cli` 행은 이중집계 방지를 위해 CLAUDE_CLI 집계에서 제외된다. tmux/warp의 claude_cli writer는 유지되나 그 값은 CLAUDE_CLI 카드에 반영되지 않는다.
```

"작업 시작점" 표(96행 부근)의 "External Usage adapter/reconciliation" 행 파일 목록은 그대로 유효(변경 불필요).

- [ ] **Step 3: Red-Green 회귀 검증 (이중집계 가드)**

가드 테스트가 실제로 버그를 잡는지 확인:
1. `test_get_summary_excludes_claude_cli_ledger_rows` PASS 확인.
2. `_collect_internal_ledger_records`의 제외 필터를 임시로 되돌려(claude_cli 포함) 실행 → 이 테스트 FAIL 확인(가드가 이중집계를 잡음).
3. 필터 복원 → PASS 확인.

Run(각 단계): `cd src/backend && ./.venv/bin/python -m pytest ../../tests/backend/test_external_usage_service.py::test_get_summary_excludes_claude_cli_ledger_rows -v`

- [ ] **Step 4: 실제 데이터 스모크 검증 (선택, 증거)**

백엔드 재시작 후(--reload 없으면 수동 재시작) External Usage `/summary` 또는 UI에서 Claude CLI 카드가 0이 아닌지 확인. DB에는 이미 697세션·138M토큰 존재. "Last 30 days" 창이면 `session_last_activity`가 최근 30일인 세션만 집계됨.

- [ ] **Step 5: Commit**

```bash
git add docs/llm-key-systems.md
git commit -m "docs: External Usage Claude CLI 소스=snapshot 명시"
```

---

## Self-Review (계획 작성자 체크)

**Spec coverage:**
- 순수 함수 `summarize_claude_snapshot_records` → Task 1 ✓
- `_collect_claude_snapshots` 컬렉터 → Task 3 ✓
- `get_summary` 배선(summaries/all_records/reconciliation) → Task 3 ✓
- 이중집계 가드(ledger claude_cli 제외) → Task 2 ✓
- 테스트(단위·통합·필터·가드) → Task 1/2/3 ✓
- 문서(`docs/llm-key-systems.md`) → Task 4 ✓
- 범위 밖(scan 트리거, user_id 어트리뷰션, tmux/warp 은퇴, 프론트/마이그레이션) → 계획에 미포함 ✓

**Placeholder scan:** 모든 코드 스텝에 실제 코드/명령/기대출력 포함. TBD 없음.

**Type consistency:** `summarize_claude_snapshot_records(rows, start_time, end_time) -> tuple[list[UnifiedUsageRecord], list[UsageSummary]]`가 Task 1 정의와 Task 3 소비에서 일치. `_collect_claude_snapshots(...) -> list[Any]`가 Task 3 정의와 Task 2 테스트 patch에서 일치. `_LEDGER_PROVIDER_FILTERS[ExternalProvider.CLAUDE_CLI]` 사용 일관.

**주의(테스트 순서 결합):** Task 2의 신규 가드 테스트(`test_get_summary_excludes_claude_cli_ledger_rows`)는 Task 3의 `_collect_claude_snapshots`를 patch하므로 최종 GREEN은 Task 3 완료 후 검증한다(Task 2 Step 1에 명시). subagent-driven 실행 시 Task 2·3을 한 리뷰 묶음으로 다루거나 순차 진행할 것.
