# Batch 2 — API 라우트 나열 파일 분할 Implementation Plan

> **상위 계획**: `docs/plans/2026-08-04-oversized-file-split.md` (프로그램 레벨 · B1 완료)
> **추출 레시피 R1~R8은 그 문서에 있다. 여기 복사하지 않는다** — B1에서 8회 반복 검증됐고
> 상위 계획이 "B2의 5개 파일이 그대로 재사용한다"고 명시했다.
> **Global Constraints 1~9도 상위 계획의 것을 그대로 상속한다.**

**Goal:** 라우트 나열 이음매를 가진 API 파일을 800줄 한도 이내로 되돌린다. B1과 동일하게 동작 보존이 유일한 성공 기준이다.

---

## 착수 조건 — 충족됨 (실측 2026-08-08)

상위 계획 130~136행이 규정한 `shadowing_pairs()` 유예 조건을 재실측했다.

```
대상 4파일의 경로 컨버터: 0건
백엔드 전역 컨버터:      path 3건 (Task 6에서 branches.py로 이동한 {branch_name:path})
int / float / uuid:      0건
```

`int`·`float`·`uuid`가 하나도 없으므로 **부분 겹침 미탐지 유예는 유효하다.** `shadowing_pairs()`를 강화하지 않고 진행한다. B1 통과는 **완전 가림** 부재만 증명했을 뿐이므로, 이 실측이 매 배치마다 필요하다.

---

## 인벤토리 (실측 2026-08-08 — 상위 계획의 2026-08-04 수치를 정정함)

| 파일 | 줄수 | 라우트 | prefix | 마운트 | 직접 라우트 테스트 | 문자열 패치 타깃 |
|---|---:|---:|---|---|---|---:|
| `api/project_configs.py` | 1,818 | 60 | `/project-configs` | `safe_import` (app.py:94) | **없음** | 0 |
| `api/agents.py` | 1,731 | 29 | `/agents` | `safe_import` (app.py:91) | 핸들러 직접 호출 (`test_llm_usage_instrumentation.py`) | **6** |
| `api/claude_sessions.py` | 1,352 | 25 | `/claude-sessions` | `safe_import` (app.py:90) | **없음** | 0 |
| `api/projects.py` | 873 | 14 | `/project-registry` | `safe_import` (app.py:118) | **없음** | 0 |

**합계 4파일 5,774줄.** 데코레이터 수와 런타임 라우트 수가 전부 일치한다(B1 `github.py`의 멀티라인 데코레이터 함정 없음) — 그래도 R1은 런타임 라우터로 확정한다.

### 상위 계획 인벤토리의 오류 두 건 (정정 완료)

| 항목 | 상위 계획(2026-08-04) | 실측(2026-08-08) |
|---|---|---|
| `api/projects.py` 테스트 | 없음 | **없음이 맞다.** 단 `test_e2e_api.py`가 부르는 `/api/projects`는 **`orchestration` 태그의 다른 라우터**다(OpenAPI 실측). 파일명 문자열 grep은 이를 안전망으로 오인한다 |
| `api/v1/agent_registry.py` 테스트 | 2파일 1,078줄 | **1파일 807줄**(`tests/backend/api/test_agent_registry.py`). 나머지 271줄(`tests/backend/test_agent_registry.py`)은 `services.agent_registry`를 테스트하며 API 라우터와 무관 |

---

## `api/v1/agent_registry.py`는 B2에서 제외한다

**이 파일은 앱에 마운트되지 않는다** (실측 2026-08-08):

- `api/v1/__init__.py`는 `"""API v1 package."""` 한 줄뿐 — 아무것도 export 하지 않는다
- `app.py`에 `api.v1` 참조 **0건**이며, `git log -S 'api.v1' -- src/backend/api/app.py`가 **무출력**이다 → 마운트 유실(회귀)이 아니라 **처음부터 미배선**이다
- 유일한 소비자는 `tests/backend/api/test_agent_registry.py` 하나다
- OpenAPI 스키마에 마운트된 `/api/v1/*` 4건은 전부 `invitations` 관련으로 **다른 모듈**의 것이다

