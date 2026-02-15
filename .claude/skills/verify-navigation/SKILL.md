---
name: verify-navigation
description: 네비게이션 시스템(Sidebar, 뷰 라우팅, 메뉴 가시성)이 일관되게 동기화되어 있는지 검증합니다.
---

# 네비게이션 동기화 검증

## Purpose

1. 모든 페이지가 Sidebar 메뉴에 등록되어 있는지 검증
2. navigation 스토어의 뷰 목록과 App.tsx의 switch/case가 동기화되어 있는지 검증
3. viewTitles 매핑이 모든 뷰를 포함하는지 검증
4. 메뉴 가시성 설정이 모든 뷰를 커버하는지 검증

## When to Run

- 새 페이지를 추가한 후
- Sidebar 메뉴를 변경한 후
- navigation 스토어를 수정한 후
- 메뉴 가시성 설정을 변경한 후

## Related Files

| File | Purpose |
|------|---------|
| `src/dashboard/src/App.tsx` | 뷰 라우팅 (switch/case, viewTitles) |
| `src/dashboard/src/components/Sidebar.tsx` | 사이드바 메뉴 |
| `src/dashboard/src/stores/navigation.ts` | 네비게이션 스토어 |
| `src/dashboard/src/stores/menuVisibility.ts` | 메뉴 가시성 스토어 |
| `src/dashboard/src/pages/*.tsx` | 페이지 컴포넌트 |

## Workflow

### Step 1: 뷰 목록 수집

각 소스에서 뷰 목록을 추출:

```bash
# App.tsx switch/case에서 뷰 목록
grep "case '" src/dashboard/src/App.tsx | grep -v "Skeleton"

# viewTitles 객체에서 뷰 목록
grep -A50 "viewTitles" src/dashboard/src/App.tsx | grep ":" | head -20

# Sidebar 메뉴 항목
grep -n "setView\|onClick.*View" src/dashboard/src/components/Sidebar.tsx
```

### Step 2: 뷰 동기화 검사

3개 소스(App.tsx case, viewTitles, Sidebar)의 뷰 목록 비교:

**PASS 기준**: 모든 소스에 동일한 뷰 목록 존재
**FAIL 기준**: 한 곳에는 있지만 다른 곳에는 없는 뷰 존재

예시:
- App.tsx case에 `playground`가 있지만 Sidebar에 없음 → WARN
- Sidebar에 `settings`가 있지만 viewTitles에 없음 → FAIL

### Step 3: 페이지 파일 매핑 검사

각 뷰에 대응하는 페이지 파일이 존재하는지 확인:

```bash
# 페이지 파일 목록
ls src/dashboard/src/pages/*.tsx | grep -v test

# import 문에서 페이지 매핑
grep "import.*from.*pages/" src/dashboard/src/App.tsx
```

**PASS 기준**: 모든 case에 대응하는 페이지 import 존재
**FAIL 기준**: case는 있지만 import 또는 페이지 파일 누락

### Step 4: 메뉴 가시성 설정 검사

menuVisibility 스토어가 모든 비공개 뷰를 커버하는지 확인:

```bash
grep -n "visibility\|defaultVisibility" src/dashboard/src/stores/menuVisibility.ts
```

**PASS 기준**: 모든 뷰에 대한 가시성 설정 존재
**FAIL 기준**: 가시성 설정에서 누락된 뷰 존재

### Step 5: 스켈레톤 매핑 검사

App.tsx의 renderSkeletonContent에서 모든 뷰에 스켈레톤이 매핑되어 있는지:

```bash
grep "case.*:" src/dashboard/src/App.tsx | grep -c "Skeleton"
```

**PASS 기준**: 모든 뷰에 스켈레톤 매핑 존재
**FAIL 기준**: 일부 뷰에 스켈레톤 미매핑

### Step 6: 결과 종합

## Output Format

```markdown
## 네비게이션 동기화 검증 결과

| 뷰 이름 | App case | viewTitles | Sidebar | 페이지 파일 | 스켈레톤 | 가시성 | 상태 |
|---------|----------|------------|---------|-------------|----------|--------|------|
| dashboard | O | O | O | O | O | O | PASS |
| projects | O | O | O | O | O | O | PASS |
| playground | O | O | X | O | O | X | WARN |
```

## Exceptions

1. **공개 뷰**: login, register, auth-callback은 Sidebar/가시성 설정 불필요
2. **invitation-accept**: 특수 목적 뷰로 Sidebar 등록 불필요
3. **Sidebar 하위 메뉴**: 메인 메뉴 외 하위 메뉴는 매핑 검사 면제
4. **숨겨진 뷰**: 의도적으로 Sidebar에 노출하지 않는 뷰 (URL 직접 접근만 가능)는 WARN 처리
