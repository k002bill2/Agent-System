---
name: verify-admin
description: Admin 페이지와 관리자 전용 기능의 접근 제어가 올바르게 구현되었는지 검증합니다.
---

# Admin 접근 제어 검증

## Purpose

1. Admin 페이지/기능에 역할 기반 접근 제어(RBAC)가 적용되어 있는지 검증
2. Backend API에 관리자 권한 체크가 있는지 검증
3. Frontend에서 관리자 전용 UI 요소가 조건부 렌더링되는지 검증

## When to Run

- Admin 전용 기능을 추가한 후
- 권한/역할 시스템을 변경한 후
- 새 API 엔드포인트에 관리자 권한을 적용한 후

## Related Files

| File | Purpose |
|------|---------|
| `src/dashboard/src/pages/AdminPage.tsx` | Admin 페이지 |
| `src/dashboard/src/App.tsx` | 역할 기반 라우팅 (visibility 체크) |
| `src/dashboard/src/stores/auth.ts` | 인증 스토어 (user.role, is_admin) |
| `src/dashboard/src/stores/menuVisibility.ts` | 메뉴 가시성 설정 |
| `src/backend/api/admin.py` | Admin API 라우터 |
| `src/backend/api/deps.py` | 의존성 주입 (권한 체크) |

## Workflow

### Step 1: Backend Admin API 권한 체크 검사

Admin API 파일에서 권한 체크 데코레이터/의존성 존재 확인:

```bash
grep -n "Depends\|require_admin\|is_admin\|role.*admin" src/backend/api/admin.py
```

Admin API의 모든 라우터 함수에 권한 체크가 있는지 확인:

```bash
grep -n "@router\." src/backend/api/admin.py
```

**PASS 기준**: 모든 `@router.*` 핸들러에 admin 권한 의존성 존재
**FAIL 기준**: 권한 체크 없는 admin 핸들러 존재

### Step 2: Frontend 역할 기반 접근 제어 검사

App.tsx에서 admin 뷰에 대한 역할 체크 존재 확인:

```bash
grep -n "admin\|role\|is_admin\|visibility" src/dashboard/src/App.tsx
```

관리자 전용 컴포넌트가 조건부 렌더링되는지 확인:

```bash
grep -rn "is_admin\|role.*admin\|user\.role" src/dashboard/src/components/admin/ --include="*.tsx"
```

**PASS 기준**: admin 뷰가 역할 기반 접근 제어에 포함됨
**FAIL 기준**: admin 뷰에 접근 제어 없음

### Step 3: 메뉴 가시성 설정 검사

menuVisibility 스토어에 admin 메뉴 설정이 있는지 확인:

```bash
grep -n "admin" src/dashboard/src/stores/menuVisibility.ts
```

**PASS 기준**: admin 메뉴가 역할별 가시성 설정에 포함
**FAIL 기준**: admin 메뉴가 가시성 설정에서 누락

### Step 4: 결과 종합

## Output Format

```markdown
## Admin 접근 제어 검증 결과

| 검사 항목 | 상태 | 상세 |
|-----------|------|------|
| Backend API 권한 체크 | PASS/FAIL | N개 엔드포인트 중 X개 보호됨 |
| Frontend 역할 체크 | PASS/FAIL | 접근 제어 로직 존재 여부 |
| 메뉴 가시성 설정 | PASS/FAIL | admin 메뉴 설정 존재 여부 |
```

## Exceptions

1. **Public Admin 엔드포인트**: 헬스체크 등 인증 불필요한 관리 엔드포인트는 제외
2. **개발 환경 전용**: 개발 환경에서만 노출되는 디버그 기능은 제외
3. **인증 미설정 환경**: `anyAuthAvailable === false`인 경우 역할 체크가 스킵되는 것은 정상