`api/v1/` 6개 모듈(`agent_monitor`·`agent_registry`·`agents`·`auth_middleware`·`rate_limiter`·`stations`) 전부 프로덕션 소비자가 0건이다. 그럼에도 유지보수는 계속돼 왔다 — PR #174가 이 파일의 JWT 하드코딩을 고쳤다.

**제외 근거**: 800줄 한도의 목적은 살아 있는 코드의 유지보수성이다. 도달 불가능한 라우터를 분할해도 그 목적에 기여하지 않는다. 상위 계획의 B6와 같은 취급 — **착수 전 별도 판단** 대상이다.

> **별도 이슈로 기록 (Global Constraints 1 — 리팩터링 중 발견한 문제는 고치지 않는다)**
>
> `api/v1/` 6개 모듈(합계 ~2,900줄)이 **의도적 미배선 상태로 유지되고 있다.** 회귀가 아니다(app.py가 한 번도 마운트한 적 없음). 판단이 필요한 것은 "배선할 것인가, 제거할 것인가"이며 **이 계획은 어느 쪽도 하지 않는다.**
>
> 다음 세션이 이 파일을 B2에 "복원"하지 않도록 여기 명시한다.

---

## 태스크 순서

상위 계획의 축 1(이음매 종류)은 4파일 모두 동일하다(라우트 나열, 낮은 위험). 축 2(안전망)로 가를 수 없다 — **`agents`를 뺀 셋은 직접 라우트 테스트가 0건**이라 전부 characterization 선행 대상이다.

따라서 **크기와 패치 타깃 수**로 정한다. B1의 "레시피를 가장 싼 대상에서 검증한다"를 계승하되, 여기서 검증할 것은 레시피가 아니라 **파일별 델타**다.

| 순서 | 파일 | 근거 |
|---|---|---|
| **1** | `projects` (873줄, 14) | 가장 작고 패치 타깃 0. 여기서 델타가 드러나면 되돌릴 양이 최소다 |
| **2** | `agents` (1,731줄, 29) | 패치 타깃 6곳 — R4b 단계를 이른 시점에 실행해 둔다 |
| **3** | `claude_sessions` (1,352줄, 25) | 패치 0, 중간 크기 |
| **4** | `project_configs` (1,818줄, 60) | 최대 크기 · 안전망 최소. 레시피가 세 번 검증된 뒤에 착수한다 |

**`project_configs`를 먼저 하지 않는 이유**: 60라우트·1,818줄·테스트 0건이라 레시피 결함의 비용이 가장 크고 그물이 가장 얇다.

---

## 파일당 태스크 구성 (4회 반복)

각 파일은 **characterization → 패키지 승격 → 도메인 추출 N회 → 소멸·문서** 순서다. B1의 Task 1~11과 같은 형태이며, 파일별로 아래 두 가지만 다르다.

### A. characterization 테스트 (파일당 1태스크, 재사용 불가)

`tests/backend/api/route_table.py`의 `snapshot()`·`shadowing_pairs()`는 **그대로 재사용한다**(B1 산출물, `4482b3c`·`225a9c7`·`a5bddda`에서 보강됨). 재사용 불가인 것은 **파일별 베이스라인 JSON과 Red-Green 증명**이다.

- Create: `tests/backend/api/<name>_route_table.json` (생성물, 커밋 대상)
- Create: `tests/backend/api/test_<name>_route_table.py`
- **모듈 최상단 정적 import 필수** — 아래 "safe_import 침묵 실패" 참조
- Red-Green: 라우트 1건을 임시 주석 처리 → **FAIL 확인** → 복원 → PASS

