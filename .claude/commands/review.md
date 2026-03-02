---
name: review
description: 코드 리뷰 자동화 - 변경된 파일 분석
---

# Code Review

Git diff를 기반으로 변경된 코드를 자동 리뷰합니다.

## 실행 단계

### 1. 변경사항 수집

```bash
# Staged 변경사항
git diff --cached --name-only

# Unstaged 변경사항
git diff --name-only

# 특정 브랜치와 비교
git diff main...HEAD --name-only
```

### 2. 파일별 분석

각 변경된 파일에 대해:

#### TypeScript/TSX 파일
- [ ] `any` 타입 사용 여부
- [ ] useEffect cleanup 함수 존재
- [ ] 명시적 반환 타입
- [ ] console.log 남아있는지
- [ ] 에러 처리 패턴

#### 서비스 파일
- [ ] API 호출 에러 처리
- [ ] 적절한 타입 정의
- [ ] 비동기 작업 정리

#### 컴포넌트 파일
- [ ] Props 타입 정의
- [ ] 메모이제이션 적절성
- [ ] 접근성 속성

### 3. 리뷰 점수 계산

카테고리별 점수:
- **타입 안전성**: 0-25점
- **에러 처리**: 0-25점
- **코드 품질**: 0-25점
- **성능**: 0-25점

### 4. 개선 제안

우선순위별 개선 사항 정리.

## 출력 형식

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 CODE REVIEW REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Overall Score: 85/100

📁 Files Reviewed: 5

┌─────────────────────────────────────┐
│ Category          │ Score │ Status │
├─────────────────────────────────────┤
│ Type Safety       │ 22/25 │ ✅     │
│ Error Handling    │ 20/25 │ ✅     │
│ Code Quality      │ 23/25 │ ✅     │
│ Performance       │ 20/25 │ ✅     │
└─────────────────────────────────────┘

🔴 Critical Issues (1):
• src/hooks/useData.ts:45 - Missing cleanup in useEffect

🟡 Suggestions (3):
• src/components/Card.tsx:12 - Consider React.memo
• src/services/api.ts:78 - Add retry logic
• src/utils/format.ts:23 - Remove console.log

✅ Good Practices Found:
• Consistent typing across components
• Proper error boundaries
• Good separation of concerns

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 빠른 수정

```bash
# 자동 수정 가능한 이슈
npm run lint -- --fix
npx prettier --write .
```
