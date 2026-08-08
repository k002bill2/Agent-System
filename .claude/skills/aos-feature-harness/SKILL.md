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
| E-3 | (외부 CLI) `codex-companion review` | Claude 계열 밖의 외부 시점 검증 (기본 실행) | — | `_workspace/E_codex_review.md` (오케스트레이터 저장) |
| F | (스킬) `verification-loop` | 풀스택 최종 게이트 (FE: tsc+lint+vitest run+build / BE: ruff+mypy+pytest) | verification-loop | `_workspace/F_verification.md` (오케스트레이터 저장) |
| G | `docs-sync` ★신규 | 변경 델타↔mandatory-docs 매핑 후 문서 동기화 | — | docs/ 직접 수정 + `_workspace/G_docs_sync.md` |

A·C·E-1·E-2 산출물은 담당 에이전트가 읽기 전용이므로 **오케스트레이터가 반환값을 받아 저장**한다(위 일반 규칙). E-3·F는 오케스트레이터 자신이 외부 명령/스킬을 실행하므로 결과를 직접 저장한다.

**E-3는 다른 필수 Phase와 동일한 관문 대상이다** — Phase F로 넘어가기 전에 `_workspace/E_codex_review.md` 또는 `_workspace/E3_SKIPPED.md` 중 하나가 반드시 실존해야 한다. **파일 실존만으로는 부족하다**: 이전 런의 산출물이나 수정 전 리포트가 남아 있으면 그대로 관문을 통과시킨다. 신선도 기준은 **델타 패치 해시**다 — 지금 계산한 `git diff --binary B0 B1 | shasum` 이 산출물 머리에 적힌 해시와 같아야 한다(양쪽 모두 `--binary` 형태로 통일한다. 한쪽만 붙이면 바이너리 변경이 있을 때 정상 리포트가 해시 불일치로 거부된다). 파일 목록이나 base SHA 로는 부족하다: E-3 지적을 반영해 같은 파일을 수정하면 목록도 base 도 그대로라 **수정 전 리포트가 그대로 통과한다**. 따라서 **CRITICAL/HIGH 수정 후에는 반드시 E-3 를 재실행**하고, 해시가 일치할 때까지 이 루프를 돈다.

**신선도 계약은 `E3_SKIPPED.md` 에도 똑같이 적용된다** — SKIPPED 도 관문을 통과시키는 증거이므로 같은 헤더(`B0`/`B1` SHA·델타 패치 해시)를 기록하고 같은 방식으로 대조한다. 보호를 성공 산출물에만 걸면 SKIPPED 가 우회로가 된다: 이전 런의 "델타 0건" 또는 "Codex CLI 미설치" 파일이 남아 있으면, 재개 런에서 코드가 추가된 뒤에도 그 파일이 그대로 F 로 넘겨준다. 해시가 다르면 스테일이므로 파일을 무효화하고 E-3 를 실행한다. 실행 명령이 에러로 죽었거나 base 지정이 잘못돼 결과가 없으면 그것은 SKIPPED가 아니라 **재시도 대상**이고, 2회 실패 시 BLOCKED다(아래 "Phase 전환 관문" 3·4항과 에러 핸들링 표를 그대로 적용). E3_SKIPPED가 허용되는 사전 선언 조건은 두 가지뿐: (1) 리뷰 대상 변경 0건, (2) Codex CLI 미설치·미로그인.

## Phase 전환 관문 (산출물 완결성 · 필수)

각 Phase 종료 시, 다음 Phase로 넘어가기 **전에** 오케스트레이터는 위 표의 해당 산출물 파일이 `_workspace/`에 실존하는지 Glob/Read로 확인한다. 에이전트의 "저장했다" 보고를 그대로 믿지 않는다:

