# External Usage — Claude CLI (snapshot) 소스 추가

- 날짜: 2026-07-05
- 상태: 승인됨 (설계)
- 영역: backend (`src/backend/services/external_usage_service.py` 중심)

## 문제

External Usage 페이지의 **Claude CLI 카드가 항상 0**으로 표시된다. 근본 원인:

- External Usage의 primary source는 provider billing API가 아니라 내부 `llm_usage_ledger`다.
- ledger에 `provider="claude_cli"`를 쓰는 코드는 `services/tmux_service.py:271`(Task Analyzer tmux 실행 완료 시)과 `api/warp.py:110` **딱 두 곳뿐**이다.
- 사용자는 Claude를 `cmux`로 실행한다(`services/terminal_service.py`의 `CmuxAdapter`). 이 어댑터는 `open -a cmux` + AppleScript keystroke의 fire-and-forget이라 세션 추적·transcript 파싱·ledger write가 **전혀 없다**.
- 따라서 cmux(및 iterm/ghostty 등 다른 launcher) 실행은 ledger에 아무 레코드도 남기지 않아 카드가 0이 된다.

DB 확인(2026-07-05): `llm_usage_ledger`에는 `codex_cli` 14건(122,568토큰)만 있고 `claude_cli`는 0건.

## 관측 자산 (이미 존재)

`services/claude_session_monitor.py`는 `~/.claude/projects/`의 `.jsonl` transcript를 스캔해 세션별 `input_tokens`/`output_tokens`/`estimated_cost`/`model`을 파싱하며, 이는 **launcher와 무관**하다. 이 데이터는 `api/claude_sessions.py:_sync_sessions_to_db`가 `ClaudeSessionSnapshotModel` 테이블에 세션별 누적값으로 **upsert**한다(변경된 파일만).

DB 확인(2026-07-05): `claude_session_snapshots` 697행, 누적 138,242,819 토큰, 범위 2026-03-19 ~ 2026-07-05(당일).

## 결정 사항 (합의됨)

1. **집계 스코프 = 호스트의 모든 Claude 사용량.** monitor가 `~/.claude/projects/` 전체를 스캔하므로 개인 작업·다른 프로젝트 포함. 페이지 문구 "CLI subscription usage"의 문자 그대로 해석.
2. **단일 소스 = snapshot.** CLAUDE_CLI 집계는 `ClaudeSessionSnapshotModel`만 소스로 쓴다. ledger의 `claude_cli` 행은 CLAUDE_CLI 집계에서 **제외**(이중집계 방지). 기존 tmux/warp writer 코드는 **미변경**(surgical).
3. **접근법 A2 (read-only 확장).** ledger에 새 write를 추가하지 않는다 → upsert 의미론/org 카운터 이중증가/마이그레이션 불필요.

## 아키텍처

`src/backend/services/external_usage_service.py`에 국한된 3가지 변경. 프론트엔드·마이그레이션 없음(카드는 API가 반환하는 `CLAUDE_CLI` 요약을 이미 렌더).

### 1. 순수 함수 `summarize_claude_snapshot_records(rows, start_time, end_time)`

`summarize_internal_ledger_records`와 대칭. snapshot ORM row 리스트를 받아 `(list[UnifiedUsageRecord], UsageSummary)` 반환. provider는 `ExternalProvider.CLAUDE_CLI` 고정. DB 의존 없어 단위 테스트 가능.

매핑:

| snapshot 컬럼 | UnifiedUsageRecord 필드 |
|---|---|
| `total_input_tokens` | `input_tokens` |
| `total_output_tokens` | `output_tokens` |
| `total_input_tokens + total_output_tokens` | `total_tokens` |
| `estimated_cost` (이미 `calculate_cost`로 계산됨) | `cost_usd` |
| `model` | `model` |
| `session_last_activity` | `timestamp` |
| `id` (세션 UUID) | `id` |
| 세션 1건 | `request_count = 1` |
| — | `bucket_width = "event"` |

`UsageSummary(provider=CLAUDE_CLI)`에 input/output/cost/requests 합산, `model_breakdown`은 model→cost 누적. `user_id` 없음 → member_breakdown 비움(호스트 스코프).

### 2. `_collect_claude_snapshots(db, start_time, end_time, providers)`

`providers is None` 또는 `ExternalProvider.CLAUDE_CLI in providers`일 때만 `ClaudeSessionSnapshotModel`을 `session_last_activity ∈ [start_time, end_time]`로 조회해 row 리스트 반환. 아니면 `[]`.

