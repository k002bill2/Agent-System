# BRIEF — 디자인 기본값 규칙 적용 (Agent-System)

- 책임 역할: Developer / 실행 환경: Orca + Claude Code (`hermes-claude-orca --role developer`)
- 발행: Jarvis, 2026-09-27 · 선행: Designer 초안 커밋 완료(이 브랜치 `docs/design-rules/`)
- 대상 worktree: `/Users/younghwankang/orca/workspaces/Agent-System/design-defaults-opus55` (브랜치 `k002bill2/design-defaults-opus55`)

## 목적
Designer가 만든 규칙 초안 `docs/design-rules/frontend-design-defaults.md`를 Claude Code가 실제로 로드하는 **경로 스코프 프로젝트 규칙**으로 배치한다. 규칙 내용(금지·대체 항목)은 바꾸지 않는다 — 표현 정리만 허용.

## 확인된 사실 (Claude Code 공식 문서 https://code.claude.com/docs/en/memory)
- `.claude/rules/*.md`는 자동 발견된다. `paths` frontmatter가 없으면 세션 시작 시 항상 로드, 있으면 **일치하는 파일을 Read할 때** 로드된다.
- `paths`는 YAML 리스트 glob. 경로는 프로젝트 루트 기준.

## 할 일
1. `git mv docs/design-rules/frontend-design-defaults.md .claude/rules/frontend-design-defaults.md`
2. 파일 맨 앞에 frontmatter 추가:
```
---
paths:
  - "src/dashboard/**"
---
```
3. 제목의 "초안"/"적용 전 검토용" 표기를 제거하고, 본문의 REPORT 근거 경로 `docs/design-rules/REPORT-opus55-design-defaults.md`가 그대로 유효한지 확인한다.
4. CLAUDE.md 의 `## 하네스: AOS 기능 개발` 절(48행 부근) 끝에 1줄 추가: `- 프론트엔드 시각 기본값(금지 패턴·대체 기준): .claude/rules/frontend-design-defaults.md — src/dashboard 파일 작업 시 자동 로드, 디자인 지시 없는 UI 작업에 적용`
5. `font-mono` 조항은 `.claude/rules/aos-frontend.md` 가 정본이면 새 파일에서는 참조만 하도록 문구를 맞춘다(REPORT 5절). 두 규칙 파일 사이에 모순 문장이 없는지 확인한다.
6. `docs/design-rules/REPORT-opus55-design-defaults.md` 맨 위에 한 줄 추가: `> 적용됨: 규칙 본문은 .claude/rules/frontend-design-defaults.md 로 이동(2026-09-27).`
7. 검증(결과를 최종 메시지에 그대로 적는다):
   - `head -8 .claude/rules/frontend-design-defaults.md` (frontmatter 확인)
   - `python3 -c "import sys;t=open('.claude/rules/frontend-design-defaults.md').read();assert t.startswith('---\n');print(t.split('---')[1])"`
   - `wc -l .claude/rules/frontend-design-defaults.md CLAUDE.md` (규칙 70줄 이하, CLAUDE.md 증가 3줄 이하)
   - `git diff --name-only main..HEAD` — 허용 파일: `.claude/rules/frontend-design-defaults.md`, `CLAUDE.md`, `docs/design-rules/*`
8. 경로 지정 커밋: `git add -A .claude/rules/frontend-design-defaults.md CLAUDE.md docs/design-rules && git commit -m "chore(claude): apply frontend design defaults as path-scoped rule" -- .claude/rules/frontend-design-defaults.md CLAUDE.md docs/design-rules`
9. `git status --short` 가 비었는지 확인.

## 금지
- `src/`·설정·lockfile·기존 다른 규칙 파일 수정 금지(모순을 발견하면 수정하지 말고 보고).
- 패키지 설치·dev 서버·빌드·네트워크 호출·push·main 병합 금지.

## 진행 기록
`docs/design-rules/PROGRESS-apply.md`에 위 1~9단계 체크리스트를 만들고 진행하며 체크한다(커밋 대상 포함).

## 최종 메시지
변경 파일 / 커밋 해시 / 7단계 검증 출력 / 발견한 규칙 간 모순(없으면 "없음") / 확인 필요.
