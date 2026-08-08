# Batch 5 — 백엔드 파일 분할 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.
>
> **상위 계획**: `docs/plans/2026-08-04-oversized-file-split.md` (B1·B2·B3·B4 완료)
> **직전 배치**: `docs/plans/2026-08-09-oversized-file-split-b4.md` — 그 문서의 "AnalyticsPage 처방 정정" 절을 먼저 읽을 것. 인벤토리 수치를 근사치로만 쓰는 습관이 거기서 나왔다.

**상태: 착수 준비 완료 (2026-08-09).** 인벤토리·`patch()` 타깃·모듈 상태·안전망 실측이 끝났고
태스크 순서가 확정됐다. **실측 결과 상위 계획서의 B5 분류축이 무효가 됐다** — "다중클래스 9종"이
아니라 집중도 기준으로 재구성했다. 아래 "배치 구성 정정" 참조.

**Goal:** 800줄 한도를 넘는 백엔드 파일 중 **클래스·정의 단위 이동만으로** 한도에 들어가는
5개(5,752줄)를 동작 보존 분할로 되돌린다.

**Tech Stack:** Python 3.11 / FastAPI / Pydantic / LangGraph / pytest

---

## 배치 구성 정정 (2026-08-09 실측) — 상위 계획서의 B5 정의를 대체한다

상위 계획서는 B5를 **"백엔드 다중클래스 9종 11,320줄"**, B6를 **"단일 거대 클래스 5종"**으로
나눴다. 이 분류축은 실측에서 무효가 됐다.

**클래스 *갯수*는 판정 지표가 아니다.** `claude_session_monitor.py`는 클래스가 5개지만 그중
하나가 파일의 79%를 차지하고, `git_service.py`는 2개인데 95%다. 이들은 "클래스 단위 이동"으로
해결되지 않는다 — 메서드 추출이 필요하고, 그건 B6의 "분할 여부부터 재검토" 성질이다.
반대로 `models/git.py`는 클래스가 69개인데 최대가 4%라 기계적으로 쪼개진다.

**진짜 지표는 집중도 = 최대 클래스 줄수 / 파일 줄수다.** B4에서 판정 지표가 줄수가 아니라
"섹션 줄수 / 읽는 state 수" 비율이었던 것과 같은 구조의 발견이다.

### 800줄 초과 백엔드 파일 전수 (2026-08-09, AST 실측, 테스트 제외)

| 줄수 | 클래스 | 최대 | 집중도 | 테스트줄 | 파일 | 배치 |
|---:|---:|---:|---:|---:|---|---|
| 1,245 | 11 | 35 | **3%** | 4,168 | `api/usage.py` | **B5** |
| 991 | 69 | 35 | **4%** | 4,623 | `models/git.py` | **B5** |
| 817 | 11 | 74 | **9%** | 1,483 | `api/v1/agent_registry.py` | 제외 (아래) |
| 868 | 14 | 102 | **12%** | 411 | `services/terminal_service.py` | **B5** |
| 1,715 | 6 | 478 | **28%** | 1,514 | `orchestrator/nodes.py` | **B5** |
| 933 | 5 | 270 | **29%** | 504 | `services/external_usage_service.py` | **B5** |
| 1,332 | 3 | 644 | 48% | 347 | `services/merge_service.py` | B5.5 후보 |
| 986 | 6 | 553 | 56% | 153 | `services/audit_service.py` | B5.5 후보 |
| 1,250 | 1 | 771 | 62% | 411 | `services/playground_service.py` | B5.5 후보 |
| 921 | 3 | 577 | 63% | 1,240 | `services/tmux_service.py` | B5.5 후보 |
| 1,018 | 6 | 666 | 65% | 862 | `services/notification_service.py` | B5.5 후보 |
| 875 | 2 | 614 | 70% | 1,651 | `services/llm_service.py` | B6 |
| 1,928 | 5 | 1,517 | 79% | 816 | `services/claude_session_monitor.py` | B6 |
| 1,535 | 3 | 1,231 | 80% | 1,596 | `services/rag_service.py` | B6 |
| 2,230 | 1 | 2,044 | 92% | 1,404 | `services/organization_service.py` | B6 |
| 1,554 | 1 | 1,439 | 93% | 697 | `services/analytics_service.py` | B6 |
| 1,290 | 1 | 1,206 | 93% | **0** | `services/project_config_monitor.py` | B6 |
| 809 | 1 | 765 | 95% | **0** | `services/cost_allocation_service.py` | B6 |
| 1,757 | 2 | 1,677 | 95% | 2,518 | `services/git_service.py` | B6 |
| 1,369 | 1 | 1,313 | 96% | **0** | `services/feedback_service.py` | B6 |

