# 800줄 초과 파일 분할 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** golden-principles.md의 파일 800줄 한도를 위반하는 비테스트 파일 33개(43,621줄)를 동작 보존 분할로 한도 이내로 되돌린다.

**Architecture:** 파일을 **디렉토리 패키지로 승격**하고 `__init__.py`(백엔드) / `index.ts`(프론트)가 기존 공개 이름을 재노출한다. 소비자의 import 경로는 바뀌지 않는다 — 이 레포에 이미 `src/dashboard/src/stores/orchestration/`이라는 선례가 있다(`orchestration.ts` → 동명 디렉토리, 소비자는 여전히 `from './stores/orchestration'`). 분할 단위는 기술 계층이 아니라 **책임**이다.

**Tech Stack:** Python 3 / FastAPI / SQLAlchemy async / pytest — React 19 / TypeScript / Zustand / Vitest

---

## Global Constraints

모든 태스크의 요구사항에 아래가 암묵적으로 포함된다.

1. **동작 보존이 유일한 성공 기준이다.** 이 계획의 어떤 태스크도 기능을 추가·수정·삭제하지 않는다. 리팩터링 중 발견한 버그는 고치지 말고 별도 이슈로 기록한다 (Surgical Changes).
2. **공개 import 경로는 불변이다.** 분할 전 유효했던 모든 import가 분할 후에도 유효해야 한다. 예: `from api.git import router`, `from services.organization_service import OrganizationService`, `import { useGitStore } from '@/stores/git'`. 패키지 `__init__.py` / `index.ts` 재노출로 보장하고, **분할 전에 `grep -rn`으로 실제 소비자를 전수 조사해 목록을 남긴다.**
3. **한도 = 파일 800줄** (golden-principles.md). 분할 결과 모든 산출 파일이 800줄 미만이어야 한다. 목표는 200~400줄 (coding-style.md 권장).
4. **테스트 파일은 이 계획의 대상이 아니다** (사용자 결정, 2026-08-04). 테스트는 응집도보다 망라성이 우선이라 한도를 적용하지 않는다.
5. **게이트 명령의 SSOT는 `verification-loop` 스킬이다.** 이 문서에 명령을 복제하지 않는다. 백엔드 트랙 = ruff + ruff format + mypy + pytest, 프론트 트랙 = tsc --noEmit + ESLint + vitest run + build.
   - **알려진 로컬 플레이크**: `test_embedding_model_consistency` 1건은 `.env`의 `RAG_EMBEDDING_MODEL` 오버라이드 때문에 로컬에서만 실패한다(CI는 통과). **이 1건만 실패하면 게이트 통과로 간주**한다. 다른 실패가 하나라도 섞이면 통과가 아니다.
6. **새 백엔드 async 테스트에는 `@pytest.mark.asyncio` 필수.** pytest rootdir이 repo 루트로 잡혀 `src/backend/pyproject.toml`의 `asyncio_mode = "auto"`가 적용되지 않는다(실질 STRICT). 빠뜨리면 CI에서 "async not supported"로 실패한다.
7. **mandatory-docs.md 적용.** `src/backend/` 수정 태스크는 착수 전 `docs/architecture.md`를 Read한다. `src/dashboard/` 수정은 `docs/dashboard.md`. API 모듈 레이아웃이 바뀌면 `docs/api-reference.md`도 갱신 대상이다. 문서 읽기는 그것이 필요한 태스크 안에 접어 넣는다(별도 태스크로 분리하지 않는다).
8. **새 의존성 추가 금지.** 분할은 코드 이동이지 도입이 아니다.
9. **커밋은 Conventional Commits**, 타입은 `refactor:`. 한 태스크 = 한 커밋.

---

## 이 계획의 범위 — 먼저 읽을 것

**대상은 33개 파일 / 43,621줄이다.** 이는 하나의 태스크가 아니라 **여러 세션에 걸친 프로그램**이다.

`superpowers:writing-plans`의 Scope Check를 적용해 다음과 같이 나눈다:

- **이 문서 = 프로그램 레벨 계획(전체 33파일의 배치·순서·판정 기준) + Batch 1의 실행 가능한 Task 레벨 계획**
- **Batch 2 이후는 각자의 계획 문서를 그 차례가 왔을 때 작성한다.** 33파일치 TDD 스텝을 한 문서에 담으면 "No Placeholders" 규칙을 어기거나(스텝이 추상화됨) 읽을 수 없는 문서가 된다. 이는 범위를 버리는 것이 아니라 스킬이 규정한 분할이다.
- **어떤 파일도 게이트 green 없이는 분할하지 않는다.**

사용자는 배치 단위로 중단할 수 있다. 각 배치는 그 자체로 완결된 개선이다.

---

