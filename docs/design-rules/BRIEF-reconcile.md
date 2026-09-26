# BRIEF — 규칙 간 정리 (Agent-System)
- 책임 역할: Developer / 실행 환경: Orca + Claude Code · 발행 Jarvis 2026-09-27 · 영환님 승인 방향 반영

## 할 일
1. `.claude/rules/aos-frontend.md` 17행 `font-mono` 예외 목록에 **ID·브랜치명**을 추가한다.
   목표 문장: "`font-mono` 일반 UI에서 사용 금지 — 단, 코드 diff, 터미널 로그, YAML/JSON 에디터, `<pre>`/`<code>` 블록 등 코드 컨텍스트와 ID·브랜치명 표시는 예외"
2. `.claude/rules/frontend-design-defaults.md` 10번 문장이 여전히 `aos-frontend.md`를 정본으로 가리키는지 확인만 한다(수정 불필요하면 그대로).
3. CLAUDE.md가 가리키는 `docs/harness-changelog.md`에 이번 변경 이력 1건을 **그 파일의 기존 형식 그대로** 추가한다:
   2026-09-27 · 경로 스코프 규칙 `.claude/rules/frontend-design-defaults.md` 추가(`paths: src/dashboard/**`) + `aos-frontend.md` font-mono 예외에 ID·브랜치명 추가 · 근거 `docs/design-rules/REPORT-opus55-design-defaults.md`.
지정 파일: `.claude/rules/aos-frontend.md`, `docs/harness-changelog.md`

## 공통 규칙
- 규칙의 금지·대체 항목 자체는 바꾸지 않는다. 아래 지정 문구만 고친다.
- 지정 파일 외 수정 금지(`src/`·설정·lockfile 포함). 지정 외 모순을 추가로 발견하면 고치지 말고 최종 메시지에 보고.
- 패키지 설치·빌드·dev 서버·네트워크 호출·push·main 병합 금지.
- `docs/design-rules/PROGRESS-reconcile.md`에 아래 단계 체크리스트를 만들고 진행하며 체크한다.
- 마지막에 경로 지정 커밋 1회: `git add <수정 파일들> docs/design-rules && git commit -m "docs(claude): reconcile design-defaults rule with existing rules" -- <수정 파일들> docs/design-rules`
- 검증: `git diff --name-only HEAD~1..HEAD` 가 지정 파일 + docs/design-rules/* 뿐인지, `git status --short` 가 비었는지.

## 최종 메시지
수정 파일별 변경 전/후 문장 / 커밋 해시 / 검증 출력 / 추가로 발견한 모순(없으면 "없음").
