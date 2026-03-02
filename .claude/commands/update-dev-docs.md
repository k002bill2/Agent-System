---
name: update-dev-docs
description: Context Compaction 전 Dev Docs 업데이트
---

# Dev Docs 업데이트

Context Compaction 전에 모든 활성 Dev Docs를 업데이트합니다.

## 작업 내용

### 1. Context 문서 업데이트

```markdown
# 업데이트 항목:
- "Last Updated" 타임스탬프 갱신
- 새로운 결정사항 추가
- "Current Issues" 섹션 업데이트
- "Next Steps" 진행 상황에 맞게 수정
```

### 2. Tasks 문서 업데이트

```markdown
# 업데이트 항목:
- 완료된 항목 [x]로 표시
- 새로 발견된 태스크 추가
- 완료 카운트 업데이트 (X/N complete)
- 우선순위에 따라 재정렬
```

### 3. 세션 요약 추가

Context 문서 하단에 세션 요약 추가:

```markdown
## Session Summary - [YYYY-MM-DD]

### Accomplished
- [완료된 작업 목록]

### Blockers
- [발생한 블로커 또는 이슈]

### Critical Next Actions
1. [가장 중요한 다음 작업]
2. [두 번째로 중요한 작업]
```

## 사용 시점

- Context가 20% 이하로 떨어졌을 때
- /compact 실행 전
- 긴 작업 세션 종료 전
- 다음 날 작업 재개를 위한 준비

## 자동화 팁

StopEvent Hook과 연동하여 자동 업데이트 가능:

```javascript
// 세션 종료 시 자동으로 dev docs 업데이트 알림
if (contextUsage < 0.2) {
  console.log('⚠️ Context 20% 이하. /update-dev-docs 실행 권장');
}
```

## 관련 명령어

- `/dev-docs` - 새 Dev Docs 생성
- `/save-and-compact` - 저장 후 /compact 실행
- `/resume` - 이전 세션에서 작업 재개