1. **산출물 실존** → 다음 Phase 진행
2. **반환값만 있음** (읽기 전용 에이전트 포함) → 오케스트레이터가 반환값을 해당 경로에 Write로 저장한 뒤 진행
3. **Phase 생략 (NOT_APPLICABLE · 사전 선언 전용)** → 반드시 `_workspace/{phase}_SKIPPED.md`를 먼저 작성하고 진행. 파일에 (1) 생략 사유, (2) 판단 근거(예: 변경 파일 목록, "프론트 전용 기능이라 경계면 없음"), (3) 결정 주체(각 Phase에 명시된 생략 조건 자동 적용 / 사용자 지시)를 기록한다. 생략이 허용되는 경우는 **각 Phase 절에 명시된 사전 선언 조건뿐**이다 (B: 단일 영역이라 팬아웃 생략, C: 한쪽 영역만 변경, G: docs 매핑 영역 미접촉). **실행 실패는 SKIPPED 사유가 될 수 없다** — 적용 대상 Phase의 에이전트가 재시도 후에도 실패하면 그 Phase는 **BLOCKED**이며 이후 Phase 진행 금지(에러 핸들링 표). SKIPPED 파일은 "해당 없음"의 기록이지 "실패"의 기록이 아니다
4. **산출물도 SKIPPED 기록도 없음** → 다음 Phase 진행 금지. 해당 Phase를 재실행하거나(에러 핸들링 표 참조) 사용자에게 보고한다

최종 보고에 Phase별 산출물/SKIPPED 현황 표를 포함한다. "산출물 없이 완주"는 이 계약 하에서 정의상 발생할 수 없어야 한다 (과거 실측: 3회 실행 중 2회가 D 산출물 없이 G까지 완주 — 이 관문이 그 재발 방지책이다).

## 실행 상태 매니페스트 (`_workspace/RUN_STATE.md` · 필수)

오케스트레이터는 각 Phase **시작 직전과 종료 직후**(상태 변화 시마다) `_workspace/RUN_STATE.md`를 갱신한다:

```markdown
| Phase | 상태 | 시도 | 시작 | 종료 | 산출물/비고 |
|-------|------|------|------|------|------------|
| A | DONE | 1 | 12:01:03 | 12:04:22 | A_planner_plan.md |
| B | DONE | 1 | 12:05:10 | 12:19:44 | B_backend_impl.md, B_frontend_impl.md |
| C | BLOCKED | 3 | 12:20:01 | 12:41:12 | FAIL 2회 초과 — 사용자 판단 대기 |
```

- 상태 값: `PENDING` / `RUNNING` / `DONE` / `SKIPPED`(NOT_APPLICABLE — 사유는 `{phase}_SKIPPED.md`) / `BLOCKED`
- 타임스탬프는 `date +%H:%M:%S`로 생성한다 (암산 금지)
- **재개 판별의 진실원**: Phase 0에서 `_workspace/`가 존재하면 산출물 파일 존재 추론에 앞서 RUN_STATE.md를 먼저 Read하여 재개 지점을 결정한다. RUN_STATE.md 부재(구버전 런) 시에만 파일 존재 추론으로 폴백
- Phase 전환 관문의 판정 결과(산출물 실존/SKIPPED/BLOCKED)도 이 표에 남는다 — 런 종료 시 Phase별 소요 시간·재시도 횟수 요약이 이 파일 하나로 확보된다 (관측성 최소 배선)

## 워크플로우

### Phase 0: 컨텍스트 확인 (후속 작업 지원)

