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
    [출력] 결과를 `_workspace/{phase}_{agent}_{artifact}.md`에 저장하고, 반환값으로 요약 보고.
  """
)
```

`{agent-name}`은 아래 표의 에이전트 파일명. `model: "opus"`는 모든 호출에 명시 (test-automation-specialist 포함 — 추론 품질 우선).

> **읽기 전용 에이전트 주의:** `planner`는 Write/Edit 도구가 없다(읽기 전용). 따라서 `[출력]`에 "파일로 저장"을 지시해도 스스로 저장하지 못한다. 이런 에이전트는 산출물을 **반환값으로 제출**하게 하고, **오케스트레이터가 받아서 `_workspace/`에 저장**한다.

## 에이전트 구성 (기존 재사용 + integration-qa 1개 신규)

| Phase | 에이전트(.md) | 역할 | 연결 스킬 | 출력 |
|-------|--------------|------|----------|------|
| A | `planner` | 요구사항 인터뷰·3~6단계 계획 | — | `_workspace/A_planner_plan.md` |
| B-1 | `backend-integration-specialist` | FastAPI/SQLAlchemy/LangGraph 구현 | verify-backend | `_workspace/B_backend_impl.md` |
| B-2 | `web-ui-specialist` | React/Tailwind/Zustand 구현 | react-web-development | `_workspace/B_frontend_impl.md` |
| C | `integration-qa` ★신규 | API↔훅 경계면 교차 검증 | — | `_workspace/C_integration_report.md` |
| D | `test-automation-specialist` | Vitest/pytest 테스트 작성·커버리지 | test-automation | `_workspace/D_test_report.md` |
| E-1 | `code-reviewer` | 품질·유지보수성 리뷰 | — | `_workspace/E_code_review.md` |
| E-2 | `security-reviewer` | 보안 취약점 감사 | — | `_workspace/E_security_review.md` |
| F | (스킬) `verification-loop` | tsc+lint+test+build 최종 게이트 | verification-loop | — |

## 워크플로우

### Phase 0: 컨텍스트 확인 (후속 작업 지원)

1. `_workspace/` 존재 여부 확인
2. 실행 모드 결정:
   - **미존재** → 초기 실행. Phase 1로
   - **존재 + 부분 수정 요청**(예: "백엔드만 다시") → 부분 재실행. 해당 Phase 에이전트만 재호출, 프롬프트에 기존 산출물 경로 + 사용자 피드백 포함
   - **존재 + 새 기능 입력** → 새 실행. `_workspace/`를 `_workspace_{타임스탬프}/`로 이동 후 초기 실행 (타임스탬프는 `date +%Y%m%d_%H%M%S`로 생성, 암산 금지)

### Phase 1: 준비
1. 사용자 요청에서 기능 범위·영향 영역(백엔드/프론트/양쪽) 파악
2. `_workspace/` 생성, 입력을 `_workspace/00_input.md`에 저장
3. **복잡도 판정** (`.claude/rules/aos-workflow.md` 기준): Trivial(0 에이전트, 하네스 불필요) / Simple(1) / Moderate(2-3). Trivial이면 사용자에게 "이건 직접 처리가 빠릅니다" 제안 후 중단

### Phase A: 계획 [순차]
- `planner` 1개 호출 (run_in_background: false). 산출 계획을 사용자에게 보여주고 **명시적 승인**을 받는다 (planner의 원칙). 승인 전 Phase B로 진행 금지.
- planner는 read-only(Write 없음)이므로 계획을 **반환값으로** 제출한다. 오케스트레이터가 그 반환값을 받아 `_workspace/A_planner_plan.md`에 Write로 저장한다.

### Phase B: 빌드 [팬아웃 · 병렬]
- 계획의 영향 영역에 따라 **단일 메시지에서 동시 호출**:
  - 백엔드 변경 있음 → `backend-integration-specialist` (run_in_background: true)
  - 프론트 변경 있음 → `web-ui-specialist` (run_in_background: true)
- 두 에이전트는 같은 계획(`_workspace/A_planner_plan.md`)을 입력으로 받되, **계약(API shape·필드명)을 계획서에 명시된 대로** 구현하도록 프롬프트에 강조 (경계면 사전 정렬)
- 한쪽 영역만 있으면 해당 에이전트 1개만 호출 (팬아웃 생략)

### Phase C: 통합 검증 [생성-검증]
- `integration-qa` 1개 호출 (run_in_background: false). 입력: `_workspace/B_backend_impl.md` + `_workspace/B_frontend_impl.md` + 실제 변경 파일
- 🔴 FAIL이 있으면 → 해당 담당 에이전트(backend/frontend)를 **재호출하여 수정**(Phase B 부분 재실행), 그 후 Phase C 재검증. 최대 2회 반복 후에도 FAIL이면 리포트에 명시하고 진행
- 백엔드·프론트 중 한쪽만 변경된 기능이면 경계면이 없으므로 Phase C 생략 가능 (단, 기존 경계면을 건드렸으면 수행)

### Phase D: 테스트 [순차]
- `test-automation-specialist` 1개 호출. Phase B 구현 + Phase C 통과분에 대해 단위/통합 테스트 작성, 커버리지 임계치(quality-reference.md: stmt 75%/func 70%/branch 60%/line 75%) 충족

### Phase E: 리뷰 [팬인 · 병렬]
- **단일 메시지에서 동시 호출**: `code-reviewer` + `security-reviewer` (둘 다 run_in_background: true)
- 두 리포트를 Read로 수집, CRITICAL/HIGH 이슈는 담당 에이전트 재호출로 수정

### Phase F: 최종 게이트
- `verification-loop` 스킬 실행 (tsc --noEmit → ESLint/ruff → vitest/pytest → build). 실패 시 자동 재시도(최대 3회). 0 에러 확인 후에만 완료 선언

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
Phase F: verification-loop (tsc+lint+test+build) → 0 에러
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
| 에이전트 1개 실패 | 1회 재시도. 재실패 시 누락 명시하고 다음 Phase 진행 |
| Phase B 한쪽 실패 | 성공한 쪽은 보존, 실패한 영역만 재호출. 경계면 검증(C)에서 미완 표시 |
| Phase C FAIL 반복(2회 초과) | 수정 중단, FAIL 항목을 최종 보고에 명시하고 사용자 판단 요청 |
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