**이 그물이 잡는 것**: 라우트 유실·추가·개명, 경로 가림.
**잡지 못하는 것**: 핸들러 동작 변경. 이것이 허용되는 유일한 근거는 **핸들러가 바이트 단위로 이동한다는 것**이다(B1과 동일하게 `sed`로 원문 구간을 잘라 붙인다). 테스트 0건인 세 파일에서 이 가정이 유일한 하중 지지대다 — 핸들러 본문을 "정리"하고 싶은 유혹이 들면 그 순간 그물이 사라진다.

### B. 도메인 그룹 파라미터 (착수 시 R1으로 실측)

B1은 도메인 그룹을 계획 시점에 확정했지만, B2는 **각 파일 착수 시점에 R1(런타임 라우터)로 실측해 그룹을 정한다.** 4파일 136라우트를 지금 전부 나열하면 실행 전에 낡는다(상위 계획이 B2 인벤토리에서 이미 두 건 틀렸다).

그룹 기준은 B1과 같다: **URL 경로의 도메인 세그먼트**. 기술 계층이 아니다.

---

## B1 대비 델타 — 반드시 다르게 처리할 것

### 1. safe_import 침묵 실패가 4파일 전부에 적용된다

`app.py:71-81`의 `safe_import()`는 `except Exception`까지 잡아 `None`을 반환하고, 호출부는 `if <router>:`로 조용히 건너뛴다. 패키지가 깨지면:

- 앱은 **정상 기동**한다
- 해당 도메인의 라우트가 **통째로 사라진다** (project_configs면 60개)
- 로그에 `⚠️ api.<name> disabled: ...` 한 줄만 남는다

**대응**: 각 파일의 characterization 테스트는 `from api.<name> import router`를 **모듈 최상단**에 둔다. collection 단계에서 ImportError로 즉시 FAIL하는 것이 유일한 조기 경보다. **지연 import로 바꾸지 마라.**

### 2. 패치 타깃은 `agents` 6곳뿐 (B1은 23곳)

전부 `tests/backend/test_llm_usage_instrumentation.py`에 있다:

| 패치 타깃 | 성격 |
|---|---|
| `api.agents.record_usage_best_effort` | 함수 |
| `api.agents.enforce_usage_quota_preflight_best_effort` | 함수 |
| `api.agents.get_access_for_user` | 함수 |
| `api.agents.LLMService._get_llm` | **클래스 속성** |
| `api.agents.LLMModelRegistry.is_available` | **클래스 속성** |
| `api.agents.LLMModelRegistry.get_enabled` | **클래스 속성** |

**B1에 없던 형태**: 뒤 3개는 모듈 속성이 아니라 **클래스의 속성**을 패치한다. 규칙은 같다 — 패치 지점은 그 이름을 자기 네임스페이스에 바인딩한 **핸들러가 사는 모듈**이지, 클래스가 정의된 모듈이 아니다. B1 상위 계획 790~794행의 "패치 지점 규칙"이 그대로 적용된다.

~~나머지 3파일은 패치 타깃 0건이므로 R4b가 no-op이다.~~

**정정 (2026-08-08 실측).** 위 문장은 `grep '"api\.<name>\.'`(문자열 patch) 기준이라 **모듈 객체
패치를 못 본다.** `claude_sessions` 는 실제로 2건이 있었다:

```python
# tests/backend/test_claude_session_sync.py
from api import claude_sessions
patch.object(claude_sessions, "get_monitor", ...)          # import 문 grep 에도 안 잡힌다
patch.object(claude_sessions, "_sync_sessions_to_db", ...)
```

규칙은 같다 — 패치 지점은 그 이름을 자기 네임스페이스에 바인딩한 모듈이다. 패키지 `__init__`
재노출로는 대체되지 않는다. **게다가 이 형태는 패키지 승격 시점에 이미 깨진다**(핸들러가
`_legacy` 로 가므로). 즉 R4b 가 추출 태스크가 아니라 **승격 태스크에서 먼저** 필요하다.