## 순서 결정 규칙 (이 계획의 핵심 설계)

우선순위를 **줄 수로 정하지 않는다.** 분할 리팩터링의 실제 제약은 두 가지다.

### 축 1 — 이음매 종류 (작업 난이도)

| 종류 | 판정 기준 | 분할 방식 | 위험 |
|---|---|---|---|
| **라우트 나열** | `@router.*` 데코레이터 8개 이상 | 핸들러를 도메인별 모듈로 이동, `include_router`로 재조립 | **낮음** — 텍스트 이동 |
| **다중 클래스** | 최상위 `class` 3개 이상, 단일 클래스 비중 70% 미만 | 클래스 단위로 모듈 이동 | **중간** |
| **단일 거대 클래스** | 클래스 1개가 파일의 70% 이상 차지 | 클래스를 분해하거나 mixin/헬퍼로 위임 — 공유 `self` 상태를 갈라야 함 | **높음** |

### 축 2 — 회귀 안전망 (검증 가능성)

직접 대응 테스트가 있으면 기존 테스트가 안전망이 된다. 없으면 **분할 전에 characterization 테스트를 먼저 붙인다**(그 자체가 독립 태스크).

### 결과

**낮은 위험 × 안전망 있음**부터 시작해 **높은 위험 × 안전망 없음**으로 이동한다. `단일 거대 클래스 × 테스트 0건`은 마지막 배치이며, 그때는 분할 자체를 재검토한다 — 800줄 한도를 지키려고 응집된 클래스를 억지로 가르는 것이 순손실일 수 있다.

---

## 전체 인벤토리 (실측 2026-08-04)

### 백엔드 — 25파일 / 34,203줄

| 파일 | 줄수 | 이음매 | 직접 테스트 |
|---|---:|---|---|
| `api/git.py` | 2,022 | 라우트 63 | 4파일 1,383줄 |
| `api/project_configs.py` | 1,818 | 라우트 60 | **없음** |
| `api/agents.py` | 1,731 | 라우트 29 | 1파일 568줄 |
| `api/claude_sessions.py` | 1,352 | 라우트 25 | **없음** |
| `api/projects.py` | 873 | 라우트 14 | **없음** |
| `api/v1/agent_registry.py` | 816 | 라우트 8 | 2파일 1,078줄 |
| `api/usage.py` | 1,244 | 다중클래스 11 | 6파일 3,175줄 |
| `models/git.py` | 990 | 다중클래스 69 | 4파일 1,383줄 |
| `services/claude_session_monitor.py` | 1,927 | 다중클래스 5 | 1파일 118줄 |
| `orchestrator/nodes.py` | 1,714 | 다중클래스 6 | **없음** |
| `services/rag_service.py` | 1,534 | 다중클래스 3 | 1파일 861줄 |
| `services/merge_service.py` | 1,331 | 다중클래스 3 | **없음** |
| `services/notification_service.py` | 1,017 | 다중클래스 6 | 1파일 861줄 |
| `services/audit_service.py` | 985 | 다중클래스 6 | **없음** |
| `services/external_usage_service.py` | 932 | 다중클래스 5 | 1파일 503줄 |
| `services/tmux_service.py` | 920 | 다중클래스 3 | **없음** |
| `services/terminal_service.py` | 867 | 다중클래스 14 | 1파일 410줄 |
| `services/git_service.py` | 1,756 | 혼합 | 2파일 1,051줄 |
| `services/playground_service.py` | 1,249 | 혼합(69%) | 1파일 410줄 |
| `services/llm_service.py` | 874 | 혼합 | **없음** |
| `services/organization_service.py` | 2,229 | **단일거대클래스 91%** | 1파일 867줄 |
| `services/analytics_service.py` | 1,553 | **단일거대클래스 92%** | 1파일 696줄 |
| `services/feedback_service.py` | 1,368 | **단일거대클래스 96%** | **없음** |
| `services/project_config_monitor.py` | 1,289 | **단일거대클래스 96%** | **없음** |
| `services/cost_allocation_service.py` | 808 | **단일거대클래스 96%** | **없음** |

### 프론트엔드 — 8파일 / 9,418줄

| 파일 | 줄수 | 이음매 신호 | 직접 테스트 |
|---|---:|---|---|
| `stores/claudeSessions.ts` | 811 | 스토어 | 1,928줄 |
| `pages/AnalyticsPage.tsx` | 1,691 | useState 18 / useEffect 6 / 컴포넌트 11 | 1,915줄 |
| `pages/PlaygroundPage.tsx` | 1,748 | useState 26 / useEffect 6 / 컴포넌트 3 | 1,486줄 |
| `components/notifications/NotificationRuleEditor.tsx` | 1,156 | useState 19 / 컴포넌트 6 | 1,426줄 |
| `stores/git.ts` | 1,447 | 스토어 | 765줄 |
| `stores/projectConfigs.ts` | 1,553 | 스토어 | 707줄 |
| `components/git/WorkingDirectory.tsx` | 952 | useState 12 / 컴포넌트 5 | 287줄 |
| `components/TaskAnalyzer.tsx` | 1,064 | useState 6 / 컴포넌트 2 | **없음** |

