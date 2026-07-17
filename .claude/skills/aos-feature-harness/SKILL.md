---
name: aos-feature-harness
description: "AOS 풀스택 기능 개발 오케스트레이터. 기능 하나를 계획→빌드(백엔드∥프론트)→통합검증→테스트→리뷰까지 전문 에이전트 팀으로 자동 조율한다. '기능 추가해줘', 'AOS에 ~기능 만들어줘', '풀스택으로 구현', '백엔드+프론트 같이', '엔드투엔드 기능', '하네스로 개발' 요청 시 사용. 후속 작업: 기능 수정/보완/다시 구현, 부분 재실행(백엔드만/프론트만 다시), 이전 구현 개선, '리뷰에서 나온 것 고쳐줘' 요청 시에도 반드시 이 스킬을 사용. 단순 단일 파일 수정·질문은 직접 처리(이 하네스 불필요)."
---

# AOS Feature Development Harness

AOS(FastAPI 백엔드 ↔ React/Vite 대시보드)의 풀스택 기능을, 기존 전문가 에이전트들을 조율하여 **계획부터 검증 게이트까지** 한 번에 개발하는 오케스트레이터.

## 실행 모드: 서브 에이전트 (Pipeline + Fan-out/Fan-in + Producer-Reviewer)

> **왜 팀이 아니라 서브에이전트인가:** 이 프로젝트의 커스텀 specialist는 프로그래밍적 팀 스폰 시 Tool API 대신 XML 텍스트를 출력하는 이슈가 있고, `general-purpose` 서브에이전트 디스패치가 검증된 안정 경로다. 또 기능 개발은 본질적으로 순차+팬아웃이라 실시간 SendMessage보다 **산출물 핸드오프**가 핵심이다.

## 에이전트 디스패치 프로토콜 (필수 준수)

모든 에이전트는 아래 형식으로 호출한다. 커스텀 타입으로 직접 스폰하지 않는다:

```
Agent(
  subagent_type: "general-purpose",
  model: "opus",
  run_in_background: {병렬이면 true, 순차면 false},
  prompt: """
    너는 '{agent-name}' 역할이다. 먼저 `.claude/agents/{agent-name}.md`를 Read하고
    거기 정의된 역할·원칙·Quality Gates를 그대로 따른다.
    반드시 Tool API 호출만 사용하라 (XML 텍스트 출력 금지).
    참조 스킬: {연결 스킬}. 품질 기준: `.claude/agents/shared/quality-reference.md`.

    [작업] {이 Phase의 구체 작업}
    [입력] {이전 Phase 산출물 경로}
    [출력] {Write 가능 에이전트: 결과를 `_workspace/{phase}_{agent}_{artifact}.md`에 저장하고 반환값으로 요약 보고.
           읽기 전용 에이전트: 산출물 전문을 반환값으로 제출 (파일 저장 지시 금지 — 아래 일반 규칙 참조)}
  """
)
```

`{agent-name}`은 아래 표의 에이전트 파일명. `model: "opus"`는 모든 호출에 명시 (test-automation-specialist 포함 — 추론 품질 우선).

> **읽기 전용 에이전트 (일반 규칙):** 역할 `.md` frontmatter `tools:`에 Write가 없는 에이전트 — `planner`, `integration-qa`, `code-reviewer`, `security-reviewer` — 는 `[출력]`에 "파일로 저장"을 지시해도 스스로 저장하지 못한다. 이런 에이전트는 산출물 전문을 **반환값으로 제출**하게 하고, **오케스트레이터가 받아서 아래 표의 `_workspace/` 경로에 Write로 저장**한다. Write가 있는 에이전트(backend/web-ui/test-automation-specialist, docs-sync)만 직접 저장한다. 어느 쪽이든 산출물 파일 실존이 Phase 전환 조건이다(아래 "Phase 전환 관문").

## 에이전트 구성 (기존 재사용 + integration-qa·docs-sync 2개 신규)

