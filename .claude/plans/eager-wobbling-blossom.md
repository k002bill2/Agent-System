# Plan: Commands Registry 추가

## Context

현재 `sync-registry.js`는 skills, agents, hooks 3가지만 동기화하지만, `.claude/commands/`에 20개 커맨드가 있음에도 레지스트리가 없음. agents-registry.json 패턴과 동일하게 `commands-registry.json`을 자동 생성하도록 추가.

## 변경 파일

### 1. `.claude/scripts/sync-registry.js` - `syncCommands()` 함수 추가

- `.claude/commands/*.md` 스캔
- frontmatter에서 `name`, `description`, `allowed-tools` 추출
- `name`이 없는 경우 파일명(확장자 제외)을 name으로 사용
- `commands-registry.json` 생성

```js
function syncCommands() {
  // .claude/commands/*.md 스캔
  // frontmatter 파싱 (name, description, allowed-tools)
  // commands-registry.json 생성
}
```

- `syncAll()`에 `commands: syncCommands()` 추가
- CLI `--commands` 옵션 추가
- Summary 출력에 Commands 라인 추가

### 2. `.claude/commands-registry.json` (자동 생성)

```json
{
  "_generated": "...",
  "_description": "Auto-generated commands registry. Do not edit manually.",
  "commands": {
    "check-health": {
      "file": ".claude/commands/check-health.md",
      "description": "Comprehensive project health check...",
      "allowedTools": null
    },
    "draft-commits": {
      "file": ".claude/commands/draft-commits.md",
      "description": "Git 변경사항 분석...",
      "allowedTools": "Bash(git status:*), Bash(git diff:*), Bash(git log:*)"
    }
    // ... 20개 전부
  }
}
```

### 3. `.claude/commands/sync-registry.md` - Commands 섹션 추가

- "4. **Commands 동기화**" 섹션 추가
- "커맨드 추가" 예시 추가
- 결과 파일 목록에 `commands-registry.json` 추가

### 4. `.claude/README.md` - Directory Structure 업데이트

- `commands-registry.json` 항목 추가

## Verification

```bash
# 스크립트 실행 후 레지스트리 생성 확인
node .claude/scripts/sync-registry.js --commands
cat .claude/commands-registry.json | head -20

# 전체 동기화 테스트
node .claude/scripts/sync-registry.js --all
```