1. `_workspace/` 존재 여부 확인. 존재하면 `_workspace/RUN_STATE.md`를 **먼저 Read**하여 이전 런의 Phase별 상태·재개 지점을 파악한다 (부재 시 구버전 런 — 산출물 파일 존재 추론으로 폴백)
2. 실행 모드 결정 — **위에서부터 순서대로 평가하고, 처음 일치하는 분기 하나만 적용한다**:
   - **미존재** → 초기 실행. Phase 1로
   - **[최우선] 존재 + Phase A가 BLOCKED** (사유 불문) → Phase A 관문이 아직 닫혀 있으므로 **아래 어떤 분기보다 먼저** 이 경로에서 처리하고, 아래 "부분 수정 요청"·"새 기능" 분기로 내려보내지 않는다. 행동은 다음 **상태 전이표**로 결정한다 (RUN_STATE의 BLOCKED 사유 × 사용자 입력 유형):

     | BLOCKED 사유 ＼ 입력 유형 | ① 원안 그대로 승인 | ② 승인 + 수정·범위 변경 | ③ 수정·재시도 요청(승인 문구 없음) | ④ 명시적 취소 + 무관한 새 기능 | ⑤ 명시적 취소만 | ⑥ 범위 지정만(승인 문구 없음) | ⑦ 그 외 / 판별 불가 |
     |---|---|---|---|---|---|---|---|
     | **승인 대기** (`A_planner_plan.md` 존재) | **승인 재개** — RUN_STATE의 Phase A를 `DONE`으로(승인 시각·근거 발화 기록), 저장된 계획을 **그대로** 채택해 Phase B부터. `_workspace/` 이동·planner 재호출 없음 | **Phase A 재실행** | **Phase A 재실행** | **아카이브 후 초기 실행** | **아카이브 후 종료** | **Phase A 재실행** | **BLOCKED 유지 + 되묻기** |
     | **planner 실행 실패** (2회 — 계획 파일 부재 가능) | **Phase A 재실행** (승인 입력이 와도 재개가 아니다 — 실패를 승인으로 우회할 수 없다) | **Phase A 재실행** | **Phase A 재실행** | **아카이브 후 초기 실행** | **아카이브 후 종료** | **Phase A 재실행** | **BLOCKED 유지 + 되묻기** |
     | **그 외 사유** | **Phase A 재실행** | **Phase A 재실행** | **Phase A 재실행** | **아카이브 후 초기 실행** | **아카이브 후 종료** | **Phase A 재실행** | **BLOCKED 유지 + 되묻기** |

     - **행동 정의**: **Phase A 재실행** = planner 재호출 → `_workspace/A_planner_plan.md` 덮어쓰기 → 승인 절차 반복(승인 없이 Phase B 도달 금지). **재호출 프롬프트에는 직전 계획(`A_planner_plan.md`) 경로와 사용자의 수정 요청·범위 변경 발화를 반드시 함께 넣는다** — 아래 부분 재실행 분기와 같은 규칙이며, 빠뜨리면 planner가 거부된 계획을 그대로 재생성한다(예: 빼달라고 한 마이그레이션이 그대로 남음). **아카이브 후 초기 실행** = **먼저 `_workspace/RUN_STATE.md`에 중단 사유를 기록한 뒤** `_workspace/`를 `_workspace_{타임스탬프}/`로 이동하고 Phase 1부터 새 실행. **아카이브 후 종료** = 동일하게 **기록 후 이동**하고 종료(새 실행 시작 안 함). **BLOCKED 유지 + 되묻기** = 상태를 바꾸지 않고 승인·수정 요청·취소 중 무엇인지 사용자에게 되물은 뒤 턴 종료
     - **기록은 이동보다 먼저**: ④·⑤의 RUN_STATE 기록은 반드시 이동 **전에** 수행한다. 순서를 뒤집으면 `_workspace/RUN_STATE.md`가 이미 아카이브 경로로 옮겨진 뒤라 쓰기가 실패하거나, 실패를 피하려 **빈 `_workspace/`를 새로 만들어** 다음 요청이 손상된 재개 런으로 오인된다
     - **전역성**: 이 표는 분기 나열을 대체하는 **전역 함수**다. 어떤 (사유, 입력) 조합도 반드시 한 셀에 매칭되며, 표에 열거되지 않은 입력은 전부 ⑦로 귀결된다. 새 입력 유형이 생겨 매칭이 모호하면 케이스를 추론해 끼워 맞추지 말고 ⑦로 처리한다
     - **③의 범위**: "마이그레이션 빼고 다시 짜줘"(수정)와 "planner 다시 돌려줘"(재시도)를 **모두** 포함한다 — 둘 다 계획을 새로 만들어 승인 절차를 다시 거치므로 행동이 같다. 특히 사유=planner 실행 실패 상태에서 **재시도 요청이 ⑦(되묻기)로 빠지면 규정된 복구 경로에 영원히 도달하지 못한다** — ⑦은 의도를 판별할 수 없을 때만 쓰는 종결 행동이다
     - **취소 판정은 명시적 발화만**: ④·⑤는 "취소", "그만", "이건 접고", "버리고" 같은 **명시적 중단 의사**가 있을 때만 해당한다. 새 요청이 들어왔다는 사실만으로 취소를 추론하지 않는다 — 모호하면 ⑦(되묻기)이다. 위임 추론 금지 원칙과 같은 이유다
     - **타임스탬프**: `date +%Y%m%d_%H%M%S`로 생성한다. 암산 금지
   - **존재 + 부분 수정 요청**(예: "백엔드만 다시") → 부분 재실행. RUN_STATE.md 기준으로 해당 Phase 에이전트만 재호출, 프롬프트에 기존 산출물 경로 + 사용자 피드백 포함. **단 Phase A가 BLOCKED이면(사유 불문) 이 분기는 적용되지 않는다** — 위 상태 전이표가 단독으로 결정한다(선점 조건을 여기서 좁혀 진술하지 않는다)
   - **존재 + 새 기능 입력** → 새 실행. `_workspace/`를 `_workspace_{타임스탬프}/`로 이동 후 초기 실행 (타임스탬프는 `date +%Y%m%d_%H%M%S`로 생성, 암산 금지)

