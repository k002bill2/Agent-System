---
name: verify-notifications
description: 알림 시스템(NotificationRule)이 올바르게 구현되어 있는지, 프론트엔드-백엔드가 동기화되어 있는지 검증합니다.
---

# 알림 시스템 검증

## Purpose

1. Backend 알림 모델/API와 Frontend 스토어/컴포넌트가 동기화되어 있는지 검증
2. 알림 규칙의 CRUD가 올바르게 구현되어 있는지 검증
3. 실시간 알림 전달 메커니즘이 작동하는지 검증
4. 알림 설정 UI가 모든 알림 유형을 지원하는지 검증

## When to Run

- 알림 관련 모델/API를 변경한 후
- 알림 UI 컴포넌트를 수정한 후
- 새 알림 유형을 추가한 후

## Related Files

| File | Purpose |
|------|---------|
| `src/backend/api/notifications.py` | 알림 API |
| `src/backend/models/notification*.py` | 알림 모델 |
| `src/backend/services/notification*.py` | 알림 서비스 |
| `src/dashboard/src/pages/NotificationsPage.tsx` | 알림 페이지 |
| `src/dashboard/src/components/notifications/*.tsx` | 알림 컴포넌트 |
| `src/dashboard/src/stores/navigation.ts` | 네비게이션 (알림 뱃지) |

## Workflow

### Step 1: Backend 모델-API 동기화 검사

알림 모델의 필드와 API 응답이 일치하는지 확인:

```bash
# 모델 필드 확인
grep -n "Column\|Field\|class.*Model\|class.*Schema" src/backend/models/notification*.py

# API 엔드포인트 확인
grep -n "@router\." src/backend/api/notifications.py
```

### Step 2: Frontend 스토어-API 동기화 검사

스토어의 API 호출이 Backend 엔드포인트와 일치하는지:

```bash
# 스토어 API 호출
grep -rn "fetch\|api\.\|/notifications" src/dashboard/src/stores/ --include="*.ts" | grep -i "notif"

# 컴포넌트에서 스토어 사용
grep -rn "useNotif\|notification.*Store" src/dashboard/src/components/notifications/ --include="*.tsx"
```

**PASS 기준**: 스토어의 모든 API 호출이 Backend에 대응하는 엔드포인트 존재
**FAIL 기준**: 스토어에서 호출하는 엔드포인트가 Backend에 없음

### Step 3: 알림 유형 일관성 검사

Backend에 정의된 알림 유형이 Frontend에서 모두 처리되는지:

```bash
# Backend 알림 유형
grep -rn "type\|channel\|severity\|NotificationType" src/backend/models/notification*.py

# Frontend 알림 유형 처리
grep -rn "type\|channel\|severity" src/dashboard/src/components/notifications/ --include="*.tsx"
```

**PASS 기준**: Backend의 모든 알림 유형이 Frontend에서 렌더링 가능
**FAIL 기준**: Backend에는 있지만 Frontend에서 처리하지 않는 유형 존재

### Step 4: project_ids 필터링 검사

알림 규칙의 프로젝트 필터링이 올바르게 구현되어 있는지:

```bash
# Backend project_ids 처리
grep -rn "project_ids" src/backend/ --include="*.py"

# Frontend project_ids 처리
grep -rn "project_ids\|projectIds" src/dashboard/src/ --include="*.ts" --include="*.tsx"
```

**PASS 기준**: project_ids가 비어있으면 모든 프로젝트 대상, 값이 있으면 해당 프로젝트만 필터링
**FAIL 기준**: project_ids 필터링 로직 누락 또는 불일치

### Step 5: 결과 종합

## Output Format

```markdown
## 알림 시스템 검증 결과

| 검사 항목 | 상태 | 상세 |
|-----------|------|------|
| 모델-API 동기화 | PASS/FAIL | N개 필드 매칭 |
| 스토어-API 동기화 | PASS/FAIL | N개 엔드포인트 매칭 |
| 알림 유형 일관성 | PASS/FAIL | N개 유형 처리 |
| project_ids 필터링 | PASS/FAIL | 필터 로직 확인 |
```

## Exceptions

1. **WebSocket 알림**: 실시간 알림 전달은 연결 상태에 따라 동작이 다를 수 있음
2. **이메일 알림**: 외부 이메일 서비스 연동은 이 검증 범위 외
3. **마이그레이션 파일**: DB 마이그레이션 파일은 검사 대상 아님
