---
allowed-tools: Bash(git:*), Read, Write
description: 작업 상태 저장/복원 (WIP 커밋)
argument-hint: [save|restore] [설명]
---

# WIP Save/Restore

작업 중간 상태를 저장하고 복원합니다. (구 `/checkpoint` — 네이티브 `/checkpoint` rewind alias와 이름 충돌하여 `/wip-save`로 개명. git 커밋 컨벤션 `checkpoint:`는 기존 WIP 커밋 복원 호환을 위해 유지.)

## Save (저장)

```bash
git add -A
git commit -m "checkpoint: [설명 또는 자동 생성]"
```

현재 작업 상태를 WIP 커밋으로 저장합니다.

## Restore (복원)

최근 checkpoint 커밋을 찾아서:
```bash
git log --oneline --grep="checkpoint:" -5
```

선택한 checkpoint로 복원:
```bash
git reset --soft [checkpoint-hash]
```

## 사용 시점

- 큰 작업 중 중간 저장
- 위험한 변경 전 안전망
- 컨텍스트 50% 도달 전 상태 보존
- 새 세션으로 넘기기 전 상태 저장
