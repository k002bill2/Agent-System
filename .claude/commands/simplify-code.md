---
description: 코드 복잡도 분석 및 단순화 제안 (Boris Cherny code-simplifier 스타일)
---

# 코드 단순화 워크플로우

이 커맨드는 코드 복잡도를 분석하고 단순화 방안을 제안합니다.
Boris Cherny가 사용하는 code-simplifier 서브에이전트와 동일한 기능을 제공합니다.

## 분석 대상

### 파일 지정 시
```
/simplify-code src/hooks/useNotifications.ts
```

### 디렉토리 지정 시
```
/simplify-code src/services/
```

### 최근 변경된 파일
```
/simplify-code --recent
```

## 분석 항목

### 1. 함수 복잡도
- **긴 함수**: 50줄 이상 함수 식별
- **깊은 중첩**: 3단계 이상 들여쓰기
- **많은 매개변수**: 4개 이상 파라미터

### 2. 중복 코드
- 유사한 코드 블록 탐지
- 추출 가능한 공통 로직 식별
- 중복 타입 정의 확인

### 3. 복잡한 조건문
- 복잡한 조건 표현식
- 중첩된 삼항 연산자
- 긴 switch/case 문

### 4. React 특화 분석
- 불필요한 리렌더링 패턴
- useMemo/useCallback 최적화 기회
- 컴포넌트 분리 필요성

## 리포트 형식

```markdown
## 코드 복잡도 분석 결과

### 📊 요약
| 지표 | 값 | 상태 |
|------|-----|------|
| 평균 함수 길이 | X줄 | ✅/⚠️ |
| 최대 중첩 깊이 | X단계 | ✅/⚠️ |
| 중복 코드 | X개 블록 | ✅/⚠️ |

### 🔴 높은 우선순위 (즉시 개선 필요)
1. `functionName` (파일:라인) - 문제 설명
   - 제안: 구체적인 리팩토링 방안

### 🟡 중간 우선순위 (개선 권장)
1. ...

### 🟢 낮은 우선순위 (시간 있을 때)
1. ...
```

## 단순화 전략

### 긴 함수 분리
```typescript
// Before: 100줄 함수
function processData() {
  // 데이터 로드
  // 변환
  // 저장
}

// After: 작은 함수들로 분리
function loadData() { ... }
function transformData() { ... }
function saveData() { ... }
function processData() {
  const data = loadData();
  const transformed = transformData(data);
  return saveData(transformed);
}
```

### 조건문 단순화
```typescript
// Before
if (a && b && c && d) { ... }

// After
const isValidState = a && b && c && d;
if (isValidState) { ... }
```

### 중복 제거
```typescript
// Before: 중복된 에러 처리
try { ... } catch (e) { console.error('Error:', e); }
try { ... } catch (e) { console.error('Error:', e); }

// After: 공통 유틸리티
const handleError = (e: Error) => console.error('Error:', e);
try { ... } catch (e) { handleError(e); }
```

## 자동 적용 옵션

분석 결과에 동의하면 자동 적용을 요청할 수 있습니다:
```
/simplify-code src/hooks/ --apply
```

**주의**: 자동 적용 후 반드시 `/verify-app`을 실행하세요.

## 예시 실행

```
사용자: /simplify-code src/hooks/useNotifications.ts

Claude:
📊 코드 복잡도 분석 중...

## useNotifications.ts 분석 결과

### 🔴 높은 우선순위
1. `monitorStationDelays` (128-228줄) - 함수가 100줄 초과
   - 제안: `checkDelays`, `checkDisruptions` 함수로 분리

### 🟡 중간 우선순위
1. `handleNotificationReceived` (334-365줄) - 중첩 깊이 4단계
   - 제안: early return 패턴 적용

리팩토링을 적용하시겠습니까? (y/n)
```
