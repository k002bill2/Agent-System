---
description: 커밋, 푸시, PR 생성 자동화 워크플로우 (Boris Cherny 스타일)
---

# Git Commit → Push → PR 자동화

이 커맨드는 변경사항을 분석하고 커밋, 푸시, PR 생성을 자동으로 수행합니다.

## 워크플로우

### 1. 현재 상태 확인
먼저 git status와 git diff를 실행하여 변경사항을 파악하세요:

```bash
git status
git diff --stat
```

### 2. 변경사항 분석
변경된 파일들을 분석하여:
- 변경 유형 파악 (기능 추가, 버그 수정, 리팩토링, 문서 등)
- 영향 범위 확인 (컴포넌트, 서비스, 훅 등)
- 브레이킹 체인지 여부 확인

### 3. 커밋 메시지 생성
Conventional Commits 형식으로 커밋 메시지를 생성하세요:
- `feat:` 새 기능
- `fix:` 버그 수정
- `refactor:` 리팩토링
- `docs:` 문서 변경
- `test:` 테스트 추가/수정
- `chore:` 빌드, 설정 변경

### 4. 커밋 및 푸시
```bash
git add .
git commit -m "커밋메시지"
git push origin HEAD
```

현재 브랜치가 원격에 없으면:
```bash
git push -u origin HEAD
```

### 5. PR 생성
GitHub CLI를 사용하여 PR을 생성하세요:

```bash
gh pr create --title "PR 제목" --body "$(cat <<'EOF'
## Summary
- 변경사항 요약 (1-3개 bullet points)

## Changes
- 구체적인 변경 내용

## Test Plan
- [ ] 테스트 계획 항목

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## 주의사항
- 커밋 전 `/verify-app` 실행 권장
- 민감한 정보 (API 키, 비밀번호) 포함 여부 확인
- 브랜치 이름은 `feature/`, `fix/`, `refactor/` 접두사 사용

## 예시 실행
```
사용자: /commit-push-pr

Claude:
1. git status 확인... 5개 파일 변경됨
2. 변경 분석: src/components/StationCard.tsx - UI 개선
3. 커밋 메시지: "feat(ui): StationCard 컴포넌트 디자인 개선"
4. 커밋 및 푸시 완료
5. PR 생성: https://github.com/user/repo/pull/123
```