- `project_configs` 재실측(2026-08-08): 모듈 객체 패치 **0건** — 계획대로 no-op이다.
- 패치 타깃 조사는 세 형태를 전부 본다:

```bash
grep -rn "\"api\.<name>\.\|from api import <name>\|import api\.<name>\|patch.object(<name>\|monkeypatch.setattr" --include='*.py' src tests
```

**주의**: 언더스코어 없는 이름을 `__init__.py` 에 "편의상" 재노출하면 패치는 성공하고 호출은
원본을 타서 테스트가 **거짓 통과**한다. 재노출 목록은 실제 소비자로만 좁힌다.

### 2b. 라인 범위 diff 로 "바이트 동일"을 검증하지 마라 — R2b 를 쓴다

**2026-08-08 `claude_sessions` 에서 실제로 코드를 잃었다.** `summaries.generate_batch_summaries`
의 마지막 `return results` 가 `sed` 슬라이스 범위 밖으로 밀려 사라졌다. 그때 쓴 검증은

```bash
diff <(git show <ref>:<원본> | sed -n '272,411p') <(sed -n '/^@router.../,$p' summaries.py)
```

였는데 **추출과 검증이 같은 잘못된 범위를 썼으므로 `IDENTICAL` 이 나왔다.** 자기 확인이라
그물이 아니었다. 잡은 것은 mypy 의 `Missing return statement` 하나뿐이다.

mypy 에 기대는 것은 우연이다. 반환 애노테이션이 `dict`인데 앞에서 이미 `return` 한 함수라면
마지막 줄이 사라져도 조용하고, `else:` 가지나 `raise` 한 줄이 사라지는 경우는 ruff·mypy·라우트
테이블을 **전부 통과한다**(실측 확인). `project_configs`는 60라우트·테스트 0건이라 이 종류의
결함이 가장 잘 숨는다.

- [ ] **R2b: AST 대조 (R2 직후, R5 이전)**

```bash
# CWD = repo 루트. <ref> 는 **패키지 승격 직전** 커밋
git show <ref>:src/backend/api/<name>.py > /tmp/orig.py
python3 tests/backend/api/split_audit.py /tmp/orig.py src/backend/api/<name>/
```

Expected: `✅ 문제 0건` (exit 0). 원본과 분할 결과를 **독립적으로 AST 파싱**해 def·class 를
이름으로 매칭하고 소스 텍스트를 비교한다 — 라인 산술을 쓰지 않으므로 자기 확인이 불가능하다.
모듈 레벨 할당(캐시 인스턴스·락·타입 별칭)도 함께 대조한다.

정의 개수를 원본 기준으로 손검산할 것: `claude_sessions` 는 25핸들러 + 캐시 2클래스 +
Pydantic 6모델 + 싱크 2함수 = 35 로 맞았다.

**`ruff check --fix` 를 돌린 *뒤에* 다시 실행한다.** fix 가 핸들러 본문 안의 지역 import 를
건드릴 수 있다.

### 3. 라우트 수 검산은 `snapshot()`으로만

이 레포의 FastAPI는 `include_router()`가 하위 라우트를 평탄화하지 않고 `_IncludedRouter` 래퍼만 넣는다. `len(router.routes)`는 **서브라우터 수**이지 라우트 수가 아니다. 상세는 상위 계획 Task 2 Step 5의 경고 블록(`205e37d`) 참조.

### 4. `api/projects.py`의 패키지 이름이 오해를 부른다

이 파일은 `/project-registry`를 서빙한다. `/api/projects/*`는 **`orchestration` 태그의 다른 라우터** 소유다(OpenAPI 실측, 경로 충돌 없음). 분할 후 `api/projects/` 패키지가 생기면 미래의 독자가 `/api/projects`의 소유자로 오인하기 쉽다 — **`__init__.py` 독스트링에 prefix가 `/project-registry`임을 명시한다.**

---

