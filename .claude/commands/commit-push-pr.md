---
allowed-tools: Bash(git:*), Bash(gh:*), Bash(npm:*), Bash(python:*), Read, Grep, Glob
description: 검증 완료 후 커밋 & PR 생성
argument-hint: [커밋 메시지] [--merge|--squash|--rebase] [--draft] [--no-verify]
---

## Task

### 0단계: Context 수집
```bash
git status --short
git branch --show-current
git log --oneline -3
git diff --staged --stat 2>/dev/null || git diff --stat
```

### 1단계: 인자 파싱
- `--merge` / `--squash` / `--rebase` → 머지 모드
- `--draft` → Draft PR
- `--no-verify` → 빌드/테스트 스킵
- 나머지 → 커밋 메시지

### 2단계: 사전 체크
- 변경사항 없으면 중단
- main/master 브랜치면 경고 (브랜치 생성 권장)

### 3단계: 빌드/테스트 검증
`--no-verify` 없으면:
- Backend: `cd src/backend && pytest ../../tests/backend`
- Dashboard: `cd src/dashboard && npm run build && npm test`

### 4단계: 스테이징 & 커밋
```bash
git add -A
git commit -m "[Conventional Commits 메시지]"
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

### 5단계: Push
```bash
git push --set-upstream origin [브랜치명]
```

### 6단계: PR 생성
```bash
gh pr create --title "[메시지]" --body "[변경사항 요약]"
```

### 7단계: 머지 (옵션 있을 때만)
```bash
gh pr merge --[merge|squash|rebase] --delete-branch
```

### 8단계: 완료 출력
```
커밋: [해시] [메시지]
브랜치: [브랜치] → [베이스]
PR: [URL]
```
