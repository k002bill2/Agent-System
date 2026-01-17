---
description: Save context to Dev Docs and run /compact in one command
---

# Save & Compact

Dev Docs에 현재 세션의 컨텍스트를 저장합니다.

## Instructions

다음 단계를 순서대로 실행하세요:

### Step 1: 활성 프로젝트 확인

```bash
ls dev/active/ 2>/dev/null || echo "No active projects"
```

### Step 2: Dev Docs 업데이트

활성 프로젝트가 있으면 해당 Context 문서(`*-context.md`)와 Tasks 문서(`*-tasks.md`)를 업데이트합니다:

**Context 문서 업데이트:**
- Last Updated 타임스탬프 갱신
- 이번 세션 완료 작업 기록
- 발견된 이슈/블로커 기록
- 다음 세션 우선 작업 명시

**Tasks 문서 업데이트:**
- 완료 항목 `[x]` 표시
- 새 작업 추가
- 우선순위 조정

### Step 3: 요약 출력

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEV DOCS SAVED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Updated: [프로젝트명]
- Context: [타임스탬프]
- Tasks: [완료 N개 / 신규 N개]

Next: /compact (컨텍스트 압축)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step 4: Compact 안내

사용자에게 `/compact` 명령어를 실행하라고 안내합니다.
(내장 명령어는 스킬에서 직접 실행할 수 없음)

## Session Summary Template

```markdown
### [날짜] [시간]
- **완료**: [작업 목록]
- **블로커**: [있으면 기록]
- **다음**: [우선 작업]
```

---
**Version**: 2.0.0