import: `from db.models.claude_session import ClaudeSessionSnapshotModel` (경로는 `api/claude_sessions.py:117`과 동일).

### 3. `get_summary` 배선 + 이중집계 가드

- snapshot rows 조회 → `summarize_claude_snapshot_records`로 요약.
- snapshot 요약을 **internal 쪽에 합류**:
  - `all_records.extend(snapshot_records)`
  - `summaries.extend([snapshot_summary])` (있을 때) → 카드 + `total_cost_usd` + Total Tokens 반영
  - `build_reconciliation_summary(ledger_summaries=ledger_summaries + snapshot_summaries, ...)` → reconciliation "Internal CLI ledger" 합계도 일관되게 포함(Claude CLI 행은 "ledger only"로 표기).
- **가드:** `_collect_internal_ledger_records`가 `provider == "claude_cli"` 행을 **항상 제외**한다. snapshot이 tmux/warp 실행분 transcript까지 이미 포함하므로, ledger claude_cli(현재 0건, 미래 tmux/warp write분)와 합치면 이중집계 → 쿼리에서 원천 차단.

## 데이터 흐름

```
~/.claude/projects/*.jsonl  (cmux/tmux/iterm 무관, 모든 Claude 실행)
        │  claude_session_monitor 스캔 (Sessions 페이지 방문 시)
        ▼
claude_session_snapshots 테이블  (세션별 누적 upsert)
        │  _collect_claude_snapshots + summarize_claude_snapshot_records
        ▼
UsageSummary(CLAUDE_CLI) ──► get_summary: summaries/all_records/reconciliation(internal)
        │
        ▼
External Usage API /summary ──► Claude CLI 카드 + Total Tokens + reconciliation
```

ledger 경로(codex_cli 등)는 그대로. `claude_cli` 행만 ledger 집계에서 제외.

## 에러 처리

- `_collect_claude_snapshots`는 `USE_DATABASE`가 false거나 테이블이 없으면 예외 없이 `[]` 반환(기존 컬렉터의 best-effort 톤 유지).
- snapshot 요약 실패가 ledger/전체 summary를 깨뜨리지 않도록 방어(기존 provider billing 루프의 `except: continue` 패턴과 동일 정신).

## 테스트 (TDD, RED→GREEN)

`tests/backend/` 하위(기존 external_usage 테스트 위치 규약 따름). 새 async 테스트는 `@pytest.mark.asyncio` 필수.

1. **순수 함수 단위 테스트** (DB 불필요):
   - snapshot rows(가짜 객체) → CLAUDE_CLI 토큰/비용/건수 정확 집계.
   - `session_last_activity` 기간 필터 경계(포함/제외).
   - 빈 입력 → 빈 records + summary 없음.
2. **`get_summary` 통합 테스트** (DB 세션):
   - ledger에 `claude_cli` 행을 심어도 CLAUDE_CLI 집계는 snapshot만 반영(이중집계 없음).
   - snapshot 존재 시 CLAUDE_CLI 카드 토큰 > 0, Total에 포함.
   - `providers=[CODEX_CLI]` 필터 시 snapshot 미포함.

## 범위 밖 (YAGNI)

- External Usage `/summary`·`/sync`에서 실시간 monitor scan 트리거 (현재 Sessions 페이지 방문 sync로 충분, 데이터 당일까지 최신). 추후 "Sync Now"가 Claude scan까지 하도록 확장은 별도 작업.
- AOS `user_id`/`organization_id`/`project_id` 어트리뷰션 (snapshot에 없음, 호스트 스코프라 "Usage by Member"는 비어도 무방).
- tmux/warp claude_cli writer 은퇴 (단일 소스로 충분히 정합, working code 미변경).
- 프론트엔드 변경, DB 마이그레이션.

## 영향받는 파일

| 파일 | 변경 |
|---|---|
| `src/backend/services/external_usage_service.py` | 순수 함수 + 컬렉터 + get_summary 배선 + ledger claude_cli 제외 |
| `tests/backend/**/test_external_usage*.py` | 순수 함수 단위 + get_summary 통합 테스트 |
| `docs/llm-key-systems.md` | CLAUDE_CLI 소스=snapshot 명시(내부 ledger ≠ snapshot 함정) |

## 검증 게이트 (백엔드)

`ruff + mypy + pytest` (프로젝트 규약). 완료 선언 전 fresh 실행 증거 필수.
