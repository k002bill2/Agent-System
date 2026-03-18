---
description: 방금 작성한 코드를 보안+품질 검사합니다.
---

# Code Review

커밋되지 않은 변경사항의 보안+품질 리뷰:

1. 변경 파일 수집: `git diff --name-only HEAD`

2. 각 파일 검사:

**Security Issues (CRITICAL):**
- 하드코딩된 자격증명, API 키, 토큰
- SQL 인젝션 취약점
- XSS 취약점
- 입력 검증 누락
- 취약한 의존성
- Path traversal 위험

**Code Quality (HIGH):**
- 함수 50줄 초과
- 파일 800줄 초과
- 네스팅 4단계 초과
- 에러 핸들링 누락
- console.log 문
- TODO/FIXME 주석

**Best Practices (MEDIUM):**
- Mutation 패턴 (immutable 대신)
- 새 코드에 테스트 누락
- 접근성(a11y) 이슈

3. 리포트 생성:
   - 심각도: CRITICAL, HIGH, MEDIUM, LOW
   - 파일 위치 및 줄 번호
   - 이슈 설명 및 수정 제안

4. CRITICAL 또는 HIGH 이슈 있으면 커밋 차단

## 다음 단계

| 리뷰 후 | 커맨드 |
|:--------|:-------|
| 빌드/검증 | `/verify-loop` |
| 커밋 | `/commit-push-pr` |