### Phase 1: 준비
1. 사용자 요청에서 기능 범위·영향 영역(백엔드/프론트/양쪽) 파악
2. `_workspace/` 생성, 입력을 `_workspace/00_input.md`에 저장. **기능 시작 시점 baseline 스냅샷 저장**: `git status --porcelain > _workspace/00_base_changed.txt` (Phase E 리뷰어와 Phase G `docs-sync`가 이번 기능의 변경 파일을 무관한 기존 워킹트리 수정과 분리하는 기준 — 미저장 시 변경 범위를 단정 못 함). **시작 시점 base ref + baseline 워킹트리 스냅샷 저장**: base SHA / 브랜치명 / baseline 스냅샷 `B0` 세 줄을 `_workspace/00_base_ref.txt`에 기록한다. `B0`는 아래 헬퍼로 만든다 — `git stash create`는 **untracked 파일을 트리에서 누락**하므로 쓰지 않는다(실측 확인). 이 방식은 워킹트리를 건드리지 않고 커밋 객체만 만들어 다른 세션에 영향이 없다:
```bash
snap() { local i=$(mktemp -u); GIT_INDEX_FILE="$i" git add -A; local t=$(GIT_INDEX_FILE="$i" git write-tree); rm -f "$i"; git commit-tree "$t" -p HEAD -m snap; }
{ git rev-parse HEAD; git rev-parse --abbrev-ref HEAD; snap; } > _workspace/00_base_ref.txt
``` 둘 다 사후 복원이 불가하다 — base 는 기능 브랜치가 `main`이 아닌 다른 작업 브랜치 위에서 갈라졌을 때 `main`을 잡으면 남의 커밋이 리뷰에 섞이고, `B0` 없이는 "이미 더러웠던 파일을 이번 기능이 또 고친 경우"의 델타를 내용 기준으로 계산할 수 없다. `_workspace/RUN_STATE.md` 초기화(전 Phase `PENDING`)
3. **복잡도 판정** (`.claude/rules/aos-workflow.md` 기준): Trivial(0 에이전트, 하네스 불필요) / Simple(1) / Moderate(2-3). Trivial이면 사용자에게 "이건 직접 처리가 빠릅니다" 제안 후 중단