**컷은 35%다.** 자의적 선이 아니라 **데이터에 실제 간극이 있다** — 29%(`external_usage_service`)
다음이 48%(`merge_service`)로, 그 사이가 비어 있다. 29% 이하 그룹은 클래스·정의를 이름 그대로
옮기는 것만으로 한도에 들어가고, 48% 이상은 그렇지 않다.

**48~65% "혼합" 5개는 B5.5로 미룬다** — B4의 3a/3b처럼 2단계(클래스 이동 → 메서드 추출)가
필요하고, 그중 `audit_service`(153줄)·`merge_service`(347줄)는 안전망도 얇다. 이 계획은 이들을
분할한다고 약속하지 않는다.

**테스트 0줄 파일 3개**(`project_config_monitor` 1,290 · `cost_allocation_service` 809 ·
`feedback_service` 1,369)는 전부 집중도 93~96%다. characterization 선행 + 메서드 추출이 동시에
필요하므로 B6에서 함께 판단한다.

### `api/v1/agent_registry.py` 제외 (사용자 결정 2026-08-09)

집중도 9%로 B5 조건을 만족하지만 **제외한다.** 상위 계획서의 B2 정정(115~125행)이
`api/v1/` 6개 모듈 전부 **프로덕션 소비자 0건**임을 실측했고, B2도 같은 이유로 제외했다.
죽은 코드를 쪼개는 것은 낭비다. **삭제 여부는 별도 판단으로 남긴다** — 이 계획의 범위가 아니다.

---

## 착수 전 실측 — 완료 (2026-08-09)

B4에서 인벤토리는 0번 틀렸고 **처방·분류가 두 번 틀렸다**(AnalyticsPage 훅 추출 폐기,
"타입·상수"에 API 레이어 혼입 ×2). 아래를 실측했고 그 결과 배치 구성 자체가 바뀌었다.

- [x] **`patch()` 문자열 타깃 전수** — 모듈 경로 접두 정확 매칭. **import grep 으로는 절대
      안 잡히는 것**이며 B5 최대 함정이다.

  | 대상 | patch 타깃 |
  |---|---|
  | `api.usage` | **0건** ✅ |
  | `models.git` | **0건** ✅ |
  | `services.terminal_service` | **0건** ✅ |
  | `orchestrator.nodes` | **0건** ✅ |
  | `services.external_usage_service` | **1종 / 7회** ⚠️ `services.external_usage_service.httpx.AsyncClient` |

  > **⚠️ `external_usage_service` 만 계약이 있다.** 패치 대상이 `httpx.AsyncClient` 이므로
  > 엄밀히는 전역 `httpx` 모듈 속성을 건드리는 형태지만, **`services.external_usage_service`
  > 에 `httpx` 속성이 존재해야** 패치가 성립한다. 패키지 승격 시 `__init__.py` 가
  > `import httpx` 를 유지하거나, HTTP 호출 코드가 그 경로에 남아야 한다.
  > 재노출(`from .x import y`)로는 살아나지 않는 패치 유형이 별도로 존재하므로
  > (`module_split_string_patch_targets` 기록), **분할 후 해당 7개 테스트를 반드시 실행**한다.

- [x] **모듈 레벨 가변 상태 전수** — B5 의 하중 지지대다. 아래 참조.
- [x] **`models/git.py` 클래스 성격** → **Pydantic 이다** (63× `BaseModel` + 6× `str, Enum`).
      SQLAlchemy 가 아니므로 `Base.metadata` 축소 → Alembic autogenerate 파괴적 마이그레이션
      위험은 **해당 없음**. (SQLAlchemy 였다면 ruff·mypy 통과 상태로 마이그레이션이 깨진다.)
- [x] **`orchestrator/nodes.py` 등록 순서 계약** → **`nodes.py` 에 없다.** `StateGraph` 조립
      (`add_node`/`add_edge`)은 전부 `orchestrator/graph.py:145~` 에 있고 `nodes.py` 는 클래스
      정의만 한다. FastAPI `include_router` 순서 함정
      (`fastapi_include_order_is_contract`)의 LangGraph 판본을 우려했으나 **계약이 분할
      대상 밖에 있어 노출되지 않는다.**
- [x] **pytest 베이스라인** → **`1 failed, 1357 passed, 2 skipped`** (34.65s).
      유일한 실패는 `test_rag_verification.py::TestTroubleshooting::test_embedding_model_consistency`
      이며 로컬 `.env` 의 `RAG_EMBEDDING_MODEL` 오버라이드가 원인인 **알려진 플레이크**다
      (CI 는 통과). 분할 후 이 수치를 벗어나면 회귀다.