| Phase | 에이전트(.md) | 역할 | 연결 스킬 | 출력 |
|-------|--------------|------|----------|------|
| A | `planner` | 요구사항 인터뷰·3~6단계 계획 | — | `_workspace/A_planner_plan.md` |
| B-1 | `backend-integration-specialist` | FastAPI/SQLAlchemy/LangGraph 구현 | verify-backend | `_workspace/B_backend_impl.md` |
| B-2 | `web-ui-specialist` | React/Tailwind/Zustand 구현 | react-web-development, verify-frontend | `_workspace/B_frontend_impl.md` |
| C | `integration-qa` ★신규 | API↔훅 경계면 교차 검증 | — | `_workspace/C_integration_report.md` |
| D | `test-automation-specialist` | Vitest 테스트 작성·실행 + pytest 실행·결과 보고 (백엔드 테스트 작성은 B-1 소유) | test-automation | `_workspace/D_test_report.md` |
| E-1 | `code-reviewer` | 품질·유지보수성 리뷰 | — | `_workspace/E_code_review.md` |
| E-2 | `security-reviewer` | 보안 취약점 감사 | — | `_workspace/E_security_review.md` |
| F | (스킬) `verification-loop` | 풀스택 최종 게이트 (FE: tsc+lint+vitest run+build / BE: ruff+mypy+pytest) | verification-loop | `_workspace/F_verification.md` (오케스트레이터 저장) |
| G | `docs-sync` ★신규 | 변경 델타↔mandatory-docs 매핑 후 문서 동기화 | — | docs/ 직접 수정 + `_workspace/G_docs_sync.md` |

A·C·E-1·E-2 산출물은 담당 에이전트가 읽기 전용이므로 **오케스트레이터가 반환값을 받아 저장**한다(위 일반 규칙). F는 오케스트레이터 자신이 스킬을 실행하므로 게이트 요약을 직접 저장한다.

## Phase 전환 관문 (산출물 완결성 · 필수)

각 Phase 종료 시, 다음 Phase로 넘어가기 **전에** 오케스트레이터는 위 표의 해당 산출물 파일이 `_workspace/`에 실존하는지 Glob/Read로 확인한다. 에이전트의 "저장했다" 보고를 그대로 믿지 않는다:

1. **산출물 실존** → 다음 Phase 진행
2. **반환값만 있음** (읽기 전용 에이전트 포함) → 오케스트레이터가 반환값을 해당 경로에 Write로 저장한 뒤 진행
3. **Phase 생략 (NOT_APPLICABLE · 사전 선언 전용)** → 반드시 `_workspace/{phase}_SKIPPED.md`를 먼저 작성하고 진행. 파일에 (1) 생략 사유, (2) 판단 근거(예: 변경 파일 목록, "프론트 전용 기능이라 경계면 없음"), (3) 결정 주체(각 Phase에 명시된 생략 조건 자동 적용 / 사용자 지시)를 기록한다. 생략이 허용되는 경우는 **각 Phase 절에 명시된 사전 선언 조건뿐**이다 (B: 단일 영역이라 팬아웃 생략, C: 한쪽 영역만 변경, G: docs 매핑 영역 미접촉). **실행 실패는 SKIPPED 사유가 될 수 없다** — 적용 대상 Phase의 에이전트가 재시도 후에도 실패하면 그 Phase는 **BLOCKED**이며 이후 Phase 진행 금지(에러 핸들링 표). SKIPPED 파일은 "해당 없음"의 기록이지 "실패"의 기록이 아니다
4. **산출물도 SKIPPED 기록도 없음** → 다음 Phase 진행 금지. 해당 Phase를 재실행하거나(에러 핸들링 표 참조) 사용자에게 보고한다

최종 보고에 Phase별 산출물/SKIPPED 현황 표를 포함한다. "산출물 없이 완주"는 이 계약 하에서 정의상 발생할 수 없어야 한다 (과거 실측: 3회 실행 중 2회가 D 산출물 없이 G까지 완주 — 이 관문이 그 재발 방지책이다).

## 워크플로우

### Phase 0: 컨텍스트 확인 (후속 작업 지원)

1. `_workspace/` 존재 여부 확인
2. 실행 모드 결정:
   - **미존재** → 초기 실행. Phase 1로
   - **존재 + 부분 수정 요청**(예: "백엔드만 다시") → 부분 재실행. 해당 Phase 에이전트만 재호출, 프롬프트에 기존 산출물 경로 + 사용자 피드백 포함
   - **존재 + 새 기능 입력** → 새 실행. `_workspace/`를 `_workspace_{타임스탬프}/`로 이동 후 초기 실행 (타임스탬프는 `date +%Y%m%d_%H%M%S`로 생성, 암산 금지)

