---
name: verify-detail-pages
description: 상세/편집 페이지가 일관된 패턴(로딩, 에러, 빈 상태, 레이아웃)을 따르는지 검증합니다.
---

# 상세 페이지 패턴 검증

## Purpose

1. 페이지 컴포넌트가 로딩/에러/빈 상태를 모두 처리하는지 검증
2. 페이지 레이아웃이 일관된 구조를 따르는지 검증
3. 데이터 페칭 패턴이 통일되어 있는지 검증

## When to Run

- 새 페이지를 추가한 후
- 기존 페이지의 데이터 페칭 로직을 변경한 후
- 페이지 레이아웃 구조를 수정한 후

## Related Files

| File | Purpose |
|------|---------|
| `src/dashboard/src/pages/*.tsx` | 페이지 컴포넌트 |
| `src/dashboard/src/stores/*.ts` | 데이터 스토어 |
| `src/dashboard/src/components/skeletons/*.tsx` | 로딩 스켈레톤 |
| `src/dashboard/src/components/ErrorBoundary.tsx` | 에러 바운더리 |

## Workflow

### Step 1: 페이지 상태 처리 검사

각 페이지 파일에서 3가지 상태 처리 확인:

```bash
# 로딩 상태 처리
grep -l "loading\|isLoading\|Skeleton\|spinner" src/dashboard/src/pages/*.tsx

# 에러 상태 처리
grep -l "error\|Error\|에러" src/dashboard/src/pages/*.tsx

# 빈 상태 처리
grep -l "empty\|no data\|데이터가 없\|목록이 없\|No.*found" src/dashboard/src/pages/*.tsx
```

각 페이지별 상태 처리 매트릭스:

**PASS 기준**: 데이터를 fetch하는 페이지가 로딩/에러/빈 상태를 모두 처리
**FAIL 기준**: 하나 이상의 상태 처리 누락

### Step 2: 데이터 페칭 패턴 검사

페이지에서 useEffect를 통한 데이터 페칭 패턴 확인:

```bash
grep -n "useEffect" src/dashboard/src/pages/*.tsx
```

스토어 액션 호출 패턴 확인:

```bash
grep -rn "fetch\|load\|get.*Store\|use.*Store" src/dashboard/src/pages/*.tsx
```

**PASS 기준**: 스토어를 통한 데이터 페칭 (직접 API 호출 없음)
**FAIL 기준**: 페이지에서 직접 fetch/axios 호출

### Step 3: 레이아웃 구조 일관성 검사

페이지 최상위 컨테이너 스타일 확인:

```bash
grep -n "className.*flex-1\|className.*overflow\|className.*p-6\|className.*h-full" src/dashboard/src/pages/*.tsx | head -30
```

**PASS 기준**: 모든 페이지가 유사한 레이아웃 래퍼 사용
**FAIL 기준**: 페이지마다 다른 레이아웃 구조

### Step 4: App.tsx 등록 검사

페이지가 App.tsx의 renderContent에 등록되어 있는지 확인:

```bash
grep "case.*:" src/dashboard/src/App.tsx | grep -v "Skeleton\|default"
```

**PASS 기준**: 모든 페이지 파일이 App.tsx에 case로 등록됨
**FAIL 기준**: 페이지 파일은 존재하지만 App.tsx에 미등록

## Output Format

```markdown
## 상세 페이지 검증 결과

### 상태 처리 매트릭스

| 페이지 | 로딩 | 에러 | 빈 상태 | 데이터 소스 | 상태 |
|--------|------|------|---------|-------------|------|
| DashboardPage | PASS | PASS | PASS | Store | PASS |
| ProjectsPage | PASS | FAIL | PASS | Store | FAIL |

### App.tsx 등록

| 페이지 파일 | view 이름 | 등록됨 | 상태 |
|-------------|-----------|--------|------|
| DashboardPage.tsx | dashboard | Yes | PASS |
```

## Exceptions

1. **인증 페이지**: LoginPage, RegisterPage, AuthCallbackPage는 데이터 페칭 패턴 제외
2. **InvitationAcceptPage**: 특수 목적 페이지로 일반 레이아웃 패턴 면제
3. **Settings 페이지**: 탭 기반 레이아웃으로 별도 구조 허용
4. **테스트 파일**: `*.test.tsx` 페이지는 검사 대상 아님