### Phase A: 계획 [순차]
- `planner` 1개 호출 (run_in_background: false). 산출 계획을 사용자에게 보여주고 **명시적 승인**을 받는다 (planner의 원칙). 승인 전 Phase B로 진행 금지.
- planner는 읽기 전용이므로 일반 규칙대로 계획을 **반환값으로** 제출하고, 오케스트레이터가 `_workspace/A_planner_plan.md`에 저장한다.
- **승인 대기 상태 영속화 (타이머 금지)**: 승인을 요청하는 **바로 그 시점에** RUN_STATE의 Phase A를 `BLOCKED`(비고: "승인 대기")로 기록한 뒤 턴을 종료한다. **"N분 무응답 후 전환"에 의존하지 않는다** — 턴이 끝나면 상태를 바꿔줄 에이전트가 없으므로 그런 전환은 실행 주체가 없고, Phase A가 `RUNNING`으로 남으면 뒤늦은 승인이 재개 분기에 매칭되지 않아 새 실행으로 오인된다
- **승인 무응답(AFK) 정책**: **무응답은 승인이 아니다.** 승인 요청 후 사용자 응답이 없으면 Phase A는 위에서 기록한 **BLOCKED 상태로 유지**된다 — 하네스의 다른 게이트(에이전트 2회 실패·Phase C FAIL 반복)와 동일한 fail-closed 원칙이다. 정보 부재를 진행 신호로 해석하지 않는다
  - **유일한 예외**: 이번 실행을 요청한 **사용자 입력에 AFK 자동 승인 허용이 명시적 문구로 포함**돼 있고(예: "자리 비우니 저위험이면 승인 없이 진행해"), 계획이 **저위험**(가역적·소규모·기존 API/스키마 계약 내·외부 발신 없음)일 때만 — 승인 요청·BLOCKED 기록 없이 **같은 턴에서** 원안 채택 후 Phase B로 계속 진행한다. RUN_STATE와 최종 보고에 "AFK 자동 승인(사후 거부권)"과 **근거가 된 사용자 발화를 인용**해 남긴다
  - **위임 추론 금지**: "하네스로 만들어줘" 같은 실행 요청 자체는 AFK 승인 위임이 **아니다**. 오케스트레이터가 위임 여부를 추론하면 안 된다 — 명시적 발화가 없으면 예외는 적용되지 않으며 BLOCKED가 유지된다
  - **고위험 계획**(DB 스키마 변경·데이터 이동/삭제·외부 서비스 발신·비가역 작업 포함)은 **명시적 위임이 있어도 자동 승인 대상이 아니다.** 진행 금지, Phase A를 BLOCKED로 두고 사용자 응답 대기. 판단이 모호하면 고위험으로 취급한다
