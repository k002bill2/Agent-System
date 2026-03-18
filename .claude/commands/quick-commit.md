---
allowed-tools: Bash(git:*), Read, Grep, Glob
description: 간단한 수정용 빠른 커밋 (검증 스킵)
argument-hint: [커밋 메시지]
---

# Quick Commit

검증 없이 빠르게 커밋합니다. 문서, 설정, 단순 수정에만 사용.

## 절차

1. `git status --short` 확인
2. 변경사항 없으면 중단
3. `git add -A`
4. 커밋 메시지:
   - $ARGUMENTS 있으면 그대로 사용
   - 없으면 변경 내용 분석하여 Conventional Commits 형식 자동 생성
5. `git commit -m "[메시지]"`

## 사용 시점

- 문서 수정 (docs, README, CLAUDE.md)
- 설정 파일 변경 (.claude/, .gitignore)
- 주석/타이포 수정
- 단순 포맷팅

## 주의

- 코드 로직 변경에는 사용 금지 → `/commit-push-pr` 사용
- 테스트/빌드 검증 없음
