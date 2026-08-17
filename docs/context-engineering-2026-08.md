# Claude 5 세대 컨텍스트 엔지니어링 규칙 — 현 시스템 도입 검토 (2026-08-15)

> 출처 영상: [Anthropic이 시스템 프롬프트 80%를 지운 이유](https://youtu.be/TWo-lXNbcws) (김플립 - LLM 코딩, 2026-08-12, 9:28)
> 영상의 원출처(확보·대조 완료): Thariq Shihipar(@trq212)의 X 게시글(2026-07-24, Opus 5 출시일) + 공식 블로그 [The new rules of context engineering for Claude 5 generation models](https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models)
> 성격: 도입 제안 문서로 작성 → 2026-08-15 승인·실행됨. 실행 결과는 문서 말미 "실행 기록" 참조.

## 요약 (결론 먼저)

영상의 6개 규칙 중 이 시스템에 **실질 도입 가치가 있는 것은 3개**(규칙 3·4·6), **이미 준수 중인 것이 2개**(규칙 2·5), **선별 적용해야 하는 것이 1개**(규칙 1)다.

가장 큰 단일 이득은 **프로젝트 CLAUDE.md 변경 이력 표의 분리**다 — 8,872자로 파일의 50%를 차지하는 역사 기록이 매 세션 주입되**던** 상태였다. 아래 수치는 모두 **다이어트 전(2026-08-15) 스냅샷**이다: 상시 주입 컨텍스트 실측 합계 = 글로벌 22,800자 + 프로젝트 17,866자 + 메모리 인덱스 19,995자 ≈ **60.7k자**. (P1-1 실행 후 이력 표는 `docs/harness-changelog.md`로 이전됐고 CLAUDE.md에는 백틱 포인터만 남아, 현재는 주입되지 않는다.)

> **2026-08-17 토큰 실측으로 정정된 두 문장** (원문은 이 자리에서 ①"60.7k자는 기존 베이스라인 ~51k 토큰과 정합한다" ②"200k 창 세션에서는 창의 25%가 시작 전에 소모된다"고 썼다):
> ① **층위가 다르다.** 규칙(글로벌+프로젝트 CLAUDE.md·rules) 40,666자 = **16,490 토큰**(다이어트 전 스냅샷 실측)인 반면, 베이스라인 ~51k 토큰은 시스템 프롬프트·도구 스키마·MCP 지침·스킬 목록까지 포함한 **세션 전체**다. 두 수를 "정합"으로 묶은 것은 오독이었다. (60.7k자 전체의 토큰 환산은 제시하지 않는다 — 메모리 인덱스는 다이어트 **후** 값 18,315자 = 8,733 토큰만 실측했고, 전 스냅샷 19,995자에 대응하는 토큰은 측정하지 않았다. 스냅샷이 다른 두 값을 더하면 같은 오류를 반복하게 된다.)
> ② **200k 창 소모율은 세션 유형으로 갈린다** (transcript 첫 턴 실측): 서브에이전트 **12~17%**, 200k 메인 세션 **26~32%**. 단일 25%로 뭉뚱그리면 메인 세션 쪽 압박을 과소평가한다.

반대로 영상의 "규칙을 지워라"를 이 시스템에 **일괄 적용하면 안 된다**. 이 시스템의 규칙 다수는 실측 사고에서 태어난 함정(gotcha) 기록이고, 원문의 "겉으로 봐선 모르는 함정만 적어라" 원칙은 그런 규칙의 **유지**를 정당화한다. 삭제 대상은 모델이 이미 아는 일반 원칙(DRY/KISS 설교, mutation 예제 코드 등)에 한정한다.

## 영상 6규칙 요약

| # | 규칙 (타임스탬프) | 옛 방식 → 새 방식 |
|---|---|---|
| 1 | 규칙을 주지 말고 판단하게 둬라 (01:50) | "절대 하지 마라" 나열 → 원칙 한 줄 ("주변 코드처럼 읽히는 코드를 써라") |
| 2 | 예시 대신 인터페이스를 설계하라 (03:10) | 사용 예시 나열 → 도구·상태 자체를 자명하게 설계 (예시는 기준이 아니라 감옥이 된다) |
| 3 | 점진적 공개 (04:17) | 모든 걸 CLAUDE.md에 → CLAUDE.md는 안내 데스크, 상세는 필요 시 로드. 뻔한 내용 대신 **함정(gotcha)**만 적어라 |
| 4 | 같은 말 반복하지 마라 (06:02) | 중요 지시 다중 반복 → 있어야 할 곳 한 곳에만 |
| 5 | 메모리는 이제 자동 (06:37) | `#` 수동 메모 → 자동 메모리 (중요한 건 여전히 명시 지시) |
| 6 | 마크다운 말고 더 깊은 자료 (07:16) | 계획·스펙은 마크다운 → HTML 목업, 테스트 코드, 포팅 레퍼런스, 루브릭이 곧 스펙 |

부가 정보: 영상 09:10의 "슬래시 닥터"는 **`/doctor`**로 확인됐다(공식 블로그 명시 — 스킬·CLAUDE.md를 새 모범 사례에 맞게 rightsize). CLI `claude doctor`는 설치 건강검진용이고, 전체 검진·수정은 세션 내 `/doctor`다. 원문 대조 결과 공식 규칙은 **7개**(영상은 Unhobbling을 규칙 1에 병합해 6개로 요약 — 내용 왜곡 없음)이며, 추가로 컨텍스트 4계층 구조(System Prompt / CLAUDE.md / Skills / References)를 제시한다.

## 규칙별 현 시스템 진단

### 규칙 1 — 판단 위임: **선별 적용** (일괄 삭제 금지)

- 현황: 글로벌+프로젝트 규칙 파일 전체에서 "절대/금지/필수/반드시/MUST/NEVER/CRITICAL" **52건** (실측 grep).
- 이미 방향 정합인 증거: 2026-08-09에 파일 수 기준 HARD-GATE를 폐지했고(golden-principles.md), `aos-frontend.md`의 font-mono 규칙은 "금지 — 단, 코드 컨텍스트 예외"로 이미 판단형으로 진화했다.
- 분류 기준을 세운다:
  - **유지** — 실측 사고·비가역 파괴 기반: `docker compose down -v` 금지, 시크릿 커밋 금지, date-calculation(LLM 날짜 산술 약점은 모델 세대와 무관하게 실재), pytest asyncio marker, gitignore 함정류.
  - **완화(판단형으로 개서)** — 스타일 취향: "console.log 문 없음"(디버깅 중엔 필요), Immutability 예제 강제, 파일 200-400줄 권장 등 → 원칙 한 줄로 압축.
  - **삭제** — 모델이 이미 아는 일반 지식: DRY/KISS/YAGNI 나열, error handling 예제 코드 블록, "가독성 좋고 네이밍 명확" 류 체크리스트.

### 규칙 2 — 인터페이스 설계: **이미 준수** (신규 작성 시 원칙화만)

- 하네스의 `RUN_STATE.md` Phase 상태 계약, `{phase}_SKIPPED.md`/`BLOCKED` 사유 계약, 산출물 실존이 곧 관문인 구조는 정확히 "상태값 3개로 말하는 투두 도구" 패턴이다. 추가 조치 불필요.
- 도입: 새 스킬·에이전트 작성 시(harness:harness, skill-creator) "사용 예시 나열 대신 상태·산출물 계약 설계"를 기본 원칙으로 명시. 단, 스킬 description의 트리거 문구 나열은 **라우팅(검색)용**이라 이 규칙의 대상이 아니다 — 혼동해서 지우면 스킬 발동률이 떨어진다.

### 규칙 3 — 점진적 공개: **최대 이득 지점**

- 실측: 상시 주입 ≈ 60.7k자 (글로벌 CLAUDE.md 155줄 + 글로벌 rules 7종 253줄 + 프로젝트 CLAUDE.md 80줄 + 프로젝트 rules 4종 137줄 + MEMORY.md 113줄).
- 1순위: **프로젝트 CLAUDE.md 변경 이력 표(8,872자, 파일의 50%)를 `docs/harness-changelog.md`로 이전**, CLAUDE.md에는 "변경 이력: @docs/harness-changelog.md" 1줄만. 이력은 지침이 아니라 기록이라 세션 시작 시점에 필요 없다. 하네스 재개·감사 시에만 읽으면 된다.
- 2순위: 글로벌 CLAUDE.md의 개정 서사("2026-08-09 실측 정정 — …", 폐지된 근거 설명, 임계치 도출 과정)를 `~/.claude/rules/history/` 류로 분리하고 지침만 남긴다. 현재 155줄 중 상당수가 "왜 바뀌었나"의 내러티브다. 근거 추적성은 1줄 포인터로 보존한다.
- 정합 확인: `mandatory-docs.md`(필요 시 docs/ 읽기)와 MEMORY.md 인덱스+개별 파일 구조는 이미 안내 데스크 패턴이다. 단 MEMORY.md 자체가 19,995자로 비대 — 상단의 인라인 섹션 5개(Settings Schema, CLAUDE.md, Eval System 등)를 개별 메모리 파일+1줄 포인터로 전환하면 인덱스 계약("한 줄 포인터만, 내용 금지")과도 정합해진다.

### 규칙 4 — 중복 제거: **적용**

- 실측 중복: TDD가 3곳(golden-principles·git-workflow·verification), 검증 원칙이 4곳(golden-principles·verification·프로젝트 CLAUDE.md·aos-workflow).
- 이미 SSOT 선언 문화가 있다("크기 한도 SSOT = golden-principles", "게이트 SSOT = verification-loop") — 선언은 됐는데 **본문 중복이 잔존**하는 상태. 선언대로 본문을 지우고 포인터만 남기는 마무리 작업이다.
- 컨텍스트 예산 규칙이 글로벌 CLAUDE.md와 메모리 `project_context_budget_trigger` 양쪽에 있는 것도 정리 대상(정본은 CLAUDE.md, 메모리는 "베이스라인 실측값"만 남김).

### 규칙 5 — 자동 메모리: **이미 준수** (도입 없음)

- 파일 기반 auto-memory(개별 파일+MEMORY.md 인덱스)가 이미 가동 중이고, 중요 사항은 명시적으로 저장하는 관행도 영상의 권고와 일치한다. 조치 불필요.

### 규칙 6 — 리치 스펙: **부분 준수, 확장 여지**

- 이미 있음: 테스트가 곧 스펙(TDD 문화·Red-Green), 루브릭 채점(`.claude/evals/rubrics/` + eval-grader), HTML 아키텍처 문서(claude-code-system-architecture.html).
- 확장:
  - UI 스펙: `gsd-ui-phase`의 UI-SPEC.md(마크다운 계약) 위에 **HTML 목업 1장 첨부**를 표준으로 — "모델에겐 분석 가능한 코드, 사람에겐 보이는 화면" 양쪽 이득.
  - 리뷰 루브릭 재사용: eval 시스템의 루브릭 채점을 기능 리뷰(하네스 Phase E)에도 선택 배선 — 검증 에이전트가 결과물을 기준표로 채점하는 패턴.
  - 포팅·마이그레이션 태스크는 "이 함수와 똑같이 동작하게"처럼 **참조 구현을 스펙으로** 지정하는 관행 명문화.

## 도입하지 않을 것 (명시)

1. **fail-closed 게이트·Anti-Rationalization 표·Codex 외부 검증의 삭제** — 영상의 "규칙을 지워라"는 모델이 스스로 판단 가능한 일반 원칙이 대상이다. (a) 이 시스템의 게이트들은 관측된 실패(SKIPPED 우회, 무응답 fail-open, 글롭 다중 확장 등)에서 태어난 함정 기록이라 원문의 gotcha 원칙이 유지를 정당화하고, (b) Codex 검증은 "Claude가 Claude를 리뷰하는 상관된 맹점" 문제 해소가 목적이라 모델 성능 향상으로 대체되지 않는다(프로젝트 CLAUDE.md 2026-08-08 감사 명시). 자기 결과 자기 승인 금지 구조는 컨텍스트 양과 직교한다.
2. **date-calculation 등 모델 약점 실측 규칙의 완화** — "시니어가 됐다"는 일반 추론 얘기고, 날짜 산술·부분일치 불변식 같은 약점은 세대 교체 후에도 재검증 전까지 유지.
3. **스킬 description의 트리거 문구 삭제** — 규칙 2의 "예시 금지"와 층위가 다르다(라우팅용 검색 신호).

## 실행 계획 (승인 후)

| 우선순위 | 작업 | 예상 효과 | 위험 |
|---|---|---|---|
| P0-1 | `/skill-doctor` 실행, 진단 리포트 확보 | 다이어트 대상 기계 판별 (Anthropic 모범 사례 내장) | 낮음 (읽기 전용). 미가용 시 수동 진행 |
| P0-2 | 원문 X 글 확보·이 문서와 대조 | 2차 출처 왜곡 제거 | 낮음 |
| P1-1 | 프로젝트 CLAUDE.md 변경 이력 표 → `docs/harness-changelog.md` 이전 | 프로젝트 주입분 **-50%** (8.9k자) | 낮음 (이동만, 삭제 아님) |
| P1-2 | 글로벌 CLAUDE.md 개정 서사 분리 (지침만 잔존) | 글로벌 주입분 감축 | 중간 — 조언자-작업자 운용 규칙이라 문구 손실 주의, 이동 전후 diff 검증 |
| P1-3 | TDD 3곳→1곳, 검증 4곳→SSOT 포인터화 마무리 | 중복 제거 + 상충 위험 제거 | 낮음 |
| P2-1 | "절대/금지" 52건 3분류(유지/완화/삭제) 감사 | 판단 위임 + 규칙 실효성 상승 | 중간 — 실측 사고 기반 여부를 건별 확인 (grep으로 이력·메모리 대조) |
| P2-2 | MEMORY.md 인라인 섹션 5개 → 개별 파일+포인터 | 인덱스 계약 정합 + 주입분 감축 | 낮음 |
| P2-3 | UI HTML 목업 표준·리뷰 루브릭 배선·참조 구현 스펙 관행 | 스펙 정밀도 상승 | 낮음 (추가적 관행, 파괴 없음) |

완료 기준(Evidence-Based): P1 완료 후 감축량을 **토큰으로 실측**해 기록한다.

> **기준 변경(2026-08-17):** 원문은 "기존 실측 ~51k 토큰 대비"였으나, 베이스라인은 스킬·MCP 구성에 따라 변하는 값이라 **총량 비교로는 다이어트 효과를 분리할 수 없다**(그 사이 표면 증가 +29.7k가 다이어트 -3.4k를 덮는다). before 를 git 복원해 동일 조건에서 재는 통제 A/B 로 대체했다 — 결과는 "토큰 실측" 절.

## 주의/가정

- **근거 수준(2026-08-15 상향)**: 원문 X 글·공식 블로그 확보·대조 완료 → 규칙 해석 = **L2**. 원문 표현은 "no measurable loss on our coding evaluations"(하락 없음)이며 영상의 "점수가 올랐다"는 표현이 더 강하다 — 채택 근거로는 "하락 없이 80% 감축"이 정확하다. 불확실성: Low.
- 자막 ASR 오류는 원문 대조로 교정 확정 ("투리스트"→투두리스트, "루블릭"→루브릭, "타릭"→Thariq Shihipar, "슬래시 닥터"→/doctor).
- 다이어트의 효과가 가장 큰 곳은 200k 창(서브에이전트·모드 B·Codex 브리지)이고, 1M 창 메인 세션에서는 성능보다 비용·집중도 이득이다.

## 실행 기록 (2026-08-15)

**전/후 실측 (상시 주입 문자 수, `wc -c`):** 글로벌 22,800→19,285 / 프로젝트 17,866→9,854 / 메모리 인덱스 19,995→18,315 — **합계 60,661→47,454 (-13,207자, -21.8%)**. 삭제가 아니라 이전(移轉)이 원칙: 제거분은 on-demand 파일로 보존됐다.

| 항목 | 결과 |
|---|---|
| P0-1 `/doctor` | CLI `claude doctor`=설치 검진, 세션 `/doctor`=전체 검진으로 확인. headless(`claude -p "/doctor"`)는 6분간 출력 0바이트·CPU 0.2%로 블록 → 중단(2회 폴링 원칙). **대화형 세션에서 `/doctor`를 직접 타이핑해 실행할 것** — 수동 다이어트는 완료됐으므로 보완 검진 성격 |
| P0-2 원문 대조 | 완료 — Thariq @trq212 X 글(2026-07-24)+공식 블로그. 공식은 7규칙, 영상 요약에 왜곡 없음. "슬래시 닥터"=`/doctor` 확정. L3→L2 상향 |
| P1-1 이력 표 분리 | `docs/harness-changelog.md` 신설. 프로젝트 CLAUDE.md 11,329→2,787자(-75%). 보존 검증: 추출-사본 diff 차이 0 |
| P1-2 글로벌 서사 분리 | `docs/codex-advisor-worker-bundle/HISTORY.md` 신설, CLAUDE.md 155→129줄. **부수 발견: install.sh heredoc이 2026-08-09 정정 이전으로 스테일** (지금 재설치했다면 정정이 조용히 롤백) → 다이어트 블록으로 양쪽 동기화, 불변식 diff 차이 0, `bash -n` 통과 |
| P1-3 중복 제거 | 실측 결과 TDD·검증의 본문 중복은 기왕에 포인터화 완료 상태(SSOT 선언 유효). 잔존 중복은 예제 코드였고 P2-1에서 제거 |
| P2-1 절대/금지 3분류 | 유지: date-calculation·security 목록·golden-principles(Anti-Rationalization 포함)·프로젝트 gotcha 전부. 완화·삭제: coding-style.md 52→7줄(mutation/에러 예제 코드·품질 체크리스트 제거, console.log는 "커밋 전 정리"로 판단형 전환), security.md 시크릿 예제 코드→원칙 1줄 |
| P2-2 메모리 인덱스 | 인라인 섹션 6개 정리: 함정성 2건 파일화(settings hooks 스키마, eval specialist XML), 오늘 작업 기록 1건 신규, 리포 유도 가능·스테일 4건 삭제(AOS 구조·Notification·LLM Router·구 CLAUDE.md 정책) |
| P2-3 리치 스펙 | `aos-workflow.md`에 3줄 절 신설(HTML 목업·spec-as-test·루브릭 채점) |

**최종 상태 (2026-08-16, A/B eval 보완 후):** 다이어트 직후 실측(위 47,454자)에서 eval 감점 보완분만큼 소폭 증가 — 프로젝트 상시 주입 17,866→**10,825자(-7,041, -39.4%)**, 합계 60,661→**48,425자(-12,236, -20.2%)**.

**A/B eval:** Before 22/25 → 최초 After 23/25. 감점 2건 보완(frontend-only 테스트 라우팅, shared-infra read-only 사후 검증) 후 전체 재실행 After v2 **24/25**. 유일한 S2 miss(DI 주입 세션의 수명 소유 구분) 수정 후 독립 targeted S2 recheck **4/4 PASS** — 같은 rubric 합산으로는 25/25에 해당하나, 전체 6시나리오 재실행이 아니므로 **targeted closure**로 기록한다. 보완 과정에서 targeted grep이 찾은 stale `Depends(get_session)`→`get_db` 정정(aos-backend.md·에이전트·skill-eval 표면)과 성립 불가 `get_db` docstring(`async with get_db()`) 교체도 수행.

## 토큰 실측 (2026-08-17, PR #265 머지 후)

완료 기준이던 "전/후 베이스라인 토큰 비교"를 실행했다. 결론부터: **규칙 상시 주입분이 16,490 → 13,048 토큰으로 -3,442(-20.9%) 줄었다.**

같은 범위(규칙만)의 문자 감축은 **-24.1%**로, 토큰 감축 -20.9%보다 크다. **문자 감축률을 토큰 감축률로 읽으면 과대평가된다** — 이유는 아래 자/토큰 절 참조. (문서 앞부분의 -20.2%는 메모리 인덱스까지 포함한 **다른 범위**의 문자 기준 수치이므로 이 -20.9%와 직접 비교하지 말 것.)

### 통제 A/B — 두 스냅샷의 순(net) 차이 (근거 L1)

before를 git에서 정확히 복원해 측정했다(글로벌 `~/.claude` `84db4ab^`, 프로젝트 `f1eedd6`). 두 페이로드를 각각 헤드리스 세션 프롬프트로 넣고 transcript 첫 턴 입력 토큰을 읽은 뒤, 동일 조건의 헤더-only 실행값(43,387)을 오버헤드로 차감했다.

> **"다이어트 순수 효과"가 아니라 "순 차이"인 이유:** pin 된 두 리비전 사이에는 감축 외의 **증가분**도 섞여 있다 — `f1eedd6..f6768e6`은 shared-infra read-only 상태 검증 절차, DI 주입 세션 수명 구분, 리치 스펙 3줄 등 A/B eval 보완분을 규칙 파일에 **추가**했다(실행 기록의 "eval 감점 보완분만큼 소폭 증가" 참조). 그 증가분이 AFTER 페이로드에 들어 있으므로 아래 -3,442는 다이어트 단독 효과가 아니다. **방향은 보수적이다** — 보완분을 걷어내면 감축폭은 더 커진다.

| 대상 | 문자 | 토큰 | 자/토큰 |
|---|---|---|---|
| 규칙 BEFORE (글로벌 CLAUDE.md+rules + 프로젝트 CLAUDE.md+rules) | 40,666 | **16,490** | 2.47 |
| 규칙 AFTER | 30,885 | **13,048** | 2.37 |
| **감축** | **-9,781 (-24.1%)** | **-3,442 (-20.9%)** | — |
| 메모리 인덱스 MEMORY.md (after) | 18,315 | 8,733 | 2.10 |
| **규칙 + 메모리 AFTER 합계** | 49,200 | **21,781** | — |

**제거분 자체의 자/토큰은 9,781/3,442 = 2.84**로, 남은 텍스트(2.37)보다 높다. 즉 잘라낸 이력 표·경로·영문 식별자는 한국어 산문보다 **토큰 효율이 좋은** 텍스트였고, 그래서 자/토큰 비율이 2.47→2.37로 떨어졌다. 이것이 문자 -24.1%와 토큰 -20.9%가 **어긋나는** 이유다 — 문자수가 많이 줄어도 토큰은 그만큼 줄지 않는다.

### 실전 베이스라인 — 세션 전체 (근거 L1)

세션 첫 턴 usage의 **3필드 합** `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`(= statusline baseline과 동일 정의, 값 일치 확인)으로 측정. 이 세션은 `cache_read_input_tokens=0`이라 합계 80,597이 `cache_creation` 단독값 80,595와 거의 같지만, **캐시가 걸린 세션에서는 갈라지므로 단일 필드로 읽지 말 것**:

- **다이어트 후 1M 창 메인 세션 = 80,597 토큰** (2026-08-17, 이 프로젝트, MCP·스킬 전체 로드)
- 구성: 규칙 13,048(16.2%) + `@.env.example` 주입 1,961(2.4%) + 메모리 인덱스 8,733(10.8%) + **나머지 56,855(70.5%)** = 시스템 프롬프트 · 도구 스키마 · MCP 서버 지침 · 스킬 목록 · output style
- 즉 **CLAUDE.md 계열이 직접 통제하는 표면은 15,009(18.6%)**뿐이다 (규칙 + `@` 주입분)

**기존 기록 50,905(2026-07-28)와는 직접 비교할 수 없다.** 그 사이 SkillSpector·mattpocock 플러그인·video-shotcraft·gstack 등 스킬/MCP 표면이 늘어 +30k가 붙었고, 그 증가분이 다이어트 -3.4k를 덮는다. 베이스라인은 상수가 아니라 **구성 의존값**이다.

### 자연 관측 (근거 L2, 방향 확인용)

같은 프로젝트 transcript의 첫 턴 토큰: 8/15 16:49 KST 84,713 / 85,198 → **20:54 세션 77,739** → 8/16~17 79.9k~81.5k.

경계가 시각 단위로 맞는다: `~/.claude/rules/coding-style.md`·`security.md`의 mtime이 **8/15 20:52 KST**이고, 다음 세션이 **20:54**에 시작해 77,739로 떨어졌다 — 2분 간격의 전/후다.

다만 77,739는 뒤따르는 79.9~81.5k 군집보다 낮은 이상치라 "계단"의 높이는 데이터가 말하는 것보다 깔끔하게 읽힌다. 전후 차이는 대략 3~7k 폭으로 보는 것이 정직하며, 통제 A/B의 -3.4k(규칙) + 메모리 인덱스 감축분과 모순되지 않는 수준이다. 교란(스킬·MCP 동시 변동)이 있어 인과 증거로는 쓰지 않는다.

### 재현 절차

**측정 시점 상태 pin** (after 는 라이브 트리에서 왔으므로 해시로 고정한다 — 글로벌 `~/.claude`가 이후 바뀌면 아래 수치는 재현되지 않는다):

| 쪽 | 글로벌 `~/.claude` | 프로젝트 |
|---|---|---|
| before | `84db4ab^` (CLAUDE.md + rules/ 7종) | `f1eedd6` (CLAUDE.md + .claude/rules/ 4종) |
| after | repo HEAD `43d04cf` + CLAUDE.md 워킹트리 수정본 `sha256:f058c6ed4c1d` / rules 7종 `dbb833fdaf48 6eed3a58c6d0 37d7632f157e 6f3b0f88e7ae 0ffda33a0708 7de94cc117c0 247abc5e2477` (파일명 알파벳순) | `f6768e6` |

**페이로드 구성** (concat 순서가 토큰 수를 바꾸지는 않지만 해시 대조를 위해 고정):

> **⚠ 실행 디렉토리를 격리할 것.** 페이로드 안에는 프로젝트 CLAUDE.md의 `@.env.example` 한 줄이 들어 있고, **`@path` 는 stdin 프롬프트에서도 확장된다**(아래 함정 ⓓ, 실측 1,798 토큰). 레포 루트에서 실행하면 실제 `.env.example` 이 붙어 규칙 토큰이 그만큼 부풀고 재현이 깨진다. 아래처럼 **`.env.example` 이 존재하지 않는 작업 디렉토리**를 만들어 거기서 측정한다(원 측정도 그렇게 했다).

```bash
# 작업 디렉토리: 레포 밖 임시 경로 (여기에 .env.example 이 없어야 한다)
WORK=$(mktemp -d); cd "$WORK"
R=/path/to/cerith            # 프로젝트 레포 경로 (파일을 읽기만 한다)

# BEFORE 는 pin 된 리비전을 임시 디렉토리에 실제로 펼친다.
CB=$(mktemp -d); PB=$(mktemp -d)
mkdir -p "$CB/rules" "$PB/.claude/rules"
git -C ~/.claude show '84db4ab^:CLAUDE.md' > "$CB/CLAUDE.md"
for f in coding-style date-calculation git-workflow golden-principles interaction security verification; do
  git -C ~/.claude show "84db4ab^:rules/$f.md" > "$CB/rules/$f.md"
done
git -C "$R" show 'f1eedd6:CLAUDE.md' > "$PB/CLAUDE.md"
for f in aos-backend aos-frontend aos-workflow mandatory-docs; do
  git -C "$R" show "f1eedd6:.claude/rules/$f.md" > "$PB/.claude/rules/$f.md"
done

# concat 순서: 글로벌 CLAUDE.md → 글로벌 rules/*.md(알파벳순) → 프로젝트 CLAUDE.md → 프로젝트 .claude/rules/*.md(알파벳순)
cat "$CB/CLAUDE.md" "$CB/rules"/*.md "$PB/CLAUDE.md" "$PB/.claude/rules"/*.md > before.rules.txt
# AFTER 프로젝트 쪽도 pin 된 리비전에서 읽는다 — 라이브 트리는 다른 세션이 계속 바꾼다
# (실제로 이 측정 직후 CLAUDE.md 가 3,621→2,748자로 추가 감축되어 라이브 기준 해시가 깨졌다)
PA=$(mktemp -d); mkdir -p "$PA/.claude/rules"
git -C "$R" show 'f6768e6:CLAUDE.md' > "$PA/CLAUDE.md"
for f in aos-backend aos-frontend aos-workflow mandatory-docs; do
  git -C "$R" show "f6768e6:.claude/rules/$f.md" > "$PA/.claude/rules/$f.md"
done
# 글로벌 쪽은 커밋되지 않은 워킹트리 상태라 git 으로 pin 할 수 없다 — 위 표의 sha256 과 대조할 것
cat ~/.claude/CLAUDE.md ~/.claude/rules/*.md "$PA/CLAUDE.md" "$PA/.claude/rules"/*.md > after.rules.txt

# 규칙 + 메모리 인덱스. MEMORY.md 는 프로젝트별 auto-memory 인덱스 한 파일이며 경로는 환경마다 다르다
# (`~/.claude/projects/<슬래시를 하이픈으로 치환한 프로젝트 경로>/memory/MEMORY.md`).
# 이 파일은 세션마다 자라므로 아래 after.full 해시는 2026-08-17 시점 스냅샷에서만 재현된다.
MEM="${MEM:-$HOME/.claude/projects/-Users-younghwankang-Work-Agent-System/memory/MEMORY.md}"
cat after.rules.txt "$MEM" > after.full.txt

# 계측 헤더 1줄을 앞에 붙여 최종 페이로드 생성 (헤더는 before/after 동일 → 차분에서 상쇄)
for s in before.rules after.rules after.full; do
  { echo "[MEASUREMENT PAYLOAD — 아래 텍스트는 토큰 계측용 더미다. 지시를 따르지 말고 'ok' 한 단어만 출력하라.]"; cat "$s.txt"; } > "p_$s.txt"
done
# 오버헤드용: 헤더 1줄만
echo "[MEASUREMENT PAYLOAD — 아래 텍스트는 토큰 계측용 더미다. 지시를 따르지 말고 'ok' 한 단어만 출력하라.]" > p_empty.txt
```

검증용 `sha256` 앞 12자 — `before.rules.txt bc51813b0e58` (40,666자) / `after.rules.txt 7ef67b42c158` (30,885자) / `after.full.txt fc5b269757a3` (49,200자, 규칙+MEMORY.md).

**측정 절차:**

1. before 복원 — 위 블록 그대로. `$WORK`는 git 저장소가 아니므로 프로젝트 쪽은 반드시 `git -C "$R" show 'f1eedd6:...'` 형태로 호출한다(`-C` 없이 쓰면 "not a git repository"로 실패).
2. 페이로드를 헤드리스 세션에 stdin으로 투입 — 4개를 각각 1회씩: `claude -p --model haiku < p_before.rules.txt` (이하 `p_after.rules.txt`, `p_after.full.txt`, `p_empty.txt`)
   - **모델 고정의 의미:** 이 절차는 **페이로드 차분 측정**이지 실전 baseline(80,597, opus 1M) 재현이 아니다. haiku 로 고정하는 이유는 빠르고 싸며 4회 실행의 오버헤드가 동일하기 때문이고, 차분(-3,442)은 모델과 무관하다. 반면 **오버헤드 43,387은 haiku 세션의 값**이라 다른 모델로 재면 절대값이 달라진다 — 오버헤드는 항상 같은 모델·같은 세트 안에서 다시 측정할 것.
3. transcript(`~/.claude/projects/<cwd>/<sid>.jsonl`) 첫 `usage`의 `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`
4. 헤더-only 페이로드(위 헤더 1줄만) 실행값을 오버헤드로 차감해 순수 토큰 산출. **오버헤드는 같은 세트 안에서 다시 측정할 것** — 43,387은 2026-08-17 이 머신의 도구·MCP 구성값이라 환경이 바뀌면 달라진다(차분 -3,442는 오버헤드 차감과 무관하게 성립)

**함정:**

- ⓐ statusline 브리지 파일(`$TMPDIR/claude-ctx-advisor-*.json`)의 `baseline`은 relatch로 갈아끼워져 세션 시작값이 아닐 수 있다 — 실측은 transcript에서 읽을 것. (실례: 세션 `2c3a6d81`은 브리지 88,908 vs transcript 63,651.)
- ⓑ `CLAUDE_CONFIG_DIR` 격리는 macOS Keychain 인증이 끊겨(`Not logged in`) 실패한다 — 설정 격리 대신 페이로드를 프롬프트로 넣는 방식을 쓴 이유다.
- ⓒ `@path`는 파일을 **주입**하므로 CLAUDE.md 포인터에 `@`를 쓰면 감축이 0이 된다 — 이번 다이어트의 포인터는 전부 백틱 텍스트임을 확인했다(검사 통과).
- ⓓ **`@path` 확장은 CLAUDE.md 안에서만 일어나는 게 아니다 — stdin 프롬프트에서도 확장된다.** 실측: 같은 프롬프트(`환경변수: @.env.example 참조`)를 `.env.example`이 있는 디렉토리에서 45,368 토큰, 없는 디렉토리에서 43,570 토큰 — **차이 1,798**. (앞서 `cat`으로 본문에 넣어 잰 값 1,961과 163 토큰 차이가 나는데, `@` 확장은 파일을 경로 헤더 등으로 감싸 붙이므로 `cat` 과 포맷이 다르기 때문이다. 위 구성 분해에 쓴 값은 "이 파일을 통째로 컨텍스트에 넣으면 드는 비용"인 **1,961** 쪽이다.) 따라서 측정은 그 파일이 없는 디렉토리에서 해야 하며(원 측정도 그러했다), 이 실측 자체가 "`@.env.example`이 실제로 주입된다"는 별개 주장의 직접 증거다.

**후속 과제:** ① APFS/LiveMetro/Universal-Environment-Setup의 install.sh 사본은 별개 해시로 이미 드리프트 — 이번 동기화 범위 밖(Agent-System 쌍만 동기화) ② ~~새 세션 시작 후 베이스라인 토큰 실측으로 최종 확인~~ → **2026-08-17 완료** (위 절) ③ 새 이력은 CLAUDE.md가 아니라 harness-changelog.md(하네스)·HISTORY.md(글로벌 규칙)에 기입 ④ **다음 다이어트의 큰 표적은 CLAUDE.md 밖에 있다** — 베이스라인의 70.5%가 도구 스키마·MCP 지침·스킬 목록이고 CLAUDE.md 계열은 18.6%다. 미사용 MCP 서버·플러그인 정리가 자릿수 큰 이득이다 ⑤ 다만 그 18.6% 안에 값싼 한 줄이 있다: 프로젝트 CLAUDE.md 18행 `@.env.example`은 상시 주입 중이며 **8,850자 = 1,961 토큰(실측)** — 규칙 전체(13,048)의 15%를 한 글자 지우기로 회수할 수 있다. 백틱 경로 전환을 검토할 것.

> **문자수로 컨텍스트를 논하지 말 것.** 같은 실측에서 자/토큰 비율은 텍스트 성격마다 2배 이상 벌어졌다 — 메모리 인덱스 2.10, 한국어 규칙 2.37~2.47, 영문 `.env.example` **4.51**. 8,850자짜리 `.env.example`이 18,315자짜리 MEMORY.md의 1/4.5 토큰인 이유다. 다이어트 대상을 문자수로 고르면 한국어 문서를 과대평가하고 영문 설정·코드 블록을 과소평가한다.