### Phase 1: 준비
1. 사용자 요청에서 기능 범위·영향 영역(백엔드/프론트/양쪽) 파악
2. `_workspace/` 생성, 입력을 `_workspace/00_input.md`에 저장. **기능 시작 시점 baseline 스냅샷 저장**: `git status --porcelain > _workspace/00_base_changed.txt` (Phase G `docs-sync`가 이번 기능의 변경 파일을 무관한 기존 워킹트리 수정과 분리하는 기준 — 미저장 시 docs-sync가 변경 범위를 단정 못 함)
3. **복잡도 판정** (`.claude/rules/aos-workflow.md` 기준): Trivial(0 에이전트, 하네스 불필요) / Simple(1) / Moderate(2-3). Trivial이면 사용자에게 "이건 직접 처리가 빠릅니다" 제안 후 중단

### Phase A: 계획 [순차]
- `planner` 1개 호출 (run_in_background: false). 산출 계획을 사용자에게 보여주고 **명시적 승인**을 받는다 (planner의 원칙). 승인 전 Phase B로 진행 금지.
- planner는 읽기 전용이므로 일반 규칙대로 계획을 **반환값으로** 제출하고, 오케스트레이터가 `_workspace/A_planner_plan.md`에 저장한다.

### Phase B: 빌드 [팬아웃 · 병렬]
- 계획의 영향 영역에 따라 **단일 메시지에서 동시 호출**:
  - 백엔드 변경 있음 → `backend-integration-specialist` (run_in_background: true)
  - 프론트 변경 있음 → `web-ui-specialist` (run_in_background: true)
- 두 에이전트는 같은 계획(`_workspace/A_planner_plan.md`)을 입력으로 받되, **계약(API shape·필드명)을 계획서에 명시된 대로** 구현하도록 프롬프트에 강조 (경계면 사전 정렬)
- 한쪽 영역만 있으면 해당 에이전트 1개만 호출 (팬아웃 생략. 미실행 트랙은 `_workspace/B_SKIPPED.md`에 사유 기록 — Phase 전환 관문)

### Phase C: 통합 검증 [생성-검증]
- `integration-qa` 1개 호출 (run_in_background: false). 입력: `_workspace/B_backend_impl.md` + `_workspace/B_frontend_impl.md` + 실제 변경 파일
- integration-qa는 읽기 전용이므로 리포트를 반환값으로 받아 오케스트레이터가 `_workspace/C_integration_report.md`에 저장한다
- 🔴 FAIL이 있으면 → 해당 담당 에이전트(backend/frontend)를 **재호출하여 수정**(Phase B 부분 재실행), 그 후 Phase C 재검증. **최대 2회 반복 후에도 FAIL이면 BLOCKED — Phase D~G 진행 금지.** FAIL 항목을 리포트와 최종 보고에 명시하고 사용자 판단을 요청하며, 결과는 '완료'가 아닌 '미완(BLOCKED)'으로 종료한다 (에러 핸들링 표와 동일 정책 — 경계면 FAIL은 컴파일·단위테스트가 전부 녹색인 채 런타임에 깨지는 유형이라, 진행하면 D~F가 통과해도 파손 기능이 완료 선언된다)
- 백엔드·프론트 중 한쪽만 변경된 기능이면 경계면이 없으므로 Phase C 생략 가능 (단, 기존 경계면을 건드렸으면 수행. 생략 시 `_workspace/C_SKIPPED.md`에 사유 기록 — Phase 전환 관문)