- [x] **안전망 도구 가용성** → B4 와 정반대로 **둘 다 쓸 수 있다.**
      - `tests/backend/api/split_audit.py` (B2 산출물, Python AST 전용) — 원본 파일 ↔ 분할
        패키지를 **이름으로** 매칭해 본문 대조. B4 에서는 `.tsx` 라 못 썼다.
      - `tests/backend/api/route_table.py` (B1 산출물) — `api/usage.py` 가 라우트 **7개**를
        가지므로 적용 대상이다.

---

## B5 의 하중 지지대 — 모듈 레벨 가변 상태

B4 의 지지대가 "훅 호출 순서를 바꾸지 않는다"였다면, B5 의 지지대는 이것이다:

> **모듈 레벨 가변 상태와, 그것을 읽거나 쓰는 함수는 같은 모듈에 남긴다.**

싱글턴 홀더와 캐시는 `global` 문으로 **재바인딩**된다. 함수를 서브모듈로 옮기고
`__init__.py` 에서 재노출하면 `global` 이 **서브모듈의 사본**에 바인딩돼 인스턴스·캐시가
둘로 갈린다. `ruff`·`mypy` 는 통과하고, 테스트도 한쪽 경로만 타면 통과한다.

### 실측된 상태 (2026-08-09)

| 파일 | 상태 | 함께 남겨야 할 것 |
|---|---|---|
| `api/usage.py` | `_usage_cache`(90) · `_codex_plan_cache`(75) | `_load/_save_usage_cache` · `_is_cache_valid` · `_is_cache_usable` · `_get_cache_age_minutes` · `get_usage` / `_cached_codex_plan_response` · `get_codex_plan_usage` |
| `models/git.py` | **`GIT_REPOSITORIES = {}`(848)** | `register_git_repository` · `get_git_repository` · `list_git_repositories` · `update_git_repository` · `delete_git_repository` · `sync_git_repositories_from_projects` (851–990, 연속 구간) |
| `services/terminal_service.py` | `_terminal_service = None`(859) | `get_terminal_service`(862–867) |
| `services/external_usage_service.py` | `_service_instance = None`(924) | `get_external_usage_service`(927–932) |
| `orchestrator/nodes.py` | **없음** | — |

> `api/usage.py` 의 캐시는 이 레포에서 이미 한 번 사고가 난 지점이다
> (`project_claude_usage_429_cache` — 429 를 401 로 오인 + 죽은 5분 캐시 코드).
> **캐시와 서빙 로직을 가르지 마라.**

---

## 태스크 순서 (확정 2026-08-09)

B1→B4 의 **"레시피를 가장 깨끗한 대상에서, 가장 두꺼운 그물 아래서 검증한다"**를 계승한다.
B5 는 여기에 축이 하나 더 있다 — **모듈 상태가 없는 것부터 한다.**

| 순서 | 파일 | 줄수 | 상태 | 그물 | 근거 |
|---|---|---:|---|---|---|
| **1** | `orchestrator/nodes.py` | 1,715 | **없음** | 테스트 1,514 + `split_audit` | 클래스 6개가 전부인 순수 구조. 모듈 상태 0·patch 0·등록 순서 계약 밖. **레시피 검증에 가장 깨끗하다** |
| **2** | `models/git.py` | 991 | `GIT_REPOSITORIES` | 테스트 **4,623** + `split_audit` | 69클래스 집중도 4%로 기계적. 그물이 가장 두꺼워 상태 함정을 여기서 만나는 게 안전하다 |
| **3** | `api/usage.py` | 1,245 | 캐시 2종 | 테스트 4,168 + `split_audit` + **`route_table`** | 유일하게 HTTP 표면이 있어 그물이 3겹. 캐시 2종이 최대 난이도 |
| **4** | `services/external_usage_service.py` | 933 | `_service_instance` | 테스트 504 + `split_audit` | **patch 계약 1종**. 분할 후 해당 7개 테스트 개별 실행 필수 |
| **5** | `services/terminal_service.py` | 868 | `_terminal_service` | 테스트 **411** + `split_audit` | 안전망이 가장 얇다. 레시피가 네 번 검증된 뒤 착수 |

합 **5,752줄** → 목표 전부 800 이내.

### 각 파일의 공통 절차

1. **패키지 승격** — `X.py` → `X/__init__.py`. 내용 무변경, `git mv` 로 rename 추적.
   소비자의 `from api.usage import Y` 는 패키지 해석으로 그대로 유효하다.
   **이 커밋의 SHA 를 기록한다** — `split_audit.py` 의 `<분할전-ref>` 는 **승격 직전** 커밋이어야
   한다(승격 이후를 쓰면 이미 옮겨진 상태와 비교하게 된다).
