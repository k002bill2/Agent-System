---
description: Git 변경사항 분석 및 Conventional Commits 형식 커밋 초안 생성
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*)
argument-hint: [--staged | --all]
---

# Draft Commits - Git 변경사항 분석

Git 변경사항을 분석하여 Conventional Commits 형식으로 커밋 초안을 생성합니다.

## 실행 단계

### 1. 변경사항 수집

```bash
# 전체 상태 확인
git status --porcelain

# Staged 변경사항 상세
git diff --cached --stat

# Unstaged 변경사항 상세
git diff --stat

# 최근 커밋 스타일 참고
git log --oneline -5
```

### 2. 파일 그룹화 규칙

변경된 파일을 아래 규칙에 따라 그룹화합니다:

| 경로 패턴 | 그룹명 | 기본 Type |
|----------|--------|-----------|
| `.claude/hooks/` | Claude Hooks | chore(hooks) |
| `.claude/skills/` | Claude Skills | docs(skills) |
| `.claude/commands/` | Claude Commands | docs(commands) |
| `.claude/agents/` | Claude Agents | docs(agents) |
| `.claude/*.json` | Claude Config | chore(config) |
| `src/backend/api/` | Backend API | feat(api) |
| `src/backend/services/` | Backend Services | feat(services) |
| `src/backend/agents/` | Backend Agents | feat(agents) |
| `src/backend/models/` | Backend Models | feat(models) |
| `src/backend/db/` | Backend Database | feat(db) |
| `src/dashboard/src/pages/` | Dashboard Pages | feat(pages) |
| `src/dashboard/src/components/` | Dashboard Components | feat(components) |
| `src/dashboard/src/stores/` | Dashboard Stores | feat(stores) |
| `src/dashboard/src/hooks/` | Dashboard Hooks | feat(hooks) |
| `tests/` | Tests | test |
| `docs/` | Documentation | docs |
| `infra/` | Infrastructure | chore(infra) |

### 3. Commit Type 결정

변경 내용을 분석하여 적절한 type을 선택합니다:

- **feat**: 새 기능 추가 (새 파일 생성, 기능 확장)
- **fix**: 버그 수정 (에러 처리, 로직 수정)
- **refactor**: 리팩토링 (코드 구조 개선, 성능 향상)
- **docs**: 문서 변경 (README, 주석, 가이드)
- **test**: 테스트 추가/수정
- **chore**: 설정, 빌드, 의존성 변경
- **style**: 코드 스타일 변경 (포맷팅, 세미콜론 등)

### 4. 출력 형식

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 COMMIT DRAFT SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Overview
│ Total: N files │ Staged: N │ Unstaged: N │ New: N │

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 [그룹명] (N files)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  💬 Suggested Commit:
  │ type(scope): 간결한 변경 설명 │

  📄 Files:
  ├── file1.ext    [M] +N -M
  ├── file2.ext    [A] +N
  └── file3.ext    [D]

[그룹별 반복...]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 QUICK ACTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Single commit:
  │ type: 전체 변경사항 요약 (한 줄로 커밋하려면) │

  Group commits:
  │ /commit-push-pr 사용하여 그룹별 개별 커밋 │

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Legend: [M] Modified  [A] Added  [D] Deleted  [R] Renamed
```

## 옵션

- `--staged`: Staged 변경사항만 분석
- `--all`: Staged + Unstaged 모든 변경사항 분석 (기본값)

## 커밋 메시지 가이드라인

1. **Subject 라인**
   - 50자 이내로 작성
   - 첫 글자 소문자
   - 마침표 없음
   - 명령형 사용 (add, fix, update)

2. **Scope 선택**
   - 영향받는 영역 (api, ui, hooks, config 등)
   - 생략 가능하나 권장

3. **예시**
   ```
   feat(api): add organization invitation endpoint
   fix(hooks): resolve infinite loop in useAuth
   docs(commands): add draft-commits slash command
   chore(config): update eslint rules
   ```

## 연계 명령어

- `/commit-push-pr` - 실제 커밋 및 PR 생성
- `/review` - 변경사항 코드 리뷰
- `/verify-app` - 커밋 전 검증

$ARGUMENTS