**프론트엔드는 8개 중 7개가 실질적 테스트를 갖고 있다 — 백엔드(25개 중 13개만)보다 안전망이 훨씬 좋다.**

### 커버리지 게이트의 성격 (태스크 크기를 결정함)

- **프론트**: `src/dashboard/vitest.config.ts:28-32` — `statements 65 / branches 60 / functions 60 / lines 65`. **`perFile: true`가 없다 = 전역 백분율.** 따라서 파일을 쪼개도 커버되는 줄 수가 그대로라 수치가 움직이지 않는다. **추출한 모듈마다 테스트를 붙일 필요가 없다.**
- **백엔드**: CI는 `--cov-report=xml` 업로드만 한다. **임계 강제 없음.** 게이트는 ruff·mypy·pytest뿐이다.

---

## 배치 구성

| 배치 | 대상 | 줄수 | 근거 |
|---|---|---:|---|
| **B1** | `api/git.py` | 2,022 | 라우트 나열 + 최대 크기. **여기서 만드는 라우트 테이블 테스트가 B2 전체에 재사용된다** |
| **B2** | `api/project_configs.py`, `api/agents.py`, `api/claude_sessions.py`, `api/projects.py`, `api/v1/agent_registry.py` | 6,590 | 동일 이음매. B1의 레시피·테스트 도구를 그대로 적용 |
| **B3** | 프론트 스토어 3종 (`git.ts`, `projectConfigs.ts`, `claudeSessions.ts`) | 3,811 | `stores/orchestration/` 선례가 그대로 적용됨. 테스트 3,400줄 |
| **B4** | 프론트 페이지·컴포넌트 4종 (테스트 있는 것) | 5,547 | 컴포넌트/훅 추출. 판단이 들어가지만 안전망 두꺼움 |
| **B5** | 백엔드 다중클래스 9종 | 11,320 | 클래스 단위 이동. 테스트 없는 것은 characterization 선행 |
| **B6** | 단일 거대 클래스 5종 + `TaskAnalyzer.tsx` | 8,311 | **분할 여부부터 재검토.** 응집된 클래스를 한도 때문에 가르는 것이 손해일 수 있다 |

**B6는 착수 전 별도 판단이 필요하다.** 이 계획은 B6를 "분할한다"고 약속하지 않는다.

---

## Batch 1 — `src/backend/api/git.py` 분할

### File Structure

```
src/backend/api/git.py                    (2,022줄)  ← 삭제
src/backend/api/git/                       ← 신설 패키지
├── __init__.py          집계 라우터 + 재노출.       목표 ~60줄
├── _shared.py           공용 의존성·헬퍼·Pydantic 모델.  목표 ~150줄
├── repositories.py      GET/POST /repositories, {repo_id} CRUD          5 라우트
├── github.py            /github/{owner}/{repo}/* (info·branches·pulls)  5 라우트
├── branches.py          /projects/{id}/branches/*, branch-protection/*  8 라우트
├── commits.py           /projects/{id}/commits/*, draft-commits         5 라우트
├── remotes.py           /projects/{id}/remotes/*                        4 라우트
├── merge_requests.py    /projects/{id}/merge-requests/*                 8 라우트
├── merge.py             /projects/{id}/merge, merge/*                   8 라우트
└── working_tree.py      status·add·unstage·stage-hunks·staged-diff·
                         file-diff·file-hunks·working-status·commit·
                         push·pull·fetch·git-path·worktrees             20 라우트
```

각 모듈 목표 150~350줄. `working_tree.py`가 가장 크므로(20 라우트) 350줄을 넘으면 `staging.py`(add·unstage·stage-hunks·staged-diff·file-hunks)와 `sync.py`(push·pull·fetch·remotes 연동)로 한 번 더 가른다.

**책임 경계 근거**: 위 그룹은 임의 분류가 아니라 실제 URL 경로의 도메인 세그먼트다(2026-08-04 실측). 같이 바뀌는 것이 같이 있게 된다.

### Interfaces

- **Produces (B2 이후가 의존):**
  - `tests/backend/api/route_table.py` — `snapshot(router) -> list[list[str]]` 헬퍼. 임의 `APIRouter`의 (method, path, name) 목록을 정렬해 반환한다. B2의 5개 파일이 그대로 재사용한다.
  - `src/backend/api/git/__init__.py`의 `router` — 기존 `api.git.router`와 **동일한 이름·동일한 라우트 테이블**.
