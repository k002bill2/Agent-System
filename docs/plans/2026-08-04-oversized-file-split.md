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
4. **테스트 파일은 이 계획의 *분할* 대상이 아니다** (사용자 결정, 2026-08-04). 테스트는 응집도보다 망라성이 우선이라 800줄 한도를 적용하지 않는다.
   - **단, 테스트가 불변인 것은 아니다.** 테스트가 문자열로 모듈 내부를 참조하는 경우(`patch("api.git.foo")`, `monkeypatch.setattr("api.git.foo", ...)`) 그 함수가 다른 모듈로 이동하면 패치 타깃 문자열을 반드시 갱신해야 한다. **이 갱신은 이 계획이 명시적으로 허용하는 수반 변경이다** — 동작을 바꾸는 것이 아니라, 테스트가 내부 구조를 참조하기 때문에 구조가 바뀌면 따라가야 하는 것이다. 이를 "범위 초과"로 보지 않는다.
   - 대안(핸들러가 `from . import _shared` 후 `_shared.foo()`로 호출하도록 바꿔 패치 지점을 한 곳에 고정하는 방식)은 **채택하지 않았다.** 핸들러 본문의 호출 방식을 바꾸게 되는데, "핸들러를 한 글자도 바꾸지 않는다"는 것이 Task 1의 라우트 테이블 테스트를 충분한 안전망으로 만드는 근거다. 테스트 편집 횟수를 줄이려고 그 근거를 버리는 것은 손해다. 패치 타깃 23곳은 두 번 편집된다(Task 2 → `_legacy`, Task 6·7 → 최종 모듈). 이는 의도된 것이며 "최적화" 대상이 아니다.
5. **게이트 명령의 SSOT는 `verification-loop` 스킬이다.** 이 문서에 명령을 복제하지 않는다. 백엔드 트랙 = ruff + ruff format + mypy + pytest, 프론트 트랙 = tsc --noEmit + ESLint + vitest run + build.
   - **알려진 로컬 플레이크**: `test_embedding_model_consistency` 1건은 `.env`의 `RAG_EMBEDDING_MODEL` 오버라이드 때문에 로컬에서만 실패한다(CI는 통과). **이 1건만 실패하면 게이트 통과로 간주**한다. 다른 실패가 하나라도 섞이면 통과가 아니다.
6. **새 백엔드 async 테스트에는 `@pytest.mark.asyncio` 필수.** pytest rootdir이 repo 루트로 잡혀 `src/backend/pyproject.toml`의 `asyncio_mode = "auto"`가 적용되지 않는다(실질 STRICT). 빠뜨리면 CI에서 "async not supported"로 실패한다.
7. **mandatory-docs.md 적용.** `src/backend/` 수정 태스크는 착수 전 `docs/architecture.md`를 Read한다. `src/dashboard/` 수정은 `docs/dashboard.md`. API 모듈 레이아웃이 바뀌면 `docs/api-reference.md`도 갱신 대상이다. 문서 읽기는 그것이 필요한 태스크 안에 접어 넣는다(별도 태스크로 분리하지 않는다).
8. **새 의존성 추가 금지.** 분할은 코드 이동이지 도입이 아니다.
9. **커밋은 Conventional Commits.** 코드를 옮기는 분할·이동 커밋은 `refactor:`, 분할 전에 안전망을 깔아두는 characterization 테스트 커밋은 `test:`. 한 태스크 = 한 커밋.
   - 근거(2026-08-05 결정): characterization 태스크는 프로덕션 코드를 한 줄도 바꾸지 않고 테스트만 추가한다. 이를 `refactor:`로 부르면 커밋 타입이 변경의 성격을 잘못 전달한다. Task 1 리뷰가 이 문면 충돌을 지적해 사용자가 확정했다.

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
| `api/projects.py` | 873 | 라우트 14 | **없음** ※1 |
| `api/v1/agent_registry.py` | 816 | 라우트 8 | ~~2파일 1,078줄~~ → **1파일 807줄** ※2 |
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

> **※ B2 착수 시 실측으로 드러난 정정 (2026-08-08)** — 상세는 `docs/plans/2026-08-08-oversized-file-split-b2.md`
>
> **※1 `api/projects.py`**: "없음"이 맞다. 다만 파일명 문자열 grep(`api/projects`)은 `test_e2e_api.py`를
> 안전망으로 오인시킨다 — 그 테스트가 부르는 `/api/projects`는 **`orchestration` 태그의 다른 라우터**
> 소유다(OpenAPI 실측). 이 파일은 `/project-registry`를 서빙한다.
>
> **※2 `api/v1/agent_registry.py`**: 직접 테스트는 **1파일 807줄**(`tests/backend/api/test_agent_registry.py`)이다.
> 나머지 271줄(`tests/backend/test_agent_registry.py`)은 `services.agent_registry`를 테스트하며 API 라우터와 무관하다.
> **더 중요한 것**: 이 파일은 **앱에 마운트되지 않는다**(`app.py`가 한 번도 `api.v1`을 마운트한 적 없음 —
> `git log -S` 무출력). `api/v1/` 6개 모듈 전부 프로덕션 소비자 0건이다. 따라서 **B2에서 제외**했다.
>
> **교훈**: 이 인벤토리의 "직접 테스트" 열은 파일명 근접성으로 셌기 때문에 두 방향 모두로 틀릴 수 있다.
> 각 배치 착수 시 **테스트가 실제로 그 라우터의 경로를 호출하는지** 실측하라.

### 커버리지 게이트의 성격 (태스크 크기를 결정함)

- **프론트**: `src/dashboard/vitest.config.ts:28-32` — `statements 65 / branches 60 / functions 60 / lines 65`. **`perFile: true`가 없다 = 전역 백분율.** 따라서 파일을 쪼개도 커버되는 줄 수가 그대로라 수치가 움직이지 않는다. **추출한 모듈마다 테스트를 붙일 필요가 없다.**
- **백엔드**: CI는 `--cov-report=xml` 업로드만 한다. **임계 강제 없음.** 게이트는 ruff·mypy·pytest뿐이다.

---

## 배치 구성

