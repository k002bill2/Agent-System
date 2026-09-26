# BRIEF — 프론트엔드 디자인 금지 패턴 규칙 초안 (Agent-System)

- 책임 역할: Designer / 실행 환경: Orca + Claude Code (`hermes-claude-orca --role designer`)
- 발행: Jarvis, 2026-09-27
- 대상 worktree: `/Users/younghwankang/orca/workspaces/Agent-System/design-defaults-opus55` (브랜치 `k002bill2/design-defaults-opus55`, base `main`)

## 1. 목적
Claude Opus 5.5 공식 프롬프팅 가이드는 디자인 지시가 없는 프론트엔드 작업에서 모델이 몇 가지 기본 스타일로 회귀하며,
"AI 느낌 피하기" 같은 일반 지시는 한 기본값을 다른 기본값으로 바꿀 뿐이라고 한다. **피할 패턴을 구체적으로 나열**해야 효과가 있다.
이 저장소에서 이후 Claude Code 작업이 로드할 **금지 패턴 + 대체 기준 규칙 초안**을 만든다. 규칙 적용(`.claude/rules/` 배치·CLAUDE.md 수정)은 이번 범위가 아니다 — 영환님 검토 후 Developer가 한다.

<pasted_content id="e452">
Asked for frontend work without design direction, Claude Opus 5.5 falls back on a few default styles, and a general instruction such as "avoid a generic AI look" mostly swaps one default for another. It responds well to instructions that name specific patterns to avoid, as in the following example. Work iteratively: check which styles the first result used instead, and extend the list if needed.

Example: "Output a vanilla HTML/CSS personal website with placeholder data. Do not use a cream or off-white background, italic accent words in headlines, numbered "01/02/03" section labels, monospace labels, or pill-shaped buttons."
</pasted_content id="e452">

## 2. 프로젝트 맥락
AOS 운영 대시보드. 프론트엔드는 `src/dashboard/` (React + Vite + Zustand). 백엔드·인프라 파일은 범위 밖. 기존 규칙 `.claude/rules/aos-frontend.md`를 먼저 읽을 것.

사용자(영환님) 선호: 엔터프라이즈 투자·자산운용 제품 경력. 절제된 실무형 UI, 명확한 정보 계층, 높은 정보 밀도, 반응형, 반복 개선. 장식적이고 "AI가 만든 것 같은" 결과물을 싫어한다.

## 3. 해야 할 일
1. 현재 프론트엔드의 디자인 소스를 조사한다: 테마/토큰 정의(Tailwind config·CSS 변수·theme 파일), 공용 컴포넌트, 대표 화면 3~5개. 조사한 파일 경로를 기록한다.
2. **금지 패턴 목록**(8~15개)을 만든다. 각 항목은:
   - 구체적 패턴(예: 크림/오프화이트 배경, 헤드라인 이탤릭 강조어, "01/02/03" 섹션 번호 라벨, 장식용 monospace 라벨, pill 버튼 남용, 보라-파랑 그라데이션, 글래스모피즘, 과한 카드 그림자, 이모지 아이콘, 의미 없는 hero 일러스트 등 — 가이드 예시와 이 저장소 맥락에서 골라 **추가·삭제** 가능)
   - 왜 이 제품에 맞지 않는지 1줄
   - **현재 코드에 이미 존재하는지**: 존재하면 파일:라인 근거(grep 결과). 없으면 "현재 없음".
   - 기존 코드에 있는 패턴을 금지할 경우, 이것이 신규 작업 규칙인지 기존 화면 수정 대상인지 구분(기존 화면 수정은 제안만, 수행 금지).
3. **대체 기준(Do 목록)**: 이 저장소의 실제 토큰·컴포넌트 이름을 인용해 "대신 이것을 쓴다"를 적는다(색·타이포·간격·버튼·카드·표/수치 정렬·빈/로딩/오류 상태). 저장소에 없는 토큰을 발명하지 않는다 — 없으면 "토큰 부재, 신설 필요 여부 확인 필요"로 표기.
4. 규칙 파일 초안은 Claude Code가 읽기 좋게 **짧게**(목표 60줄 이내) 쓴다. 상세 근거는 별도 REPORT에 둔다.
5. 이후 적용 단계용 제안 1문단: `.claude/rules/frontend-design-defaults.md`로 둘지, 기존 규칙 파일에 병합할지, CLAUDE.md 포인터 1줄 문안.

## 4. 산출물 (쓰기 경로는 `docs/design-rules/` 한정)
- `docs/design-rules/frontend-design-defaults.md` — 규칙 초안(금지 목록 + 대체 기준)
- `docs/design-rules/REPORT-opus55-design-defaults.md` — 조사 파일 목록, 항목별 근거(파일:라인), 기존 코드 위반 현황, 적용 제안, 확인 필요
- `docs/design-rules/PROGRESS.md` — 체크리스트(아래 6절 항목), 진행하며 갱신
- 이 BRIEF 파일도 함께 커밋

## 5. 금지 사항
- `docs/design-rules/` 밖의 파일 생성·수정 금지(소스 코드·`.claude/`·CLAUDE.md·설정·lockfile 포함). 실험 편집도 금지.
- 패키지 설치, dev 서버 실행, 네트워크 호출, git push, 브랜치 삭제 금지.
- 커밋은 경로 지정으로만: `git add docs/design-rules && git commit -m "docs(design-rules): ..." -- docs/design-rules`

## 6. 완료 조건 (PROGRESS.md 체크리스트)
- [ ] 디자인 소스 조사 및 경로 기록
- [ ] 금지 패턴 8~15개, 항목별 이유·현황 근거
- [ ] 대체 기준(실제 토큰/컴포넌트 인용)
- [ ] 규칙 초안 60줄 이내
- [ ] REPORT 작성(적용 제안·확인 필요 포함)
- [ ] `git diff --name-only main..HEAD | grep -vc '^docs/design-rules/'` 결과가 0
- [ ] 로컬 커밋 완료, `git status --short` 깨끗함

턴 예산: 남은 턴이 10 이하가 되면 새 조사를 멈추고 REPORT·PROGRESS를 현재 상태로 마무리해 커밋한다.

## 7. 최종 메시지 형식
변경 파일 목록 / 금지 패턴 수와 그중 현재 코드에 이미 있는 수 / 실행한 검증 명령과 결과 / 확인 필요 / Jarvis에게 필요한 결정.