- **Consumes:** 없음 (첫 배치)

---

### Task 1: 라우트 테이블 characterization 테스트

**모드: characterization.** 새 동작을 만들지 않으므로 RED→GREEN이 아니다. 테스트를 쓰면 **즉시 PASS**한다 — 현재 동작을 고정하는 것이 목적이다. 대신 `verification.md`의 Red-Green 규칙을 characterization에 맞게 적용한다: 라우트를 하나 임시로 지워 **FAIL을 확인**해야 이 테스트가 실제로 유실을 잡는다는 것이 증명된다.

**Files:**
- Create: `tests/backend/api/route_table.py`
- Create: `tests/backend/api/test_git_route_table.py`
- Create: `tests/backend/api/git_route_table.json` (생성물, 커밋 대상)

- [ ] **Step 1: 착수 전 게이트가 green인지 확인**

Run (CWD `src/backend`):
```bash
uv run ruff check . && uv run mypy . --ignore-missing-imports --no-error-summary && uv run pytest ../../tests/backend -q --tb=line
```
Expected: ruff/mypy 0 에러. pytest는 `test_embedding_model_consistency` 1건 실패까지 허용(Global Constraints 5). 다른 실패가 있으면 **여기서 멈추고 보고한다** — 깨진 상태에서 분할하면 원인을 가릴 수 없다.

- [ ] **Step 2: 스냅샷 헬퍼 작성**

`tests/backend/api/route_table.py`:
```python
"""APIRouter의 HTTP 표면을 스냅샷으로 고정하는 헬퍼.

분할 리팩터링이 라우트를 잃거나 경로·이름을 바꾸지 않았음을 보증한다.
B1(api/git.py) 이후 B2의 라우트 나열 파일들이 그대로 재사용한다.
"""

from fastapi import APIRouter

# 프레임워크가 자동 부여하는 메서드는 계약이 아니므로 제외한다.
_IGNORED_METHODS = frozenset({"HEAD", "OPTIONS"})


def snapshot(router: APIRouter) -> list[list[str]]:
    """(method, path, endpoint name) 목록을 **등록 순서 그대로** 반환한다.

    정렬하지 않는 것이 핵심이다. FastAPI는 먼저 등록된 경로를 먼저 매칭하므로
    등록 순서 자체가 동작 계약이다. 정렬해 버리면 모듈을 다른 순서로
    include_router 했을 때 스냅샷이 동일해져 순서 회귀를 놓친다.

    name까지 포함하는 이유: 핸들러를 다른 모듈로 옮길 때 함수명이 바뀌면
    operationId가 달라져 OpenAPI 소비자가 깨진다. 경로만 보면 놓친다.
    """
    rows: list[list[str]] = []
    for route in router.routes:
        for method in sorted(getattr(route, "methods", set())):
            if method in _IGNORED_METHODS:
                continue
            rows.append([method, route.path, route.name])
    return rows
```

- [ ] **Step 3: 현재 라우트 테이블을 베이스라인으로 생성**

`tests/backend/api/`에는 이미 `__init__.py`가 있어 **패키지**다(실측 2026-08-04). 따라서 `sys.path` 주입 후 형제 모듈을 최상위로 import 하면 안 된다 — 그 패키지명이 `src/backend/api`와 충돌할 수 있다. **생성 단계에서는 헬퍼를 import 하지 말고 로직을 인라인**한다:

Run (CWD `src/backend`):
```bash
uv run python -c "
import json
from api.git import router
rows = [
    [m, r.path, r.name]
    for r in router.routes
    for m in sorted(getattr(r, 'methods', set()))
    if m not in ('HEAD', 'OPTIONS')
]   # 정렬하지 않는다 — 등록 순서가 곧 매칭 계약이다
print(json.dumps(rows, indent=2, ensure_ascii=False))
" > ../../tests/backend/api/git_route_table.json
```
(테스트 파일 쪽은 Step 5에서 **상대 import** `from .route_table import snapshot`을 쓴다 — `__init__.py`가 있으므로 유효하다.)

- [ ] **Step 4: 생성된 베이스라인 검수**

Run (CWD = repo 루트): `python3 -c "import json;d=json.load(open('tests/backend/api/git_route_table.json'));print(len(d))"`

Expected: **63** (2026-08-04 실측값 — `@router.` 데코레이터 63개와 일치하며 복수 메서드 라우트는 없음).