- **BLOCKED의 출구**(BLOCKED는 정상 경로이므로 출구를 정의한다): 뒤늦게 사용자 입력이 왔을 때의 **분기 결정은 Phase 0의 상태 전이표가 단독으로 정의한다**(여기서 중복 정의하지 않는다). 여기서는 그 경로들의 실행 세부만 규정한다 — **승인 재개**로 판정되면 RUN_STATE의 Phase A를 `DONE`으로 갱신하며 승인 시각과 근거가 된 사용자 발화를 함께 기록하고, `A_planner_plan.md`를 재생성 없이 그대로 Phase B 입력으로 넘긴다. **Phase A 재실행**으로 판정되면 갱신된 계획으로 승인 절차를 처음부터 다시 거치며, 어느 경우에도 승인 없이 Phase B로 넘어가지 않는다

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
- **리뷰 범위 델타화**: 두 리뷰어의 입력에 `_workspace/00_base_changed.txt`(baseline) + 현재 `git status --porcelain` + B·C 산출물을 포함하고, **"(현재 변경 − baseline) 델타 파일만 리뷰"**를 프롬프트에 명시한다 (docs-sync와 동일한 델타 규칙 — 다중 세션 워킹트리의 무관한 기존 수정이 리뷰에 혼입되는 것 방지). baseline 부재 시 B·C 산출물이 명시한 파일만 대상으로 하고 리포트에 UNVERIFIED로 표기
- 두 리뷰어는 읽기 전용이므로 리포트를 반환값으로 받아 오케스트레이터가 `_workspace/E_code_review.md` / `_workspace/E_security_review.md`에 저장한다. CRITICAL/HIGH 이슈는 담당 에이전트 재호출로 수정
- **E-3 (기본, 2026-08-08 옵션→기본 승격): Codex 외부 검증** — E-1/E-2는 Claude가 Claude를 리뷰하므로 동일 모델 계열의 상관된 맹점이 남는다. 이 맹점은 모델 성능으로 대체되지 않으므로 외부 시점을 **매 실행 붙인다**:
  실행 명령은 `node "$SCRIPT" review --scope branch --base <base>` 이며, **`$SCRIPT` 는 글롭이 아니라 단일 경로로 확정한다**: `SCRIPT=$(ls ~/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs | sort -V | tail -1)`. 캐시에 Codex 버전이 둘 이상 남아 있으면 따옴표 없는 `*` 가 여러 경로로 확장돼 node 가 두 번째 경로를 서브커맨드로 해석하고 즉시 종료한다 — 산출물 없이 필수 Phase 가 막힌다. 아래 격리 절차 안에서 Bash로 실행. 결과를 오케스트레이터가 `_workspace/E_codex_review.md`에 저장하고, CRITICAL/HIGH는 E-1/E-2와 동일하게 담당 에이전트 재호출로 수정. **기본이므로 "소규모 변경"은 생략 사유가 아니다** — `E3_SKIPPED.md`는 아래 절차 3단계(델타 0건)에서만 쓴다. Codex CLI 미설치·미로그인으로 실행 자체가 불가한 경우에는 그 사실을 `E3_SKIPPED.md`에 기록하고 Phase F로 진행한다(설치 상태는 통제 밖이므로 BLOCKED로 보지 않는다)
  - **격리 트리에서 단일 scope 로 실행한다 (유일 경로 · 현재 트리에서 직접 실행 금지)**. 이유는 도구 능력의 한계다: `--scope working-tree` 는 staged/unstaged/untracked **전부**를 리뷰하며 baseline 파일이나 필터 목록을 받지 않는다. 즉 "baseline 제외 델타만 본다"는 약속을 현재 트리에서는 **지킬 수단이 없다** — 다중 세션 워킹트리의 남의 변경이 그대로 Codex 에 들어가 무관한 지적이 수정 루프로 흘러든다. 반대로 `--scope branch` 로 도망가면 미커밋 기능 변경을 통째로 놓친다. 두 사각을 동시에 없애는 방법은 **리뷰 대상만 담긴 깨끗한 트리를 만드는 것**뿐이다:

    스냅샷 헬퍼(양쪽 시점에 동일하게 쓴다). `git stash create` 를 쓰면 **untracked 신규 파일이 트리에서 빠져** 기능이 추가한 파일을 통째로 놓치므로(실측 확인), 임시 인덱스 + `write-tree` 를 쓴다:
    ```bash
    snap() { local i=$(mktemp -u); GIT_INDEX_FILE="$i" git add -A; local t=$(GIT_INDEX_FILE="$i" git write-tree); rm -f "$i"; git commit-tree "$t" -p HEAD -m snap; }
    ```
    1. **base·baseline 스냅샷 확보** — `_workspace/00_base_ref.txt`(Phase 1 기록)에서 base SHA 와 baseline 워킹트리 스냅샷 커밋 `B0`. 파일이 없는 구버전 런이면 base 는 `git merge-base <출발브랜치> HEAD`, `B0` 는 base 로 대용하고 리포트에 `UNVERIFIED(base·baseline 추정)` 표기
    2. **델타 패치 산출 — 경로 뺄셈 금지, 내용 diff 로 한다** — `B1=$(snap)` 후 `git diff --binary "$B0" "$B1" > <패치>`. **baseline 의 파일 *경로* 를 빼는 방식은 틀린다**: Phase 1 에 이미 수정돼 있던 파일을 이번 기능이 또 고치면 경로 뺄셈이 그 기능 변경까지 통째로 지워, Codex 가 base 버전을 리뷰하고 "이상 없음"을 반환한다. 내용 diff 는 baseline 이후 변경분만 정확히 남긴다 (`00_base_changed.txt` 는 사람이 읽는 참고용으로만 남는다). `--binary` 는 필수다 — 없으면 바이너리 변경이 적용 불가한 마커로만 나와 5단계가 깨진다
    3. **델타 패치가 비면** `E3_SKIPPED.md` 에 "델타 0건" + `B0`/`B1` SHA + 델타 패치 해시를 기록하고 종료 (CLI 미설치로 인한 SKIPPED 도 같은 헤더를 기록한다 — 관문이 신선도를 대조한다)
    4. **격리 트리를 `<base>` 가 아니라 `B0` 에서 생성** — `git worktree add --detach <임시경로> "$B0"`. **`<base>` 에서 만들면 안 된다**: 패치의 preimage 가 `B0` 이므로 baseline 수정이 없는 트리에 적용하면, baseline 과 기능이 같은 hunk 를 건드린 경우 `git apply` 가 실패한다 — 하필 이 절차가 존재하는 이유인 "더러운 baseline" 상황에서만 깨진다
    5. **델타만 이식** — 격리 트리에서 `git apply <패치>` 후 `git add -A && git commit -m "e3 delta"`. 이 트리는 이제 `B0` + 기능 델타다(baseline 내용은 컨텍스트로 존재하되 리뷰 범위 밖). `git apply` 실패는 이식 실패이므로 **재시도 대상**이지 SKIPPED 가 아니다
    6. **1회 실행** — 격리 트리에서 `--scope branch --base "$B0"`. scope 분기도, 2회 실행도, 산출물 2개도 없다
    7. **정리** — 결과 저장 후 `git worktree remove <임시경로>`

    > 이 절차는 격리 샌드박스에서 e2e 실측했다(2026-08-08): 순수 baseline 파일은 델타에서 제외, baseline+기능 동시 수정 파일은 기능 hunk 만 델타로, untracked 신규 파일·기능 커밋 모두 포함, `git apply` 성공, `B0..HEAD` 리뷰 범위가 기능 델타와 정확히 일치.

    `E_codex_review.md` 머리에 **base SHA · `B0`/`B1` SHA · 델타 패치 해시(`git diff --binary B0 B1 | shasum`) · 델타 파일 수 · Codex 가 실제로 검토한 파일 수**를 기록한다. **델타 파일 수와 검토 파일 수가 다르면 통과가 아니다** — 이식 누락이므로 재실행한다. 이 절차는 메인 워킹트리의 HEAD 를 건드리지 않으므로 동시 작업 중인 다른 세션도 방해하지 않는다
  - **"지적 0건"은 통과 증거가 아니다**: 로그가 3줄 이하로 끝났거나 리뷰 대상 파일 수가 0이면 그것은 *미실행*이다. 실행 로그에 실제 검토 파일 목록이 있는지 확인한 뒤에만 통과로 기록한다
  - **detach + 단독 실행**: 장시간 예상 시 `nohup ... & disown` 후 로그 폴링(verification-loop의 detach 패턴과 동일). 단, **같은 응답에서 TaskStop을 함께 호출하지 않는다** — codex review가 조기 종료된다. 발사는 단독 응답으로 하고, 서브에이전트 정리는 결과 수령 후 별도 응답에서 한다

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
2. `RUN_STATE.md` 최종 갱신 — 전 Phase의 상태·시도·소요가 채워졌는지 확인
3. 사용자에게 결과 요약: 변경 파일, 테스트 결과, 리뷰 findings, 게이트 통과 증거, **RUN_STATE 기반 Phase별 소요·재시도 표**
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
Phase E-1/E-2: code-reviewer ∥ security-reviewer  (병렬 팬인)
          ↓ (CRITICAL 수정)
Phase E-3: Codex 외부 검증 (격리 트리 · 기본 실행 · 관문 대상)
          ↓ (CRITICAL 수정 시 델타가 바뀌므로 E-3 재실행 — 패치 해시 일치까지)
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