| 배치 | 대상 | 줄수 | 근거 |
|---|---|---:|---|
| **B1** ✅ **완료 (2026-08-08)** | `api/git.py` | 2,022 | 라우트 나열 + 최대 크기. **여기서 만드는 라우트 테이블 테스트가 B2 전체에 재사용된다** |
| **B2** ✅ **완료 (2026-08-08, PR #241·#242)** | `api/project_configs.py`, `api/agents.py`, `api/claude_sessions.py`, `api/projects.py`, ~~`api/v1/agent_registry.py`~~ | 6,590 | 동일 이음매. B1의 레시피·테스트 도구를 그대로 적용. `api/v1/agent_registry.py`는 **프로덕션 소비자 0건**으로 착수 시 제외됨 |

> **B2 착수 조건 — `shadowing_pairs()`의 알려진 한계 (Codex 지적, 2026-08-05, 유예 결정)**
>
> `shadowing_pairs()`는 **완전 가림**(뒤 라우트가 절대 도달 불가)만 탐지한다. **부분 겹침**은 놓친다 — 앞 `GET /items/{id:int}`와 뒤 `GET /items/{value:float}`는 `/items/1`에서 겹쳐 순서를 바꾸면 정수 입력의 처리 핸들러가 달라지지만, `_concrete_path`가 float를 `1.0`으로 채우므로 int 정규식에 걸리지 않아 쌍이 보고되지 않는다.
>
> **B1에서 고치지 않은 이유**: (1) 백엔드 전체에 제약 컨버터가 `{branch_name:path}` 3건뿐이고 int·float·uuid는 **0건**이라 이 시나리오가 존재하지 않는다(실측). (2) 부분 겹침을 가림으로 보고하면 의도적 폴백 설계(`{id:int}` 먼저, `{slug:str}` 나중)를 거짓 경보로 잡는다 — 무시당하는 안전망은 없는 것보다 나쁘다. (3) 헬퍼를 범용 라우팅 검증 도구로 만드는 것은 이 계획의 범위가 아니다(YAGNI).
>
> **B2 착수 시 반드시 실측하라**: `grep -rhoE '\{[a-zA-Z_][a-zA-Z0-9_]*:[a-z]+\}' <대상파일>`로 대상 파일의 컨버터 사용을 확인한다. `int`·`float`·`uuid`가 **하나라도 나오면** 이 유예는 무효이며, `shadowing_pairs()`를 정규식 교집합 방식으로 강화한 뒤 진행한다. `test_convertor_samples_cover_starlette_and_are_valid`는 Starlette가 컨버터 종류를 늘릴 때만 깨지며, 코드베이스가 제약 컨버터를 **쓰기 시작하는 것**은 잡지 못한다.
| **B3** ✅ **완료 (2026-08-08, PR #243)** | 프론트 스토어 3종 (`git.ts`, `projectConfigs.ts`, `claudeSessions.ts`) | 3,811 | `stores/orchestration/` 선례가 그대로 적용됨. 테스트 3,400줄 |
| **B4** ✅ **완료 (2026-08-09, PR #246)** | 프론트 페이지·컴포넌트 **3종** (`NotificationRuleEditor` · `WorkingDirectory` · `AnalyticsPage`) | 3,799 | 계획: `docs/plans/2026-08-09-oversized-file-split-b4.md`. `PlaygroundPage.tsx`(1,748)는 **사용자 결정으로 제외** — `useState` 26개인 단일 거대 컴포넌트라 B6 성질 |
| **B5** | 백엔드 **집중도 <35% 5종** (`orchestrator/nodes.py` · `models/git.py` · `api/usage.py` · `external_usage_service.py` · `terminal_service.py`) | 5,752 | 계획: `docs/plans/2026-08-09-oversized-file-split-b5.md`. 클래스·정의 단위 이동만으로 한도 진입 |
| **B5.5** | 백엔드 집중도 48~65% 5종 (`merge` · `audit` · `playground` · `tmux` · `notification` service) | 5,507 | 클래스 이동만으로 부족 — B4의 3a/3b처럼 **2단계**(이동 → 메서드 추출) 필요. 미착수·미약속 |
| **B6** | 백엔드 집중도 70%+ 9종 + `PlaygroundPage.tsx` + `TaskAnalyzer.tsx` | — | **분할 여부부터 재검토.** 응집된 클래스를 한도 때문에 가르는 것이 손해일 수 있다 |

> **⚠️ B5/B6 분류축이 2026-08-09 실측으로 교체됐다.** 원래 "백엔드 다중클래스 9종 / 단일 거대
> 클래스 5종"이었으나, **클래스 갯수는 판정 지표가 아니다** — `claude_session_monitor.py`는
> 클래스 5개인데 하나가 79%를 차지하고 `git_service.py`는 2개인데 95%다. 이들은 클래스 단위
> 이동으로 해결되지 않는다. 반대로 `models/git.py`는 69개인데 최대가 4%라 기계적으로 쪼개진다.
> **진짜 지표는 집중도 = 최대 클래스 줄수 / 파일 줄수**이며, 실측 데이터에 29% → 48% 간극이
> 있어 35%가 자연스러운 컷이다. 전수 표는 B5 계획서에 있다.
> (B4에서 판정 지표가 줄수가 아니라 "섹션 줄수 / 읽는 state 수" 비율이었던 것과 같은 구조.)

**B6는 착수 전 별도 판단이 필요하다.** 이 계획은 B6를 "분할한다"고 약속하지 않는다.
**B5.5도 마찬가지다** — 그중 `audit_service`(테스트 153줄)·`merge_service`(347줄)는 안전망이 얇고,
B6의 `project_config_monitor`·`cost_allocation_service`·`feedback_service`는 **테스트가 0줄**이라
characterization 선행이 필수다.

---

## Batch 1 — `src/backend/api/git.py` 분할

> ## ✅ Batch 1 완료 (2026-08-08, 브랜치 `refactor/split-api-git`)
>
> Task 1~11 전부 실행됨. 레시피 체크박스는 8회 반복분을 공유하므로 체크하지 않았다 —
> **진척의 진실원은 이 블록과 git log다.**
>
> | 태스크 | 커밋 | 산출 |
> |---|---|---|
> | 1 characterization / 2 패키지 승격 | `4482b3c`·`225a9c7` / `66daffc` | `route_table.py`, `_legacy.py` |
> | 3~7 repositories·github·remotes·branches·commits | `5958087`·`35f9ec9`·`7aa2166`·`7591c10`·`942bbc6` | 5 모듈 |
> | 8~10 merge_requests·merge·working_tree | `02206d9`·`4fd31ba`·`cc8ec9c` | 3 모듈 |
> | 11 `_legacy` 소멸 + 문서 동기화 | `6daebb4` | 패키지 완성 |
>
> **최종 형태** — 2,022줄 단일 파일 → 9파일 합계 2,168줄(+7.2%), 최대 402줄:
> `branches` 402 · `commits` 372 · `working_tree` 332 · `merge_requests` 326 · `merge` 204 ·
> `github` 199 · `repositories` 109 · `_shared` 108 · `remotes` 71 · `__init__` 45
>
> **+7.2%가 코드 복제가 아닌 근거**: 함수 정의 중복 **0건**(실측). 증가분은 8개 모듈이
> 각자 독스트링·import·`router = APIRouter()`를 갖는 경계 비용이다. 계획의 ±5% 기준
> (Task 11 Step 5)을 넘지만 원인이 규명됐으므로 통과로 판정한다.
>
> **검증**: 라우트 63건 동일·가림 쌍 0건(매 태스크), pytest 1,340 passed(알려진 로컬
> 플레이크 1건 제외), ruff·ruff format·mypy 0, 소비자 import 5건 전부 유효(하단 목록 대조),
> Codex 리뷰 4회 지적 0건, wheel 패키징에 `api/git/` 8모듈 포함 확인.
>
> **한계**: 브랜치 미푸시 상태라 **CI 검증은 없다.** 새 테스트·의존성·pyproject 변경이
> 없어 위험은 낮지만(`@pytest.mark.asyncio` 노출 없음, `uv.lock` 무변경), "로컬 게이트
> green"이 "CI green"은 아니다. PR이 이를 해소한다.
>
> **B2 착수 전 필수**: 위 "B2 착수 조건"(컨버터 실측)을 반드시 먼저 수행하라.
> B1 통과는 `shadowing_pairs()`가 **완전 가림** 부재만 증명했을 뿐, 부분 겹침은
> 여전히 미탐지다.

### File Structure

```
src/backend/api/git.py                    (2,022줄)  ← 삭제
src/backend/api/git/                       ← 신설 패키지
├── __init__.py          집계 라우터 + 재노출.       목표 ~60줄
├── _shared.py           공용 의존성·헬퍼·Pydantic 모델.  목표 ~150줄
├── repositories.py      GET/POST /repositories, {repo_id} CRUD          5 라우트
├── github.py            /github/{owner}/{repo}/* (pulls·info·branches)  8 라우트
├── branches.py          /projects/{id}/branches/*, branch-protection/* 10 라우트
├── commits.py           /projects/{id}/commits/*, draft-commits         5 라우트
├── remotes.py           /projects/{id}/remotes/*                        4 라우트
├── merge_requests.py    /projects/{id}/merge-requests/*                 9 라우트
├── merge.py             /projects/{id}/merge, merge/*                   8 라우트
└── working_tree.py      status·git-path·worktrees·working-status·add·
                         commit·unstage·file-diff·staged-diff·file-hunks·
                         stage-hunks·fetch·pull·push                    14 라우트
```

각 모듈 목표 150~350줄. 라우트 수는 2026-08-05 실측이며 합계 63으로 검산된다. `branches.py`(10)와 `merge_requests.py`(9)가 가장 크다 — 350줄을 넘으면 `branches.py`는 `branch_protection.py`를 분리하고, `working_tree.py`는 `staging.py`(add·unstage·stage-hunks·staged-diff·file-hunks·file-diff)와 `sync.py`(fetch·pull·push)로 가른다.

**책임 경계 근거**: 위 그룹은 임의 분류가 아니라 실제 URL 경로의 도메인 세그먼트다(2026-08-04 실측). 같이 바뀌는 것이 같이 있게 된다.

### Interfaces

- **Produces (B2 이후가 의존):**
  - `tests/backend/api/route_table.py` — 헬퍼 2종. `snapshot(router) -> list[list[str]]`은 임의 `APIRouter`의 (method, path, name) 목록을 등록 순서대로 반환하고(비교는 집합으로 한다), `shadowing_pairs(router) -> list[tuple[str, str]]`은 앞선 라우트가 뒤 라우트를 가려 도달 불가로 만드는 쌍을 찾는다. B2의 5개 파일이 그대로 재사용한다.
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

import re

from fastapi import APIRouter

# 프레임워크가 자동 부여하는 메서드는 계약이 아니므로 제외한다.
_IGNORED_METHODS = frozenset({"HEAD", "OPTIONS"})

# `/projects/{project_id}/status` → `/projects/X/status`
_PARAM = re.compile(r"\{[^}]+\}")


def snapshot(router: APIRouter) -> list[list[str]]:
    """(method, path, endpoint name) 목록을 **등록 순서 그대로** 반환한다.

    정렬하지 않는 것은 진단 편의 때문이다(실패 메시지가 원본 배치를 보여준다).
    비교는 집합으로 한다 — 전역 등록 순서는 동작 계약이 아니기 때문이다.
    분할은 도메인 모듈을 통째로 include_router 하므로 원본에서 흩어져 있던
    같은 도메인의 라우트가 한 덩어리로 뭉친다. 실측(2026-08-04) 결과
    branch-protection·draft-commits·fetch/pull/push가 자기 도메인 그룹과
    떨어져 선언돼 있어 전역 순서 복원은 애초에 불가능하다.

    순서가 실제로 문제되는 유일한 경우는 `shadowing_pairs()`가 잡는다.

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


def shadowing_pairs(router: APIRouter) -> list[tuple[str, str]]:
    """먼저 등록된 라우트가 뒤 라우트를 영영 가려버리는 쌍을 찾는다.

    Starlette는 등록 순서대로 **전체 경로**를 정규식 매칭한다. 따라서
    `/projects/{id}/merge`가 `/projects/{id}/merge/status`를 가리는 일은
    없다(세그먼트 수가 다르다). 실제 가림은 같은 모양일 때만 생긴다 —
    `/branches/{branch_name}`가 뒤따르는 `/branches/current`를 삼키는 식.

    판정: 두 라우트의 HTTP 메서드가 겹치고, 뒤 라우트의 경로 파라미터를
    임의 리터럴로 채운 결과가 앞 라우트의 정규식에 걸리면 가림이다.

    실측(2026-08-04): 현재 63개 라우트에 이런 쌍은 **0건**이다. 이 함수는
    분할이 그 성질을 깨지 않았음을 보증한다.
    """
    routes = [r for r in router.routes if hasattr(r, "path_regex")]
    pairs: list[tuple[str, str]] = []
    for index, earlier in enumerate(routes):
        earlier_methods = set(getattr(earlier, "methods", set())) - _IGNORED_METHODS
        for later in routes[index + 1 :]:
            later_methods = set(getattr(later, "methods", set())) - _IGNORED_METHODS
            if not (earlier_methods & later_methods):
                continue
            if earlier.path_regex.fullmatch(_PARAM.sub("X", later.path)):
                pairs.append((earlier.path, later.path))
    return pairs
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

Expected: **63** (2026-08-05 재실측 확인 — `@router.` 데코레이터 63개, 복수 메서드 라우트 0건, WebSocket 라우트 0건, 중첩 `include_router` 0건).

행 수가 63과 다르면 그 자체로는 오류가 아니다. 스냅샷은 `(method, path, name)` **쌍**을 세므로 한 핸들러가 `methods=["GET","POST"]`처럼 복수 메서드를 가지면 63을 넘는다. 판정 기준은 "63"이 아니라 **`grep -c '^@router\.' api/git.py` 이상이고, 라우트 경로 목록이 육안으로 완전한가**이다(이 시점에는 아직 `api/git.py`다 — `_legacy.py`는 Task 2에서 생긴다). 63보다 *적으면* 반드시 원인을 찾는다.

- [ ] **Step 5: 테스트 작성**

`tests/backend/api/test_git_route_table.py`:
```python
"""api/git.py 분할이 HTTP 표면을 바꾸지 않았음을 보증한다."""

import json
from pathlib import Path

from api.git import router

from .route_table import shadowing_pairs, snapshot  # 상대 import — 패키지다

BASELINE = Path(__file__).parent / "git_route_table.json"


def test_git_route_table_unchanged() -> None:
    """라우트 유실·추가·개명을 잡는다."""
    expected = json.loads(BASELINE.read_text(encoding="utf-8"))
    actual = snapshot(router)

    missing = [r for r in expected if r not in actual]
    added = [r for r in actual if r not in expected]

    assert not missing, f"분할 과정에서 사라진 라우트: {missing}"
    assert not added, f"분할 과정에서 생긴 라우트: {added}"


def test_no_shadowing_route_pairs() -> None:
    """먼저 등록된 경로가 뒤 경로를 가리지 않음을 보증한다.

    위 테스트는 집합 비교라 순서에 눈이 멀다. 그런데 **전역 등록 순서는
    동작 계약이 아니다** — 분할은 도메인 모듈을 통째로 include_router 하므로
    원본에서 흩어져 있던 같은 도메인 라우트가 뭉치고, 전역 순서는 반드시
    바뀐다(실측 2026-08-05: branch-protection·draft-commits·fetch/pull/push가
    자기 도메인과 떨어져 선언돼 있어 원본 순서 복원은 불가능하다).

    순서가 실제로 동작을 바꾸는 경우는 하나뿐이다: 앞선 라우트의 정규식이
    뒤 라우트의 구체 경로를 삼켜 후자가 영영 도달 불가가 되는 것. 현재
    63개 라우트에 그런 쌍은 0건이며(실측), 분할이 이를 깨면 안 된다.
    """
    pairs = shadowing_pairs(router)

    assert pairs == [], (
        f"경로 가림 발생 — 뒤 라우트가 도달 불가다: {pairs}. "
        "__init__.py 의 include_router 순서에서 구체 경로 모듈을 "
        "파라미터 경로 모듈보다 앞에 둘 것."
    )


def test_router_prefix_and_tags_unchanged() -> None:
    """마운트 계약. app.py는 이 라우터를 prefix='/api'로 붙인다."""
    assert router.prefix == "/git"
    assert router.tags == ["git"]
```

- [ ] **Step 6: 테스트 실행 — PASS 확인**

Run (CWD `src/backend`): `uv run pytest ../../tests/backend/api/test_git_route_table.py -v`
Expected: **failed 0 — 이 파일의 모든 테스트가 통과**. (characterization이므로 처음부터 통과가 정상이다)

숫자를 기준으로 삼지 않는다. "N passed"를 맞추려고 테스트를 지우거나 더하는 것은 이 스텝의 목적을 뒤집는다.

- [ ] **Step 7: Red-Green 검증 — 테스트가 실제로 유실을 잡는지 증명**

`src/backend/api/git.py`에서 `@router.get("/repositories")` 데코레이터가 붙은 함수 하나를 **임시로 주석 처리**한다.

Run (CWD `src/backend`): `uv run pytest ../../tests/backend/api/test_git_route_table.py -v`
Expected: **FAIL** — `분할 과정에서 사라진 라우트: [['GET', '/git/repositories', ...]]`

FAIL이 나오지 않으면 테스트가 무용하다. 원인을 찾아 고친 뒤 다시 이 스텝을 수행한다.

- [ ] **Step 8: 주석 처리 되돌리고 PASS 재확인**

Run: `git checkout -- src/backend/api/git.py` 후 `uv run pytest ../../tests/backend/api/test_git_route_table.py -v`
Expected: failed 0 — 이 파일의 모든 테스트가 다시 통과.

- [ ] **Step 9: 커밋**

```bash
git add tests/backend/api/route_table.py tests/backend/api/test_git_route_table.py tests/backend/api/git_route_table.json
git commit -m "test(api): git 라우트 테이블 characterization 테스트 추가

분할 리팩터링 전 안전망. (method, path, name) 63건을 베이스라인으로
고정하고 유실·추가·개명을 잡는다. 전역 등록 순서 대신 경로 가림
(shadowing) 쌍 0건을 불변식으로 고정한다 — 순서는 계약이 아니지만
앞선 라우트가 뒤 라우트를 삼키는 것은 계약 위반이다.
Red-Green 검증 완료 — 라우트 1건을 임시 제거하면 FAIL하고 복원하면 PASS한다.

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
- Modify: `src/backend/api/git.py` → `src/backend/api/git/_legacy.py`로 이동(임시)
- Modify: `tests/backend/api/test_api_git_prune.py`, `tests/backend/test_llm_usage_instrumentation.py` (Step 4b 패치 타깃)

**`_shared.py`는 이 태스크에서 만들지 않는다.** 공용 정의를 옮기는 것은 Task 3 이후 추출 레시피의 R3 단계다. 이 태스크에서 빈 파일을 만들면 의미 없는 파일이 커밋된다. (초안에는 이 태스크의 Create 목록에 있었으나 Step 1~6 어디에도 생성 지시가 없어 모순이었다 — Task 2 리뷰가 지적해 2026-08-05에 제거했다.)

- [ ] **Step 1: `docs/architecture.md` 읽기**

Read `docs/architecture.md`. API 레이어 구조 서술이 `api/git.py`를 단일 파일로 명시하고 있으면 Task 10에서 갱신할 대상으로 기록한다.

- [ ] **Step 2: 소비자 전수 조사**

Run (CWD = repo 루트):
```bash
grep -rn "from \.git import\|from \. import git\|from api\.git import\|import api\.git\|from api import git\|safe_import(\"api\.git\"" \
  --include='*.py' src/backend tests/backend | grep -v '^src/backend/api/git'
```

**상대 import 형태(`from .git import`)를 반드시 포함한다.** 계획 초안의 `api\.git|api/git` 패턴만으로는 같은 패키지 내부의 상대 import를 놓치고, 그러면 가장 중요한 소비자가 "0건"으로 기록된다.

결과를 이 계획서 하단 "Batch 1 소비자 목록"에 채운다(임시 파일이 아니라 **추적되는 계획서에** 남긴다 — Task 11 Step 6이 이 목록과 대조하는데 세션이 바뀌면 `/tmp`는 사라진다). 각 import가 분할 후에도 유효해야 한다 (Global Constraints 2).

**전수 조사는 2026-08-05에 이미 수행됐다 — 하단 목록 참조.** 이 스텝에서는 그 목록이 여전히 정확한지만 재확인한다(다중 세션 환경이라 그 사이 소비자가 늘었을 수 있다).

- [ ] **Step 3: 패키지로 승격 (내용은 아직 그대로)**

```bash
cd src/backend/api
mkdir git
git mv git.py git/_legacy.py
```
(`git.py`와 `git/`는 서로 다른 이름이라 충돌하지 않는다 — macOS APFS 대소문자 비구분 환경에서 1단계 이동이 동작함을 스크래치 레포로 실측 확인했다, 2026-08-04.)

`__pycache__/git.cpython-*.pyc`가 남아 있으면 stale 모듈이 새 패키지를 가릴 수 있다. 이동 직후 정리한다. `.mypy_cache`도 함께 지운다 — `pyproject.toml`이 `explicit_package_bases` + `mypy_path = "."`를 쓰므로 `api.git`을 **모듈**로 기록한 증분 캐시가 이제 **패키지**가 된 것과 충돌해 가짜 에러를 낸다. 스테일 캐시 오탐은 진짜 패키징 오류와 똑같이 생겼다:
```bash
find src/backend -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true
rm -rf src/backend/.mypy_cache
```

- [ ] **Step 3b: 이동이 rename으로 스테이징됐는지 확인 (필수)**

Run (CWD = repo 루트): `git status --short src/backend/api/`

Expected: `R  src/backend/api/git.py -> src/backend/api/git/_legacy.py`

**`git.py`가 새 `git/` 패키지와 나란히 살아남으면 안 된다.** 그 상태에서는 Python이 패키지를 먼저 해석해 모듈을 가리므로 **라우트 테이블 테스트를 포함한 모든 테스트가 그대로 통과하면서** 800줄 파일은 추적된 채 남는다 — 목표를 하나도 달성하지 못했는데 모든 신호가 초록이다. 다른 어떤 검사도 이 두 상태를 구분하지 못한다.

- [ ] **Step 4: `__init__.py` 작성 — 재노출만**

`src/backend/api/git/__init__.py`:
```python
"""Git API 패키지.

`api/git.py`(2,022줄)를 도메인별 모듈로 분할한 결과. 소비자의 import 경로
는 분할 전과 동일하게 유지된다.

재노출 대상은 `router` 하나가 아니다 — 실측(2026-08-05) 결과
`tests/backend/test_llm_usage_instrumentation.py`가 핸들러 함수 두 개를
직접 import 한다. `router`만 재노출하면 그 두 import 가 ImportError 로
깨진다(Global Constraints 2 위반).
"""

from ._legacy import (
    generate_draft_commits,
    generate_draft_commits_for_project,
    router,
)

__all__ = [
    "generate_draft_commits",
    "generate_draft_commits_for_project",
    "router",
]
```

**`__all__`은 소비자 목록에서 역산한다.** 분할이 진행되면서 이 두 함수는 Task 7(`commits` 모듈)로 이동하는데, 그때도 `__init__.py`의 재노출은 유지해야 한다 — import 출처만 `._legacy`에서 `.commits`로 바뀐다.

- [ ] **Step 4b: 문자열 패치 타깃을 `_legacy`로 갱신 (필수 — 이걸 빼면 게이트가 9건 실패한다)**

이동으로 핸들러가 `api/git/_legacy.py`로 옮겨졌으므로, 핸들러 모듈의 속성을 문자열로 패치하는 테스트는 타깃을 따라가야 한다. `__init__.py` 재노출로는 해결되지 않는다(위 "문자열 패치 타깃" 절 참조).

Run (CWD = repo 루트):
```bash
grep -rln '"api\.git\.' --include='*.py' tests/backend | xargs sed -i '' 's/"api\.git\./"api.git._legacy./g'
grep -rn '"api\.git\.' --include='*.py' tests/backend
```

두 번째 grep 결과가 모두 `"api.git._legacy.<name>"` 형태여야 한다. 치환 대상은 3종 23곳이다:
- `api.git.get_git_service_for_project` → `api.git._legacy.get_git_service_for_project` (9곳)
- `api.git.get_github_service` → `api.git._legacy.get_github_service` (7곳)
- `api.git._get_db_session` → `api.git._legacy._get_db_session` (7곳)

`safe_import("api.git", "router")`(`app.py:106`)는 **건드리지 않는다** — 모듈 경로이지 속성 패치가 아니고, 위 sed 패턴(`"api.git.`, 마침표 포함)에 걸리지 않는다. 치환 후 `src/backend/api/app.py`가 변경되지 않았는지 `git status`로 확인하라.

**예상 실패 (이 스텝 전에 게이트를 돌리면 나온다):** `test_api_git_prune.py` 7건 + `test_llm_usage_instrumentation.py` 2건 + 알려진 플레이크 1건 = `10 failed, 1327 passed`. 이 9건은 **예상된 것이며 이 스텝으로 해결된다.** 게이트가 빨갛다고 이동을 되돌리지 마라.

- [ ] **Step 5: 게이트 실행 — 여기서 이미 green이어야 한다**

먼저 재노출 계약을 직접 확인한다 (CWD `src/backend`):
```bash
uv run python -c "
from api.git import router, generate_draft_commits, generate_draft_commits_for_project
print('reexport ok:', router.prefix, router.tags, len(router.routes))
"
```
Expected: `reexport ok: /git ['git'] 63`. 세 이름이 모두 import 돼야 한다 — 하나라도 빠지면 소비자 목록의 import가 깨진 것이다.

> **⚠️ 라우트 수 `63`은 이 스텝(include_router 0개) 시점에만 맞다** (Task 7 실측 2026-08-08).
> 이 레포의 FastAPI 버전은 `include_router()`가 하위 라우트를 상위로 **평탄화 복사하지 않고**
> `_IncludedRouter` 래퍼 객체 하나만 `router.routes`에 넣는다(순회 시
> `AttributeError: '_IncludedRouter' object has no attribute 'path'`로 드러난다).
> 따라서 도메인 모듈을 추출할수록 `len(router.routes)`는 **줄어든다** — Task 7 완료 시점은
> `31(_legacy 잔여) + 5(서브라우터 5개) = 36`이고, Task 11 완료 시점은 `8`(서브라우터 8개)이다.
>
> **라우트 수 검산은 반드시 `snapshot(router)`로 한다** — 그 헬퍼는 `4482b3c`에서
> include_router 하위를 하강하도록 수정돼 63을 정확히 반환한다. `len(router.routes)`를
> 그대로 63과 비교하면 **정상 상태를 실패로 오판**한다.

그다음 전체 게이트 (CWD `src/backend`):
```bash
uv run ruff check . && uv run ruff format --check . && uv run mypy . --ignore-missing-imports --no-error-summary && uv run pytest ../../tests/backend -q --tb=line
```
Expected: **`1 failed, 1336 passed, 2 skipped`** — Task 1 완료 시점과 동일한 수치이며, 유일한 실패는 알려진 플레이크다. 수치가 이보다 적으면 테스트가 collection 단계에서 사라진 것이니 원인을 찾는다.

**반드시 통과해야 하는 것들:**
- `test_git_route_table.py` 3건 — 통과하면 패키지 승격이 HTTP 표면을 건드리지 않았다는 뜻이다.
- `test_llm_usage_instrumentation.py` 2건 — 핸들러 함수 재노출(Step 4)과 패치 타깃 갱신(Step 4b)을 동시에 검증하는 유일한 테스트다.
- `test_api_git_prune.py` 7건 — 패치 타깃 갱신(Step 4b)의 주 검증 대상이다.

- [ ] **Step 6: 커밋**

```bash
git add -A src/backend/api/git tests/backend
git commit -m "refactor(api): git.py를 패키지로 승격 (내용 무변경)

파일을 api/git/_legacy.py로 옮기고 __init__.py가 공개 이름 3개를 재노출한다:
router, generate_draft_commits, generate_draft_commits_for_project.
뒤 두 개는 test_llm_usage_instrumentation.py 가 직접 import 하므로
router만 재노출하면 깨진다(전수 조사 2026-08-05).

git.py 내부에 상대 import 가 없어(실측 0건) 패키지 깊이 변화의 영향이 없다 —
이 커밋은 옮겨진 코드를 한 줄도 바꾸지 않는다.

테스트의 문자열 패치 타깃 23곳을 api.git.X → api.git._legacy.X 로 갱신했다.
핸들러가 _legacy 네임스페이스로 이동하므로 __init__.py 재노출로는 패치가
먹지 않는다 — 재노출은 import 를 살리지만 패치 지점은 살리지 못한다.
동작 변경이 아니라 테스트가 내부 구조를 참조하는 데 따른 수반 변경이다.

이후 도메인별 추출의 발판이다."
```

---

### Task 3~10: 도메인 모듈 추출 (8회 반복)

각 태스크는 **아래 추출 레시피를 자기 파라미터로 1회 수행**한다. 레시피는 여기 한 번만 전부 적어두고, 각 태스크는 값만 다르다 — 같은 절차를 8번 복제하지 않는다.

#### 추출 레시피 (전문)

파라미터: `<MODULE>` (예: `repositories`), `<ROUTES>` (그 모듈이 가져갈 라우트 경로 목록)

- [ ] **R1: 대상 핸들러 식별**

**소스 텍스트 grep을 1차 수단으로 쓰지 않는다.** 데코레이터가 여러 줄에 걸치면 경로 문자열이 `@router.` 줄에 없어서 `grep -n '^@router\.'`가 그 핸들러를 **조용히 놓친다**(2026-08-07 Task 4에서 실측: github 8개 중 3개가 멀티라인이라 grep은 5개만 잡았다). **런타임 라우터 객체가 진실이다.**

Run (CWD `src/backend`) — 대상 라우트와 함수명을 먼저 확정한다:
```bash
uv run python -c "
import sys; sys.path.insert(0, '../../tests/backend/api')
from api.git import router
from route_table import snapshot
rows = [r for r in snapshot(router) if '<경로조각>' in r[1]]
print('개수:', len(rows))
for m, p, n in rows: print(f'  {m:6s} {p}  -> {n}')
"
```
개수가 태스크별 파라미터 표의 라우트 수와 일치하는지 확인한다. 다르면 멈추고 원인을 찾는다.

그다음 **함수명으로** 소스 위치를 찾는다(데코레이터 형태와 무관하게 정확하다):
```bash
grep -nE '^(async )?def (<함수명1>|<함수명2>|...)\(' api/git/_legacy.py
```
각 핸들러의 시작은 그 `def` 줄 **위에 붙은 데코레이터 첫 줄**이고, 끝은 다음 데코레이터 직전 또는 파일 끝이다. 도메인 구역이 연속이면 섹션 배너 주석(`# ==== ... ====`)이 자연스러운 경계가 되므로 그것부터 통째로 옮긴다.

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
**전역 등록 순서를 원본과 일치시키려 하지 않는다.** Starlette는 등록 순서대로 **전체 경로**를 매칭하므로 세그먼트 수가 다른 경로는 서로를 가리지 않는다 — `/projects/{id}/merge`는 `/projects/{id}/merge/status`를 가리지 못한다. 게다가 원본은 도메인 그룹이 불연속이라(branch-protection·draft-commits·fetch/pull/push) 순서 복원 자체가 불가능하다.

지켜야 할 것은 하나다: **같은 모양 경로에서 파라미터 쪽이 구체 쪽보다 앞서면 안 된다**(`/branches/{name}`이 `/branches/current`보다 앞이면 후자는 도달 불가). R5의 `test_no_shadowing_route_pairs`가 이를 검사한다.

- [ ] **R4b: 이 태스크가 옮긴 핸들러를 문자열로 패치하는 테스트의 타깃 갱신**

Run (CWD = repo 루트): `grep -rn '"api\.git\._legacy\.' --include='*.py' tests/backend`

출력된 패치 지점 중 **이 태스크가 옮긴 핸들러를 대상으로 하는 것만** `api.git.<MODULE>.<name>`으로 바꾼다. 아직 `_legacy`에 남아 있는 핸들러용 패치는 그대로 둔다.

**패치 지점은 헬퍼가 정의된 모듈이 아니라 핸들러가 사는 모듈이다.** 핸들러가 `from ._shared import get_git_service_for_project`로 이름을 자기 네임스페이스에 바인딩하므로 `api.git._shared.get_git_service_for_project` 패치는 먹지 않는다. `api.git.<MODULE>.get_git_service_for_project`여야 한다.

해당 태스크 (나머지 태스크는 이 스텝이 no-op):
- **Task 6 (`branches`)** — `tests/backend/api/test_api_git_prune.py` 21곳(`get_git_service_for_project` 7 · `get_github_service` 7 · `_get_db_session` 7). `POST /branches/prune-merged` 핸들러가 이 태스크에서 이동한다.
- **Task 7 (`commits`)** — `tests/backend/test_llm_usage_instrumentation.py` 2곳(`get_git_service_for_project`). draft-commits 핸들러가 이 태스크에서 이동한다.

이 스텝을 빠뜨리면 R6 게이트가 해당 테스트에서 `AttributeError: module 'api.git.<MODULE>' has no attribute ...` 또는 패치 무효로 실패한다. **실패를 보고 추출을 되돌리지 마라** — 이 스텝을 수행하는 것이 정답이다.

- [ ] **R5: 라우트 테이블 테스트로 즉시 검증**

Run (CWD `src/backend`): `uv run pytest ../../tests/backend/api/test_git_route_table.py -v`
Expected: failed 0 — 이 파일의 모든 테스트 통과. **FAIL이면 다음 스텝으로 넘어가지 않는다** — 실패 메시지가 사라졌거나 늘어난 라우트, 또는 새로 생긴 경로 가림 쌍을 정확히 알려준다.

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

라우트 수는 **2026-08-05 실측**이다(원본 선언 인덱스 병기). 합계 63으로 검산된다.

| 태스크 | `<MODULE>` | 라우트 수 | 원본 인덱스 | 경로 패턴 |
|---|---|---:|---|---|
| Task 3 | `repositories` | 5 | 58–62 | `/repositories`, `/repositories/{repo_id}` |
| Task 4 | `github` | 8 | 50–57 | `/github/{repo_owner}/{repo_name}/...` (pulls 6 + info + branches) |
| Task 5 | `remotes` | 4 | 43–46 | `/projects/{project_id}/remotes...` |
| Task 6 | `branches` | 10 | 12–17, 39–42 | `/projects/{project_id}/branches...` 6 + `/branch-protection...` 4 |
| Task 7 | `commits` | 5 | 18–21, 11 | `/projects/{project_id}/commits...` 4 + `/draft-commits` 1 |
| Task 8 | `merge_requests` | 9 | 30–38 | `/projects/{project_id}/merge-requests...` |
| Task 9 | `merge` | 8 | 22–29 | `/projects/{project_id}/merge`, `/merge/...` |
| Task 10 | `working_tree` | 14 | 0–10, 47–49 | status·git-path·worktrees·working-status·add·commit·unstage·file-diff·staged-diff·file-hunks·stage-hunks + fetch·pull·push |

**원본 인덱스가 불연속인 모듈(branches·commits·working_tree)이 있다는 것이 핵심 사실이다.** 이것이 전역 등록 순서 복원을 불가능하게 만들고, Task 1의 `test_no_shadowing_route_pairs`가 순서 assert를 대신하는 이유다.

**Task 3을 가장 작고 독립적인 `repositories`로 시작하는 이유**: 레시피 자체를 가장 싼 대상에서 검증한다. 여기서 레시피에 결함이 드러나면 5개 라우트만 되돌리면 된다.

**Task 6·10 주의**: 추출 후 `branches.py`(10 라우트)가 800줄을 넘으면 `branch_protection.py`(4 라우트)를 분리하고, `working_tree.py`(14 라우트)가 넘으면 `staging.py`(add·unstage·stage-hunks·staged-diff·file-hunks·file-diff)와 `sync.py`(fetch·pull·push)로 한 번 더 가른 뒤 커밋한다.

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

# 등록 순서는 원본 선언 순서를 재현하지 않는다(도메인 그룹이 불연속이라 불가능).
# 계약은 test_no_shadowing_route_pairs 가 검사하는 것뿐이다:
# 같은 모양 경로에서 파라미터 쪽이 구체 쪽보다 앞서지 않을 것.
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
Expected: 라우트 테이블 테스트 failed 0(63건 동일·가림 쌍 0건), 게이트 실패 0(알려진 플레이크 제외).

- [ ] **Step 5: 줄 수 최종 확인**

Run: `wc -l src/backend/api/git/*.py | sort -rn`
Expected: 모든 파일 800줄 미만. 전체 합계는 원본 2,022줄 ± 5% 이내여야 한다 — 크게 늘었다면 코드가 복제된 것이다.

- [ ] **Step 6: 소비자 import 재확인**

Run (CWD = repo 루트):
```bash
grep -rn "api\.git\|api/git" --include='*.py' src/backend tests/backend | grep -v '^src/backend/api/git/'
```
Task 2 Step 2에서 기록한 목록과 대조한다. 모든 import가 그대로 유효해야 한다.

- [ ] **Step 7: 문서·설정의 경로 참조 동기화**

`docs/architecture.md`와 `docs/api-reference.md`에서 `api/git.py`를 단일 파일로 서술한 부분을 패키지 구조로 갱신한다. **API 엔드포인트 자체는 하나도 바뀌지 않았으므로 엔드포인트 목록은 손대지 않는다.**

**코드 밖의 경로 참조도 함께 고친다.** Task 2 실행 후 실측(2026-08-05)한 잔여 참조:

| 파일 | 내용 | 조치 |
|---|---|---|
| `.claude/skill-evals/verify-backend-workspace/evals/evals.json:20` | `"files": ["src/backend/api/git.py"]` | 실제 파일 경로 — **`src/backend/api/git/branches.py`로 갱신** |
| `.claude/skill-evals/verify-backend-workspace/evals/evals.json:18` | 프롬프트 본문의 `api/git.py` | 산문이므로 선택 |
| `.claude/skill-evals/verify-backend-workspace/trigger-eval.json:3` | 프롬프트 본문 | 산문이므로 선택 |
| `.claude/skill-evals/verify-frontend-workspace/trigger-eval.json:12` | 프롬프트 본문 | 산문이므로 선택 |

`"files"` 배열은 eval 러너가 실제로 여는 경로이므로 갱신하지 않으면 그 eval이 깨진다. 프롬프트 본문의 언급은 사람이 읽는 예시라 필수는 아니다.

**최종 경로가 `branches.py`인 근거**: 그 eval의 프롬프트는 `delete_branch` 엔드포인트를 다루고(`evals.json:18`), `delete_branch`는 `DELETE /projects/{id}/branches/{branch_name}`이므로 **Task 6(`branches`)**에서 안착한다. Task 6 완료 전에 고치면 `_legacy.py`를 가리켰다가 다시 바꿔야 하므로, **Task 11에서 한 번에 최종 경로로 갱신한다**(Codex가 Task 2·3 리뷰에서 두 번 지적했으나 같은 이유로 유예했다 — 이 브랜치는 미머지 상태라 main의 eval은 영향받지 않는다).

**빌드는 영향 없음**(실측): Dockerfile 8종 모두 `COPY . .` 방식이라 파일 경로를 명시하지 않는다. `src/backend/Dockerfile`은 `api/app_railway.py`만 복사하므로 무관하다.

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

전수 조사 실측 2026-08-05 (상대 import 형태·동적 import 포함). Task 11 Step 6이 이 목록과 대조한다.

| 소비자 | 형태 | import 대상 |
|---|---|---|
| `src/backend/api/app.py:106` | 동적 — `safe_import("api.git", "router")` | `router` |
| `tests/backend/test_llm_usage_instrumentation.py:286` | 함수 내 정적 | `generate_draft_commits` |
| `tests/backend/test_llm_usage_instrumentation.py:322` | 함수 내 정적 | `generate_draft_commits_for_project` |
| `tests/backend/api/test_git_route_table.py:6` | 모듈 최상단 정적 | `router` |
| `tests/backend/api/test_api_git_prune.py:19` | 함수 내 정적 | `router` |

`src/backend/api/git.py` 내부에는 상대 import가 **0건**이다(실측). 따라서 패키지로 한 단계 깊어져도 내부 import를 고칠 것이 없고, Task 2의 "코드를 한 줄도 바꾸지 않는다"는 문면 그대로 참이다.

### 문자열 패치 타깃 — 정적 import가 아니어서 첫 조사에서 놓쳤다

정적 import만으로는 소비자를 다 못 찾는다. 아래는 **문자열로 모듈 속성을 패치**하는 지점이며, Task 2를 실제로 실행해 보고서야 드러났다(2026-08-05 진단, 실패 9건).

| 패치 타깃 | 사용처 | 횟수 | 최종 안착 태스크 |
|---|---|---:|---|
| `api.git.get_git_service_for_project` | `test_api_git_prune.py` 7, `test_llm_usage_instrumentation.py` 2 | 9 | Task 6 / Task 7 |
| `api.git.get_github_service` | `test_api_git_prune.py` | 7 | Task 6 |
| `api.git._get_db_session` | `test_api_git_prune.py` | 7 | Task 6 |

테스트 파일 → 태스크 매핑: `test_api_git_prune.py`는 `POST /branches/prune-merged`를 테스트하므로 **Task 6(branches)**, `test_llm_usage_instrumentation.py`는 draft-commits를 테스트하므로 **Task 7(commits)**.

**왜 `__init__.py` 재노출로 해결되지 않는가**: 이동 후 핸들러는 `api/git/_legacy.py`에 살고 자기 모듈 네임스페이스의 이름을 참조한다. `api.git`(패키지 `__init__`)의 속성을 패치해도 `_legacy`의 네임스페이스는 그대로다. **재노출은 import를 살리지만 패치 지점은 살리지 못한다** — 계획 초안이 "import 경로"와 "패치 지점"을 같은 것으로 취급한 오류다.

**패치 지점 규칙**: 패치 대상은 헬퍼가 *정의된* 모듈이 아니라 **핸들러가 *사는* 모듈**이다. 핸들러가 `from ._shared import get_git_service_for_project`로 이름을 자기 네임스페이스에 바인딩하므로, `api.git._shared.get_git_service_for_project`를 패치해도 먹지 않는다.

세 헬퍼 모두 `Depends()`가 아니라 **핸들러 본문 안의 평범한 호출**이다(실측: `Depends(` 형태 0건). `get_git_service_for_project` 24곳, `_get_db_session` 16곳, `get_github_service` 1곳에서 호출되며 여러 도메인 모듈에 걸친다.

### ⚠️ 이 프로그램 전체의 최대 위험 — `safe_import`가 실패를 삼킨다

`src/backend/api/app.py:71-81`의 `safe_import()`는 `except ImportError`뿐 아니라 **`except Exception`까지** 잡아 `None`을 반환하고, 호출부(`app.py:565`)는 `if git_router:`로 조용히 건너뛴다.

즉 분할 중 `api/git/__init__.py`가 어떤 이유로든 깨지면:
- 앱은 **정상 기동**한다
- git API 라우트 63개가 **통째로 사라진다**
- 로그에 `⚠️ api.git disabled: ...` 한 줄만 남는다

이 실패 양상은 배포 전에 발견하기 어렵다. **유일한 안전망은 `tests/backend/api/test_git_route_table.py:6`의 모듈 최상단 정적 import다** — collection 단계에서 ImportError로 즉시 FAIL한다. 그러므로:

- 이 import를 **절대 함수 내부로 옮기지 마라.** 지연 import로 바꾸면 이 프로그램의 조기 경보가 사라진다.
- 각 태스크의 게이트에서 pytest 실행은 선택이 아니다. `api/git` 패키지가 성립하는지를 확인하는 유일한 수단이다.

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