행 수가 63과 다르면 그 자체로는 오류가 아니다. 스냅샷은 `(method, path, name)` **쌍**을 세므로 한 핸들러가 `methods=["GET","POST"]`처럼 복수 메서드를 가지면 63을 넘는다. 판정 기준은 "63"이 아니라 **`grep -c '^@router\.' api/git/_legacy.py` 이상이고, 라우트 경로 목록이 육안으로 완전한가**이다. 63보다 *적으면* 반드시 원인을 찾는다.

- [ ] **Step 5: 테스트 작성**

`tests/backend/api/test_git_route_table.py`:
```python
"""api/git.py 분할이 HTTP 표면을 바꾸지 않았음을 보증한다."""

import json
from pathlib import Path

from api.git import router

from .route_table import snapshot  # 상대 import — tests/backend/api 는 패키지다

BASELINE = Path(__file__).parent / "git_route_table.json"


def test_git_route_table_unchanged() -> None:
    """라우트 유실·추가·개명을 잡는다."""
    expected = json.loads(BASELINE.read_text(encoding="utf-8"))
    actual = snapshot(router)

    missing = [r for r in expected if r not in actual]
    added = [r for r in actual if r not in expected]

    assert not missing, f"분할 과정에서 사라진 라우트: {missing}"
    assert not added, f"분할 과정에서 생긴 라우트: {added}"


def test_git_route_registration_order_unchanged() -> None:
    """등록 **순서**를 잡는다.

    위 테스트는 집합 비교라 순서에 눈이 멀다. FastAPI는 먼저 등록된 경로를
    먼저 매칭하므로, 모듈을 다른 순서로 include_router 하면 라우트 집합은
    같은데 매칭 결과가 달라진다 — 예: `/projects/{id}/merge` 가
    `/projects/{id}/merge/status` 보다 앞서면 후자가 영영 도달 불가일 수 있다.
    이 회귀는 프로덕션 라우팅을 조용히 깨므로 순서까지 고정한다.
    """
    expected = json.loads(BASELINE.read_text(encoding="utf-8"))
    actual = snapshot(router)

    assert actual == expected, (
        "라우트 등록 순서가 바뀌었다. __init__.py 의 include_router 호출 순서를 "
        "원본 api/git.py 의 선언 순서와 일치시킬 것."
    )


def test_router_prefix_and_tags_unchanged() -> None:
    """마운트 계약. app.py는 이 라우터를 prefix='/api'로 붙인다."""
    assert router.prefix == "/git"
    assert router.tags == ["git"]
```

- [ ] **Step 6: 테스트 실행 — PASS 확인**

Run (CWD `src/backend`): `uv run pytest ../../tests/backend/api/test_git_route_table.py -v`
Expected: 2 passed. (characterization이므로 처음부터 통과가 정상이다)

- [ ] **Step 7: Red-Green 검증 — 테스트가 실제로 유실을 잡는지 증명**

`src/backend/api/git.py`에서 `@router.get("/repositories")` 데코레이터가 붙은 함수 하나를 **임시로 주석 처리**한다.

Run (CWD `src/backend`): `uv run pytest ../../tests/backend/api/test_git_route_table.py -v`
Expected: **FAIL** — `분할 과정에서 사라진 라우트: [['GET', '/git/repositories', ...]]`

FAIL이 나오지 않으면 테스트가 무용하다. 원인을 찾아 고친 뒤 다시 이 스텝을 수행한다.

- [ ] **Step 8: 주석 처리 되돌리고 PASS 재확인**

Run: `git checkout -- src/backend/api/git.py` 후 `uv run pytest ../../tests/backend/api/test_git_route_table.py -v`
Expected: 2 passed.

- [ ] **Step 9: 커밋**

```bash
git add tests/backend/api/route_table.py tests/backend/api/test_git_route_table.py tests/backend/api/git_route_table.json
git commit -m "test(api): git 라우트 테이블 characterization 테스트 추가

분할 리팩터링 전 안전망. (method, path, name) 63건을 베이스라인으로
고정하고 유실·추가·개명을 잡는다. Red-Green 검증 완료 — 라우트 1건을
임시 제거하면 FAIL하고 복원하면 PASS한다.

route_table.snapshot() 헬퍼는 나머지 라우트 나열 파일
(project_configs 60·agents 29·claude_sessions 25·projects 14·
agent_registry 8)에도 재사용한다."
```

---

### Task 2: 소비자 전수 조사 + 패키지 껍데기 생성

**모드: 이동 준비.** 새 동작 없음.

**Files:**
- Read: `docs/architecture.md` (mandatory-docs.md — `src/backend/` 수정 태스크)
- Create: `src/backend/api/git/__init__.py`
- Create: `src/backend/api/git/_shared.py`
- Modify: `src/backend/api/git.py` → `src/backend/api/git/_legacy.py`로 이동(임시)

- [ ] **Step 1: `docs/architecture.md` 읽기**

