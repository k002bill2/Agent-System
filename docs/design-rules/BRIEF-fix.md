# BRIEF — 잔여 문구 정리 (Agent-System)
- 책임 역할: Developer / 실행 환경: Orca + Claude Code · 발행 Jarvis 2026-09-27 · 영환님 승인(새 규칙 기준으로 옛 문구 교정)

## 할 일
1. `.claude/rules/frontend-design-defaults.md` 10번 문장에서 괄호 "(코드 컨텍스트 한정)"만 삭제한다.
   목표: "... `font-mono` 허용 범위는 `aos-frontend.md`가 정본."

## 규칙
- 지정 문구 외 수정 금지. 지정 파일: `.claude/rules/frontend-design-defaults.md`
- 빌드·설치·네트워크·push·병합 금지. 추가 불일치를 발견하면 고치지 말고 보고.
- 커밋 1회: `git add .claude/rules/frontend-design-defaults.md docs/design-rules && git commit -m "docs(claude): drop stale wording after design-defaults reconcile" -- .claude/rules/frontend-design-defaults.md docs/design-rules`
- 검증: `git diff HEAD~1..HEAD -- .claude/rules/frontend-design-defaults.md` 출력 전문, `git status --short` 비어 있음.
- `docs/design-rules/PROGRESS-fix.md`에 체크리스트를 만들고 체크한다.

## 최종 메시지
변경 전/후 문장 / 커밋 해시 / 검증 출력 / 추가 발견(없으면 "없음").
