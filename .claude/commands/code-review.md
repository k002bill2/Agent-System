---
description: 방금 작성한 코드를 보안+품질 검사합니다.
---

# Code Review

커밋되지 않은 변경(`git diff HEAD`)을 네이티브 `/code-review`(버그·품질, `--fix` 지원)와 `/security-review`로 검사한다 — 다중 에이전트·confidence 채점으로 수동 체크리스트보다 정교하다.

## 프로젝트 게이트 (네이티브 리뷰 위에 추가 적용)

- **임계값(HIGH):** 함수 50줄 / 파일 800줄 / 네스팅 4단계 초과 시 지적
- **커밋 차단:** CRITICAL 또는 HIGH 이슈가 있으면 커밋하지 않는다

## 다음 단계

| 리뷰 후 | 커맨드 |
|:--------|:-------|
| 빌드/검증 | `/verify-loop` |
| 커밋 | `/commit-push-pr` |
