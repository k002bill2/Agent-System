---
name: verify-react-best-practices
description: React 베스트 프랙티스(hooks 규칙, memo 최적화, key 사용, 이벤트 핸들러 패턴)를 따르는지 검증합니다.
---

# React 베스트 프랙티스 검증

## Purpose

1. React Hooks 규칙(Rules of Hooks)을 준수하는지 검증
2. 불필요한 리렌더링을 유발하는 패턴이 없는지 검증
3. 리스트 렌더링에서 적절한 key를 사용하는지 검증
4. 이벤트 핸들러와 콜백 패턴이 올바른지 검증
5. useEffect 의존성 배열이 올바른지 검증

## When to Run

- 새 React 컴포넌트를 작성한 후
- 기존 컴포넌트의 상태 관리를 변경한 후
- 성능 최적화 작업 후
- PR 코드 리뷰 시

## Related Files

| File | Purpose |
|------|---------|
| `src/dashboard/src/components/**/*.tsx` | React 컴포넌트 |
| `src/dashboard/src/pages/*.tsx` | 페이지 컴포넌트 |
| `src/dashboard/src/stores/*.ts` | Zustand 스토어 (selector 패턴) |

## Workflow

### Step 1: 조건부 Hook 호출 검사

조건문/반복문 내에서 Hook을 호출하는 패턴 탐지:

```bash
# if 블록 내 hook 호출
grep -rn "if.*{" src/dashboard/src/ --include="*.tsx" -A5 | grep "use[A-Z]\|useState\|useEffect\|useMemo\|useCallback\|useRef"
```

```bash
# 함수 내 조건부 반환 후 hook 호출
grep -rn "return.*null\|return.*<" src/dashboard/src/ --include="*.tsx" -A3 | grep "use[A-Z]"
```

**PASS 기준**: 모든 Hook이 컴포넌트 최상위에서 호출
**FAIL 기준**: 조건부/반복 블록 내 Hook 호출

### Step 2: 인라인 객체/배열 리렌더링 패턴 검사

렌더링마다 새 참조를 생성하는 패턴 탐지:

```bash
# JSX 내 인라인 객체 (style 제외)
grep -rn "={{\s*[a-z]" src/dashboard/src/components/ --include="*.tsx" | grep -v "style=\|className="

# JSX 내 인라인 함수
grep -rn "onClick={() =>\|onChange={() =>\|onSubmit={() =>" src/dashboard/src/components/ --include="*.tsx" | head -20
```

**PASS 기준**: 복잡한 인라인 함수가 useCallback으로 메모이제이션됨
**FAIL 기준**: 무거운 연산을 포함한 인라인 함수가 매 렌더마다 재생성 (단, 간단한 핸들러는 허용)

### Step 3: 리스트 key 패턴 검사

`.map()` 렌더링에서 key 사용 확인:

```bash
grep -rn "\.map(" src/dashboard/src/ --include="*.tsx" -A3 | grep "key=\|key ="
```

```bash
# index를 key로 사용하는 패턴
grep -rn "key={.*index\|key={i}" src/dashboard/src/ --include="*.tsx"
```

**PASS 기준**: 고유한 ID를 key로 사용
**FAIL 기준**: index를 key로 사용 (동적 리스트에서)

### Step 4: useEffect 의존성 검사

useEffect에서 의존성 배열 누락 또는 eslint-disable 확인:

```bash
# eslint-disable-line react-hooks/exhaustive-deps
grep -rn "eslint-disable.*exhaustive-deps\|eslint-disable-next-line.*hooks" src/dashboard/src/ --include="*.tsx" --include="*.ts"
```

```bash
# 빈 의존성 배열
grep -rn "useEffect.*\[\]" src/dashboard/src/ --include="*.tsx" --include="*.ts"
```

**PASS 기준**: eslint-disable 사용 시 주석으로 이유 명시
**FAIL 기준**: 이유 없는 eslint-disable 또는 누락된 의존성

### Step 5: Zustand 셀렉터 패턴 검사

스토어에서 불필요한 전체 구독 방지:

```bash
# 전체 스토어 구독 (비효율)
grep -rn "const.*= use.*Store()" src/dashboard/src/ --include="*.tsx" | grep -v "getState"
```

**PASS 기준**: 필요한 상태만 셀렉터로 구독
**FAIL 기준**: 전체 스토어 구독으로 불필요한 리렌더링 유발

### Step 6: 결과 종합

## Output Format

```markdown
## React 베스트 프랙티스 검증 결과

| 검사 항목 | 위반 수 | 심각도 | 상태 |
|-----------|---------|--------|------|
| 조건부 Hook | 0 | Critical | PASS |
| 인라인 리렌더링 | N | Warn | WARN |
| 리스트 key | N | Medium | PASS/FAIL |
| useEffect 의존성 | N | Medium | PASS/FAIL |
| Zustand 셀렉터 | N | Low | PASS/WARN |
```

## Exceptions

1. **간단한 인라인 핸들러**: `onClick={() => setView('dashboard')}` 같은 단순 호출은 허용
2. **일회성 useEffect**: 마운트 시 1회 실행하는 `useEffect(fn, [])` + eslint-disable은 주석과 함께 허용
3. **정적 리스트 index key**: 순서가 변하지 않는 정적 리스트에서 index key 사용은 WARN (FAIL 아님)
4. **스토어 구독 예외**: `getState()` 호출은 구독이 아니므로 제외
5. **App.tsx 특수 패턴**: 루트 컴포넌트의 조건부 렌더링은 별도 패턴 허용