2. **정의 이동** — 클래스·함수를 도메인별 모듈로. **본문을 한 글자도 바꾸지 않는다.**
   위 "하중 지지대" 표의 상태·함수 묶음은 **가르지 않는다.**
3. **`__init__.py` 재노출** — `__all__` 은 **소비자 목록에서 역산한다**(B1 교훈).
   재노출 목록과 "그 파일이 자기 본문에서 쓰는 이름"은 서로 다른 집합이다.
4. **게이트** — 아래 참조.

### 분할 결과 검증

```bash
# CWD = repo 루트. <ref> 는 패키지 승격 직전 커밋
git show <ref>:src/backend/api/usage.py > /tmp/orig.py
src/backend/.venv/bin/python tests/backend/api/split_audit.py /tmp/orig.py src/backend/api/usage/
```

exit 0 = 유실·추가·본문 불일치·중복 정의 0건.

**라인 범위 diff 로 자기 확인하지 마라.** B2 `claude_sessions` 에서 추출과 검증이 같은 잘못된
범위를 써 `IDENTICAL` 오판이 났고 실제로는 `return results` 가 유실됐다. `split_audit.py` 가
라인 산술을 쓰지 않고 AST 이름 매칭을 하는 이유가 이것이다.

**`api/usage.py` 는 라우트 검산을 추가한다.** `len(router.routes)` 로 세지 마라 —
`include_router` 는 라우트를 평탄화하지 않으므로 그 값은 **서브라우터 수**다
(`fastapi_include_router_not_flattened`). `route_table.snapshot(router)` 로 (method, path, name)
목록을 집합 비교한다.

---

## 게이트

`verification-loop` 스킬의 백엔드 트랙. CWD = `src/backend`:

```bash
uv run ruff check .
uv run ruff format --check .
uv run mypy .
uv run pytest ../../tests/backend -q
```

**통과 기준은 `1 failed, 1357 passed, 2 skipped`** — 위 베이스라인과 동일해야 한다.
0 failed 가 아니라 **베이스라인 일치**가 기준이다. 수치가 이보다 *적으면* 테스트가 collection
단계에서 사라진 것이니 원인을 찾는다.

**새 async 테스트를 쓴다면 `@pytest.mark.asyncio` 필수.** pytest rootdir 가 repo 루트로 잡혀
`src/backend/pyproject.toml` 의 `asyncio_mode = "auto"` 가 적용되지 않는다(실질 STRICT).
빠뜨리면 CI Backend Tests 에서 "async not supported" 로 실패한다.

**`mypy` 를 빠뜨리지 마라.** CI 의 Backend Type Check 는 ruff·pytest 와 **별개 단계**다.

---

## B4 에서 가져올 운용 교훈

1. **import 의 진실원은 grep 이 아니라 도구다.** B4 에서 `tsc` 가 부족·과잉 양방향으로 잡았고,
   B2 에서는 `ruff` 가 같은 역할을 했다. B5 에서도 심볼 카운트는 근사치로만 쓰고 최종 판정은
   `ruff`·`mypy` 에 맡긴다.
2. **커밋 후 `git show --stat HEAD` 로 군더더기 확인.** pre-commit 훅이 무관한 미추적 파일
   (`paseo.json`)을 쓸어 담은 실측 사례가 있다.
3. **셸 CWD 가 Bash 호출 간 유지된다.** `cd src/backend` 후에는 `src/backend/...` 경로가
   pathspec 오류를 낸다.
4. **장시간 명령은 detach.** 이 워크스페이스는 포그라운드 명령을 약 150초에 `exit 144` 로
   죽인다(`timeout` 값 무관). `nohup ... & disown` + 로그 폴링.
5. **기계적 이동과 판단 작업의 커밋을 가른다.** B5 는 전부 기계적 이동이므로 파일당 1커밋이
   원칙이다. 메서드 추출이 필요해지면 그건 이 계획의 범위를 벗어난 신호다 — 멈추고 재판정한다.
6. **Codex 검증은 생략 없음.** `--scope branch --base main`. `working-tree` 는 커밋된 변경을
   못 본다. 실행 스크립트 경로는 글롭이 아니라 `sort -V | tail -1` 로 단일 확정.

---

## 착수 전 필수 (구현 시작 시)

- [ ] `docs/architecture.md` 를 Read 한다 (`mandatory-docs.md` — `src/backend/` 수정 전 필수).
- [ ] `git log -1` 로 브랜치 확인 (이 워크스페이스는 다중 세션으로 브랜치가 바뀐 사고가 있다).
- [ ] pytest 베이스라인 재확인 — 위 수치는 2026-08-09 기준이며, main 이 움직였으면 다시 잡는다.
