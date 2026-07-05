# External Usage Claude CLI snapshot — 후속 이슈 (나중에 진행)

- 날짜: 2026-07-05
- 상태: **미착수 (follow-up)** — PR #151 이후 별도 작업
- 출처: Codex stop-time review 지적 "snapshot time filter can miss updated Claude sessions"
- 관련: `docs/superpowers/specs/2026-07-05-external-usage-claude-cli-snapshot-source-design.md`, `docs/llm-key-systems.md`

## 이슈: External Usage Claude CLI 데이터가 stale/누락될 수 있음

PR #151은 `claude_session_snapshots` 테이블을 External Usage의 CLAUDE_CLI 소스로 **읽기만** 한다(`_collect_claude_snapshots`). 문제는 그 테이블의 신선도다.

### 근본 원인

- `claude_session_snapshots`는 `api/claude_sessions.py:_sync_sessions_to_db`가 **Claude Sessions 페이지가 로드될 때만**, 그리고 `file_size`가 바뀐 파일만 upsert한다.
- External Usage `/summary`(및 `_collect_claude_snapshots`)는 monitor 스캔(`discover_sessions`)이나 sync를 **트리거하지 않는다**. 그냥 테이블을 조회한다.
- 따라서 사용자가 Claude Sessions 페이지를 최근에 열지 않았다면:
  - 방금 cmux로 활동한 세션이 아직 DB에 없거나,
  - 기존 행의 `session_last_activity`가 실제 transcript보다 뒤처져 있을 수 있다.
- 그 결과 time filter(`session_last_activity ∈ [start, end]`)가 **최근 활동 세션을 누락**하거나 토큰이 실제보다 적게 집계된다.

### 증상

- External Usage의 Claude CLI 카드/Total이 실제 사용량보다 작게 표시.
- 방금 쓴 Claude 사용량이 카드에 안 나타남(Sessions 페이지를 열기 전까지).
- "Sync Now"(`/sync`) 버튼도 현재는 provider billing collector만 돌리고 Claude scan은 하지 않음 → 새로고침해도 Claude 최신화 안 됨.
- ledger 소스(Codex 등)는 실시간 기록이라 이 stale 특성이 없음 → **provider 간 UX 비대칭**.

## Fix 옵션

- **A) `_collect_claude_snapshots` 전에 증분 스캔 트리거**
  - monitor `discover_sessions()` + `_sync_sessions_to_db()`를 summary 조회 직전에 호출.
  - monitor는 `SessionFileCache`(mtime+size)로 변경 파일만 재파싱하므로 전체 재파싱 아님(비용 수용 가능).
  - 단, `/summary`가 매 호출마다 파일시스템 스캔(697+ 파일 stat) → 캐싱/rate-limit 고려 필요. `/summary`도 collect를 트리거하는 기존 함정(llm-key-systems.md 후속 #4)과 결이 같음.

- **B) "Sync Now"(`/sync`)에서만 Claude scan+sync 트리거 (권장, 저위험)**
  - 명시적 갱신 지점에만 monitor 스캔+sync 수행. 카드는 페이지 방문/Sync Now 시점 기준으로 최신화.
  - 매 페이지 로드 스캔 비용 없음. UX상 "Sync Now"의 의미와 부합.

- **C) monitor를 백그라운드 주기 poller로 승격**
  - `~/.claude/projects/`를 주기 스캔해 snapshot 상시 최신화. 범위 큼(라이프사이클/리소스 관리), YAGNI.

## 권장

**B**(명시적 Sync Now 트리거)를 우선. 실시간성이 더 필요하면 **A**를 캐시/디바운스와 함께. C는 과함.

## 착수 시 시작점

| 파일 | 역할 |
|---|---|
| `src/backend/services/external_usage_service.py` | `_collect_claude_snapshots` 앞 또는 `/sync` 경로에서 스캔 트리거 |
| `src/backend/api/external_usage.py` | `/sync` 엔드포인트에 Claude scan+sync 배선 |
| `src/backend/services/claude_session_monitor.py` | `discover_sessions()` (스캔) |
| `src/backend/api/claude_sessions.py` | `_sync_sessions_to_db()` (snapshot upsert) — 재사용 가능하도록 서비스로 추출 검토 |

## 테스트 관점

- 스캔 트리거 후 새 세션이 CLAUDE_CLI 집계에 반영되는지(통합).
- `/summary`가 스캔을 반복 트리거하지 않는지(캐시/디바운스, 옵션 A 채택 시).
- 스캔 실패가 summary를 깨뜨리지 않는지(best-effort 유지).