Read `docs/architecture.md`. API 레이어 구조 서술이 `api/git.py`를 단일 파일로 명시하고 있으면 Task 10에서 갱신할 대상으로 기록한다.

- [ ] **Step 2: 소비자 전수 조사**

Run (CWD = repo 루트):
```bash
grep -rn "api\.git\|api/git\|from api import git" --include='*.py' src/backend tests/backend | grep -v '^src/backend/api/git' > /tmp/git_importers.txt
cat /tmp/git_importers.txt
```
결과를 이 계획서 하단 "Batch 1 소비자 목록"에 붙여넣는다. 각 import가 분할 후에도 유효해야 한다 (Global Constraints 2).

- [ ] **Step 3: 패키지로 승격 (내용은 아직 그대로)**

```bash
cd src/backend/api
mkdir git
git mv git.py git/_legacy.py
```
(`git.py`와 `git/`는 서로 다른 이름이라 충돌하지 않는다 — macOS APFS 대소문자 비구분 환경에서 1단계 이동이 동작함을 스크래치 레포로 실측 확인했다, 2026-08-04.)

`__pycache__/git.cpython-*.pyc`가 남아 있으면 stale 모듈이 새 패키지를 가릴 수 있다. 이동 직후 정리한다:
```bash
find src/backend -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true
```

- [ ] **Step 4: `__init__.py` 작성 — 재노출만**

`src/backend/api/git/__init__.py`:
```python
"""Git API 패키지.

`api/git.py`(2,022줄)를 도메인별 모듈로 분할한 결과. 소비자의 import 경로
(`from api.git import router`)는 분할 전과 동일하게 유지된다.
"""

from ._legacy import router

__all__ = ["router"]
```

- [ ] **Step 5: 게이트 실행 — 여기서 이미 green이어야 한다**

Run (CWD `src/backend`):
```bash
uv run ruff check . && uv run mypy . --ignore-missing-imports --no-error-summary && uv run pytest ../../tests/backend -q --tb=line
```
Expected: Task 1 Step 1과 동일한 결과(알려진 플레이크 1건 외 실패 0). **라우트 테이블 테스트가 통과해야 한다** — 통과하면 패키지 승격이 HTTP 표면을 건드리지 않았다는 뜻이다.

- [ ] **Step 6: 커밋**

```bash
git add -A src/backend/api/git
git commit -m "refactor(api): git.py를 패키지로 승격 (내용 무변경)

파일을 api/git/_legacy.py로 옮기고 __init__.py가 router를 재노출한다.
소비자 import 경로(from api.git import router)는 그대로다.
이 커밋은 코드를 한 줄도 바꾸지 않는다 — 이후 도메인별 추출의 발판이다."
```

---

### Task 3~10: 도메인 모듈 추출 (8회 반복)

각 태스크는 **아래 추출 레시피를 자기 파라미터로 1회 수행**한다. 레시피는 여기 한 번만 전부 적어두고, 각 태스크는 값만 다르다 — 같은 절차를 8번 복제하지 않는다.

#### 추출 레시피 (전문)

파라미터: `<MODULE>` (예: `repositories`), `<ROUTES>` (그 모듈이 가져갈 라우트 경로 목록)

- [ ] **R1: 대상 핸들러 식별**

Run (CWD `src/backend`):
```bash
grep -n '^@router\.' api/git/_legacy.py | grep -E '<ROUTES 정규식>'
```
출력된 줄 번호가 각 핸들러의 시작이다. 핸들러 본문은 다음 `@router.` 또는 파일 끝까지다.

- [ ] **R2: 새 모듈 생성**

`src/backend/api/git/<MODULE>.py`:
```python
"""<MODULE> 관련 Git API 라우트."""

from fastapi import APIRouter

from ._shared import get_git_service, ProjectRef   # ← 이 모듈이 실제로 쓰는 이름만 나열

router = APIRouter()
```

**star import(`from ._shared import *`)를 쓰지 않는다.** ruff가 F403/F405로 잡아 R6 게이트에서 실패한다 — 즉 레시피가 자기 검증 단계를 통과하지 못한다. 필요한 이름은 R1에서 식별한 핸들러 본문을 읽어 그대로 나열한다.
그 다음 R1에서 식별한 핸들러를 **한 글자도 바꾸지 않고** 잘라 붙인다. 데코레이터의 경로 문자열, 함수명, 시그니처, 본문 모두 원문 유지 — 이름이 바뀌면 Task 1의 테스트가 잡는다.

- [ ] **R3: 공용 의존성을 `_shared.py`로 승격**