### Phase D: 테스트 [순차]
- **소유권 분담**: 프론트 테스트(Vitest)는 `test-automation-specialist`가 작성·실행한다. 백엔드 테스트(pytest)는 `backend-integration-specialist`가 **Phase B에서 구현과 함께 작성**한다 — test-automation-specialist는 대시보드 전용이며 백엔드 테스트 코드를 작성하지 않는다
- `test-automation-specialist` 1개 호출. Phase B 구현 + Phase C 통과분에 대해 프론트 단위/통합 테스트 작성, 커버리지 임계치 충족 (임계치 SSOT: `src/dashboard/vitest.config.ts`의 `coverage.thresholds` — 문서에 수치를 복제하지 않는다)
- **pytest 결과 계약**: 백엔드 변경이 있는 기능이면 `_workspace/D_test_report.md`에 반드시 pytest 실행 결과를 포함한다 — 실행 명령(CWD `src/backend`에서 `uv run pytest ../../tests/backend -v --tb=short`), passed/failed/skipped 개수, 실패 시 에러 요약. pytest 실패 시 테스트 소유자인 `backend-integration-specialist`를 재호출하여 수정 후 재실행한다. 새 async 테스트는 `@pytest.mark.asyncio` 필수(`.claude/rules/aos-backend.md` Pytest 규칙)

### Phase E: 리뷰 [팬인 · 병렬]
- **단일 메시지에서 동시 호출**: `code-reviewer` + `security-reviewer` (둘 다 run_in_background: true)
- 두 리뷰어는 읽기 전용이므로 리포트를 반환값으로 받아 오케스트레이터가 `_workspace/E_code_review.md` / `_workspace/E_security_review.md`에 저장한다. CRITICAL/HIGH 이슈는 담당 에이전트 재호출로 수정

### Phase F: 최종 게이트
- `verification-loop` 스킬 실행 — **풀스택 게이트**: 백엔드 변경 시 백엔드 트랙(CWD `src/backend`: ruff → mypy → pytest), 프론트 변경 시 프론트 트랙(CWD `src/dashboard`: tsc --noEmit → ESLint → vitest run → build). 트랙 선택·명령·CWD는 verification-loop 스킬 정의를 따른다. 실패 시 자동 재시도(최대 3회). 0 에러 확인 후에만 완료 선언
- 게이트 실행 요약(트랙별 명령·결과 표)을 오케스트레이터가 `_workspace/F_verification.md`에 저장한다

### Phase G: 문서 동기화 [순차]
- `docs-sync` 1개 호출 (run_in_background: false). **Phase F 게이트 통과 후** 실행 — 빌드/테스트가 녹색일 때만 문서를 확정한다 (테스트 통과 전 문서 갱신은 시기상조)
- 입력: `_workspace/00_base_changed.txt`(baseline) + `_workspace/A·B·C` 산출물 + 현재 `git status`
- docs-sync는 **(현재 변경 − baseline) 델타**로 이번 기능이 건드린 파일만 식별 → `.claude/rules/mandatory-docs.md` 매핑표대로 영향 docs/만 surgical 갱신. raw `git diff` 전체를 신뢰하지 않는다(워킹트리의 무관한 기존 수정 혼입 방지)
- 결과를 `_workspace/G_docs_sync.md`로 보고. 갱신할 문서가 없으면(델타 0 또는 신규 정보 없음) "문서 갱신 불필요"로 정상 통과. **백엔드/프론트 어느 쪽도 docs 매핑 영역을 건드리지 않았으면 Phase G 생략 가능** (생략 시 `_workspace/G_SKIPPED.md`에 사유 기록 — Phase 전환 관문)

### Phase 정리
1. `_workspace/` 보존 (감사 추적용 — 삭제 금지). `.gitignore`에 `_workspace/`가 등록되어 있어 untracked 잔여물로 뜨지 않는다 (미등록 시 먼저 추가).
2. 사용자에게 결과 요약: 변경 파일, 테스트 결과, 리뷰 findings, 게이트 통과 증거
3. **Phase 7 진화**: "결과나 워크플로우에서 바꿀 점이 있나요?" 피드백 기회 제공

## 데이터 흐름

```
[사용자 요청]
   ↓
Phase A: planner ──(승인)──→ A_planner_plan.md
   ↓
Phase B: backend-spec ∥ web-ui-spec  (병렬, 같은 계획 입력)
   ↓                    ↓
B_backend_impl.md   B_frontend_impl.md
   └──────┬───────────┘
          ↓
Phase C: integration-qa (양쪽 동시 읽기) → FAIL이면 B로 되돌림
          ↓ (PASS)
Phase D: test-automation-specialist → D_test_report.md
          ↓
Phase E: code-reviewer ∥ security-reviewer  (병렬 팬인)
          ↓ (CRITICAL 수정)
Phase F: verification-loop (FE: tsc+lint+vitest+build ∥ BE: ruff+mypy+pytest) → 0 에러
          ↓
Phase G: docs-sync (변경 델타 → mandatory-docs 매핑 → docs/ surgical 갱신)
          ↓
   [최종 보고 + 진화 피드백]
```

