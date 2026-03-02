---
name: dev-docs
description: 대규모 작업을 위한 Dev Docs 3-파일 시스템 생성
---

# Dev Docs 생성

승인된 계획을 기반으로 3개의 개발 문서를 생성합니다.

## 작업 내용

1. **작업명 결정**: 현재 작업의 이름을 확인하거나 사용자에게 요청
2. **디렉토리 생성**: `dev/active/[task-name]/` 디렉토리 생성
3. **3개 문서 생성**:
   - `[task-name]-plan.md` - 승인된 계획
   - `[task-name]-context.md` - 핵심 결정사항
   - `[task-name]-tasks.md` - 체크리스트

## Plan 문서 템플릿

```markdown
# [Task Name] Plan

## Executive Summary
[작업 요약 - 1-2문장]

## Phase 1: [Phase Name]
### Tasks
- [ ] Task 1
- [ ] Task 2

### Technical Decisions
- Decision 1
- Decision 2

## Phase 2: [Phase Name]
### Tasks
- [ ] Task 1
- [ ] Task 2

## Success Metrics
- Metric 1
- Metric 2
```

## Context 문서 템플릿

```markdown
# [Task Name] - Context

## Last Updated: [YYYY-MM-DD HH:mm]

## Key Files
- `path/to/file1.ts`
- `path/to/file2.py`

## Important Decisions
- **[YYYY-MM-DD]**: Decision description

## Current Issues
- [ ] Issue 1
- [x] ~~Resolved issue~~

## Dependencies
- Dependency 1
- Dependency 2

## Next Steps
1. Next step 1
2. Next step 2
```

## Tasks 문서 템플릿

```markdown
# [Task Name] - Tasks

## Backend (0/N complete)
- [ ] Task 1
- [ ] Task 2

## Frontend (0/N complete)
- [ ] Task 1
- [ ] Task 2

## Testing (0/N complete)
- [ ] Task 1
- [ ] Task 2

## Documentation (0/N complete)
- [ ] Task 1
- [ ] Task 2
```

## 주의사항

- 모든 문서에 타임스탬프 추가
- 체크박스 형식으로 진행 상황 추적 가능하게
- 섹션별 완료 카운트 유지
- 다음 세션에서 쉽게 이어갈 수 있도록 "Next Steps" 명확히

## 사용 시점

- Planning Mode에서 계획이 승인된 후
- 대규모 작업 (5개 이상의 서브태스크) 시작 전
- Context가 20% 이하로 떨어지기 전