핸들러가 쓰는 이름 중 `_legacy.py`에만 있는 것(Pydantic 모델·헬퍼 함수·의존성 주입 함수·상수)을 `_shared.py`로 옮기고, `_legacy.py`와 새 모듈 양쪽에서 `from ._shared import <이름>`으로 참조한다. **`_shared.py`가 800줄을 넘으면 안 된다** — 넘으면 `_models.py`(Pydantic)와 `_deps.py`(의존성)로 가른다.

- [ ] **R4: 집계 라우터에 등록**

`src/backend/api/git/__init__.py`에 추가:
```python
from . import <MODULE>

router.include_router(<MODULE>.router)
```
**등록 순서가 중요하다.** FastAPI는 먼저 등록된 경로가 먼저 매칭되므로, 구체 경로(`/projects/{id}/merge/status`)가 광범위 경로(`/projects/{id}/merge`)보다 앞에 와야 한다. 원본 `_legacy.py`의 선언 순서를 그대로 재현한다.

- [ ] **R5: 라우트 테이블 테스트로 즉시 검증**

Run (CWD `src/backend`): `uv run pytest ../../tests/backend/api/test_git_route_table.py -v`
Expected: 2 passed. **FAIL이면 다음 스텝으로 넘어가지 않는다** — 실패 메시지가 사라졌거나 늘어난 라우트를 정확히 알려준다.

- [ ] **R6: 전체 게이트**

Run (CWD `src/backend`):
```bash
uv run ruff check . && uv run ruff format --check . && uv run mypy . --ignore-missing-imports --no-error-summary && uv run pytest ../../tests/backend -q --tb=line
```
Expected: 알려진 플레이크 1건 외 실패 0.

- [ ] **R7: 줄 수 확인**

Run: `wc -l src/backend/api/git/*.py`
Expected: 모든 파일 800줄 미만. `_legacy.py`는 아직 클 수 있다(마지막 태스크에서 소멸).

- [ ] **R8: 커밋**

```bash
git add -A src/backend/api/git
git commit -m "refactor(api): git <MODULE> 라우트를 전용 모듈로 추출

<N>개 라우트를 api/git/<MODULE>.py로 이동. 핸들러 본문·경로·함수명 무변경.
라우트 테이블 characterization 테스트 통과 — HTTP 표면 동일."
```

#### 태스크별 파라미터

| 태스크 | `<MODULE>` | 라우트 수 | 경로 패턴 |
|---|---|---:|---|
| Task 3 | `repositories` | 5 | `/repositories`, `/repositories/{repo_id}` |
| Task 4 | `github` | 5 | `/github/{repo_owner}/{repo_name}/...` |
| Task 5 | `remotes` | 4 | `/projects/{project_id}/remotes...` |
| Task 6 | `branches` | 8 | `/projects/{project_id}/branches...`, `/branch-protection...` |
| Task 7 | `commits` | 5 | `/projects/{project_id}/commits...`, `/draft-commits` |
| Task 8 | `merge_requests` | 8 | `/projects/{project_id}/merge-requests...` |
| Task 9 | `merge` | 8 | `/projects/{project_id}/merge`, `/merge/...` |
| Task 10 | `working_tree` | 20 | 나머지 전부 (status·add·unstage·stage-hunks·staged-diff·file-diff·file-hunks·working-status·commit·push·pull·fetch·git-path·worktrees) |

**Task 3을 가장 작고 독립적인 `repositories`로 시작하는 이유**: 레시피 자체를 가장 싼 대상에서 검증한다. 여기서 레시피에 결함이 드러나면 5개 라우트만 되돌리면 된다.

**Task 10 주의**: 추출 후 `working_tree.py`가 800줄을 넘으면 `staging.py`(add·unstage·stage-hunks·staged-diff·file-hunks·file-diff)와 `sync.py`(push·pull·fetch)로 한 번 더 가른 뒤 커밋한다.

---

### Task 11: `_legacy.py` 소멸 + 문서 동기화

- [ ] **Step 1: `_legacy.py`가 비었는지 확인**

Run: `grep -c '^@router\.' src/backend/api/git/_legacy.py`
Expected: **0**. 0이 아니면 남은 라우트를 해당 도메인 모듈로 옮긴다.

- [ ] **Step 2: 잔여 코드 정리**

`_legacy.py`에 라우트가 없고 공용 정의만 남았다면 전부 `_shared.py`로 옮기고 파일을 삭제한다.
```bash
git rm src/backend/api/git/_legacy.py
```

- [ ] **Step 3: `__init__.py` 정리**