## 데이터 전달 전략
- **반환값 기반**: 각 에이전트 호출의 요약 반환값을 메인이 수집
- **파일 기반**: 상세 산출물·변경 내역은 `_workspace/{phase}_{agent}_{artifact}.md`
- 파일명 컨벤션: `{phase}_{agent}_{artifact}.{ext}` (예: `B_backend_impl.md`)
- 실제 코드 변경은 에이전트가 직접 `src/` 파일에 적용 (Edit/Write), `_workspace/`에는 변경 요약만

## 에러 핸들링

| 상황 | 전략 |
|------|------|
| 에이전트 1개 실패 | 1회 재시도. 재실패(2회 실패) 시 **BLOCKED** — 해당 Phase가 적용 대상(사전 선언 생략 조건 미충족)이면 다음 Phase 진행 금지. 실패를 `{phase}_SKIPPED.md`로 기록해 우회하는 것 금지(SKIPPED는 NOT_APPLICABLE 전용). 실패 내용을 최종 보고에 명시하고 사용자 판단 요청, '미완(BLOCKED)'으로 종료 |
| Phase B 한쪽 실패 | 성공한 쪽은 보존, 실패한 영역만 1회 재호출. 재실패(2회 실패) 시 **BLOCKED** — 그 트랙이 계획상 적용 대상이면 Phase C 이하 진행 금지('에이전트 1개 실패' 행과 동일 정책). 실패 내용을 최종 보고에 명시하고 사용자 판단 요청, '미완(BLOCKED)'으로 종료 |
| Phase C FAIL 반복(2회 초과) | **BLOCKED**: Phase D~G 진행 금지. FAIL 항목을 최종 보고에 명시하고 사용자 판단 요청, '완료' 대신 '미완(BLOCKED)'으로 종료 |
| Phase F 게이트 3회 실패 | 빌드 깨진 채 완료 선언 금지. 실제 에러 출력과 함께 사용자에게 보고 |
| 상충하는 리뷰 의견 | 출처 병기, 임의 삭제 금지 |

## 테스트 시나리오

### 정상 흐름
1. 사용자: "에이전트 목록에 즐겨찾기 토글 기능 추가해줘 (백엔드 API + 대시보드 버튼)"
2. Phase 1: 영향 영역 = 양쪽, 복잡도 = Moderate
3. Phase A: planner가 3~5단계 계획 생성 → 사용자 승인
4. Phase B: backend-spec(즐겨찾기 엔드포인트+모델) ∥ web-ui-spec(토글 버튼+훅) 병렬
5. Phase C: integration-qa가 `is_favorite`(API snake_case) ↔ 프론트 타입 일치 교차 검증 → PASS
6. Phase D: 테스트 작성, 커버리지 충족
7. Phase E: code-reviewer ∥ security-reviewer → 이슈 0
8. Phase F: verification-loop 0 에러 → 완료 보고
9. 예상 결과: 백엔드+프론트 변경 + 테스트 + `_workspace/` 산출물

### 에러 흐름
1. Phase C에서 integration-qa가 🔴 FAIL 발견: API는 `is_favorite`(snake_case) 반환, 프론트 타입은 `isFavorite`(camelCase) 기대 → 런타임 `undefined`
2. 담당 판정: 계획서가 snake_case 명시 → frontend 책임 → `web-ui-specialist` 재호출(타입 수정)
3. Phase C 재검증 → PASS
4. Phase D~F 정상 진행
5. 최종 보고에 "경계면 불일치 1건 발견·수정(C단계)" 기록

## 진화 (Phase 7)
- 같은 유형 피드백 2회 반복 시 → 해당 에이전트의 스킬/정의 수정 제안
- 변경은 `CLAUDE.md`의 "하네스: AOS 기능 개발" 변경 이력 테이블에 기록
- 에이전트가 반복 실패하는 패턴 발견 시 진화 제안