### 5. include 순서가 계약인 파일이 있다 (파일별로 실측할 것)

B1(`git`)과 `agents` 는 "등록 순서는 계약이 아니다"였다. 구체 경로와 파라미터 경로가 **같은
모듈**에 있어 선언 순서가 자동으로 보존됐기 때문이다. `claude_sessions` 는 정반대였다 —
`GET/DELETE /{session_id}` 가 `/external-paths`·`/source-users`·`/projects`·`/processes`·`/ghost`
5개를 가린다(실측 5쌍 확인). 구체·파라미터가 **다른 모듈로 갈리면 `__init__.py` 의 include
순서가 곧 그 라우트들의 도달 가능성**이다.

`include_router` 는 하위 라우트를 리스트 **끝**에 붙이므로, 파라미터 경로를 나중에 추출하면
중간 상태에서 `_legacy` 의 파라미터 라우트가 이미 추출된 구체 라우트를 가린다. **파라미터 경로
모듈을 먼저 추출**하면 "파라미터는 항상 마지막에 include" 불변식이 첫 커밋부터 성립한다.

그룹을 정하기 **전에** 잘못된 순서를 시뮬레이션해 몇 쌍이 나오는지 실측한다:

```python
rows = snapshot(real_router)
param2 = [r for r in rows if r[1].count('/') == 2 and '{' in r[1]]
# param2 를 앞으로 옮긴 라우터를 만들어 shadowing_pairs() 로 세어 본다
```

`__init__.py` 주석에 "순서가 계약이다 + 왜"를 반드시 적는다. 미래의 편집자가 알파벳 순 정렬
한 번으로 라우트를 조용히 죽인다.

---

## 진행 상황 (2026-08-08)

| 순서 | 파일 | 상태 | 결과 |
|---|---|---|---|
| 1 | `projects` | ✅ 완료 | `c896514`·`767479d`·`8a3c2c8` — 873줄 → registry·members |
| 2 | `agents` | ✅ 완료 | `afbe745`~`ecd8e47` — 1,731줄 → core·mcp·ocr·orchestrate·tmux |
| 3 | `claude_sessions` | ✅ 완료 | `4c85a37`~`8b1a06c` — 1,352줄 → 8모듈 (최대 452줄) |
| 4 | `project_configs` | ⬜ 미착수 | 1,818줄 · 60라우트 · 테스트 0건 |

`project_configs` 착수 전 재실측할 것 (계획 12~22행의 착수 조건은 4파일 합산이었다):

- 경로 컨버터 `int`/`float`/`uuid` 가 이 파일에 0건인지 — 60라우트 중 `{id:int}` 하나가
  숨어 있으면 `shadowing_pairs()` 의 부분 겹침 유예가 더는 유효하지 않다
- 잘못된 include 순서 시뮬레이션으로 가림 쌍 수를 먼저 센 뒤 그룹을 정한다 (위 델타 5)

---

## 게이트

상위 계획 Global Constraints 5를 그대로 상속한다. SSOT는 `verification-loop` 스킬이며 이 문서에 명령을 복제하지 않는다.

- 알려진 로컬 플레이크 `test_embedding_model_consistency` 1건만 실패하면 통과로 간주한다. **B1의 PR #238 CI에서 이 테스트가 통과함이 확인됐다** — 로컬 `.env`의 `RAG_EMBEDDING_MODEL` 오버라이드가 원인이라는 판정이 실증됐다.
- 커밋 후 Codex 검증은 `--scope branch --base main`으로 한다(`working-tree`는 커밋된 변경을 못 본다).

---

## 저장 위치

상위 계획과 같은 규칙(`docs/plans/YYYY-MM-DD-<name>.md`). B1 문서에 이어 붙이지 않고 별도 파일로 두는 이유는 상위 계획이 규정한 분할이다 — "Batch 2 이후는 각자의 계획 문서를 그 차례가 왔을 때 작성한다".
