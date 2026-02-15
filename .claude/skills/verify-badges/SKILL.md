---
name: verify-badges
description: 상태 배지(Badge) 컴포넌트가 일관된 색상, 스타일, 패턴을 사용하는지 검증합니다.
---

# 상태 배지 일관성 검증

## Purpose

1. 상태 배지(Badge, Status Indicator)가 프로젝트 전체에서 일관된 색상 매핑을 사용하는지 검증
2. 상태 텍스트와 색상의 매핑이 의미론적으로 올바른지 검증
3. Badge 컴포넌트가 재사용 가능한 공통 컴포넌트를 사용하는지 검증

## When to Run

- 새 상태 표시 UI를 추가한 후
- 색상 체계를 변경한 후
- 새 컴포넌트에서 상태 배지를 사용한 후

## Related Files

| File | Purpose |
|------|---------|
| `src/dashboard/src/components/**/*.tsx` | 상태 배지를 사용하는 컴포넌트 |
| `src/dashboard/src/components/common/*.tsx` | 공통 컴포넌트 |

## Workflow

### Step 1: 상태 배지 사용 패턴 수집

프로젝트에서 상태 관련 스타일링 패턴을 검색:

```bash
grep -rn "bg-green\|bg-red\|bg-yellow\|bg-blue\|bg-orange\|bg-purple" src/dashboard/src/components/ --include="*.tsx" | grep -i "status\|badge\|state\|indicator"
```

상태 텍스트 매핑 검색:

```bash
grep -rn "success\|error\|warning\|pending\|active\|inactive\|running\|stopped\|completed\|failed" src/dashboard/src/components/ --include="*.tsx" | grep "bg-\|text-\|border-"
```

### Step 2: 색상-상태 매핑 일관성 검사

다음 의미론적 매핑을 검증:

| 상태 | 기대 색상 | 비기대 색상 |
|------|-----------|-------------|
| success, completed, active, running | green | red, yellow |
| error, failed, stopped | red | green |
| warning, pending | yellow/amber | green |
| info, default | blue/gray | red |

```bash
# 부적절한 색상 매핑 탐지
grep -rn "failed.*bg-green\|error.*bg-green\|success.*bg-red\|active.*bg-red" src/dashboard/src/components/ --include="*.tsx"
```

**PASS 기준**: 모든 상태-색상 매핑이 의미론적으로 일관
**FAIL 기준**: 부적절한 색상 매핑 존재 (예: error에 green 사용)

### Step 3: 배지 컴포넌트 재사용 검사

인라인 배지 스타일링 대신 공통 컴포넌트 사용 여부:

```bash
# 인라인 배지 패턴 탐지 (공통 컴포넌트 미사용)
grep -rn "rounded-full.*px-.*text-xs\|inline-flex.*items-center.*rounded" src/dashboard/src/components/ --include="*.tsx" | grep -v "common/"
```

**PASS 기준**: 배지 스타일이 공통 컴포넌트 또는 일관된 유틸리티를 통해 적용
**FAIL 기준**: 동일한 배지 스타일을 여러 곳에서 인라인으로 중복 정의

### Step 4: 결과 종합

## Output Format

```markdown
## 상태 배지 검증 결과

### 색상 매핑 현황

| 상태 | 사용된 색상 | 기대 색상 | 일관성 |
|------|------------|-----------|--------|
| success | green | green | PASS |
| error | red | red | PASS |

### 재사용 현황

| 파일 | 배지 구현 방식 | 상태 |
|------|---------------|------|
| AgentCard.tsx | 공통 컴포넌트 | PASS |
| TaskPanel.tsx | 인라인 스타일 | WARN |
```

## Exceptions

1. **특수 목적 색상**: 브랜드 색상이나 특수 카테고리 표시는 의미론적 매핑에서 제외
2. **다크모드 변형**: `dark:bg-*` 클래스는 별도 검사하지 않음
3. **차트/그래프 색상**: 데이터 시각화용 색상은 이 검증 범위 외