`from ._legacy import router` 줄을 제거하고, 집계 라우터를 직접 생성하도록 바꾼다:
```python
from fastapi import APIRouter

from . import branches, commits, github, merge, merge_requests, remotes, repositories, working_tree

router = APIRouter(prefix="/git", tags=["git"])

# 등록 순서 = 원본 api/git.py의 선언 순서. 구체 경로가 광범위 경로보다 앞이어야 한다.
router.include_router(repositories.router)
router.include_router(github.router)
router.include_router(branches.router)
router.include_router(commits.router)
router.include_router(remotes.router)
router.include_router(merge_requests.router)
router.include_router(merge.router)
router.include_router(working_tree.router)

__all__ = ["router"]
```

- [ ] **Step 4: 최종 검증 — 라우트 테이블 + 전체 게이트**

Run (CWD `src/backend`):
```bash
uv run pytest ../../tests/backend/api/test_git_route_table.py -v
uv run ruff check . && uv run ruff format --check . && uv run mypy . --ignore-missing-imports --no-error-summary && uv run pytest ../../tests/backend -q --tb=line
```
Expected: 라우트 테이블 2 passed(63건 동일), 게이트 실패 0(알려진 플레이크 제외).

- [ ] **Step 5: 줄 수 최종 확인**

Run: `wc -l src/backend/api/git/*.py | sort -rn`
Expected: 모든 파일 800줄 미만. 전체 합계는 원본 2,022줄 ± 5% 이내여야 한다 — 크게 늘었다면 코드가 복제된 것이다.

- [ ] **Step 6: 소비자 import 재확인**

Run (CWD = repo 루트):
```bash
grep -rn "api\.git\|api/git" --include='*.py' src/backend tests/backend | grep -v '^src/backend/api/git/'
```
Task 2 Step 2에서 기록한 목록과 대조한다. 모든 import가 그대로 유효해야 한다.

- [ ] **Step 7: 문서 동기화**

`docs/architecture.md`와 `docs/api-reference.md`에서 `api/git.py`를 단일 파일로 서술한 부분을 패키지 구조로 갱신한다. **API 엔드포인트 자체는 하나도 바뀌지 않았으므로 엔드포인트 목록은 손대지 않는다.**

- [ ] **Step 8: 커밋 + PR**

```bash
git add -A src/backend/api/git docs/
git commit -m "refactor(api): git.py 분할 완료 — _legacy 소멸, 문서 동기화

2,022줄 단일 파일을 8개 도메인 모듈(각 150~350줄)로 분할 완료.
HTTP 표면 무변경(라우트 63건 characterization 통과), 소비자 import
경로 무변경. golden-principles 800줄 한도 준수."
```

PR 본문에 포함할 것: 분할 전후 `wc -l` 비교표, 라우트 테이블 테스트 결과, 소비자 import 목록 대조 결과.

---

## Batch 1 소비자 목록

> Task 2 Step 2에서 채운다. 실행 전에는 비어 있다.

---

## Self-Review (계획 작성자 수행, 2026-08-04)

**1. 범위 커버리지** — 사용자 요구("테스트 파일 제외, 나머지 계획")는 33파일 전부를 배치 B1~B6에 배정해 충족했다. B6는 "분할 여부부터 재검토"로 명시해 무조건 분할을 약속하지 않았다.

**2. 플레이스홀더 스캔** — "TBD"·"적절히 처리"·"Task N과 유사" 없음. 추출 레시피는 8회 반복되는 절차를 한 번 완전히 기술하고 태스크별 파라미터 표로 값을 지정하는 형태이며, 각 스텝의 명령·코드는 실제 실행 가능한 내용이다.

**3. 타입·이름 일관성** — `snapshot(router)`는 Task 1에서 정의하고 Task 3~11에서 동일 이름으로 사용한다. `router` 심볼은 `api.git`의 공개 이름으로 Task 2(재노출)와 Task 11(직접 생성) 양쪽에서 동일하다.

**남은 불확실성** — `working_tree.py`(20 라우트)가 800줄을 넘을지는 실측 전까지 알 수 없다. Task 10에 분기 지시를 넣어 처리했다.

---

## 저장 위치

`superpowers:writing-plans`의 기본값은 `docs/superpowers/plans/`다. 레포 관례를 따라 `docs/plans/YYYY-MM-DD-<name>.md`에 둔다 (기존 6건과 동일 규칙).

`aos-workflow.md`가 규정한 `dev/active/<task-name>/` 3-파일 시스템을 쓰지 않은 이유: `.gitignore:92`가 그 경로를 "Dev docs (in-progress work)"로 **의도적으로 추적 제외**한다. 이 문서는 33파일·6배치·여러 세션에 걸치는 프로그램 계획이라 다음 세션이 반드시 찾을 수 있어야 하므로 추적되는 경로에 둔다. 배치별 실행 중 작업 메모는 `dev/active/`가 맞다.

`/execute-tasks-file` 자동 실행이 필요하면 `dev/active/`에 `tasks.md`를 `phase_runner.py migrate`로 생성할 수 있다.
