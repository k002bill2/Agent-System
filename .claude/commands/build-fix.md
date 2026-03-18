---
allowed-tools: Bash(npm:*), Bash(npx:*), Bash(python:*), Read, Edit, Grep, Glob
description: 빌드 에러를 점진적으로 수정합니다.
argument-hint: [--backend|--dashboard|--all]
---

# Build Fix

빌드 에러를 최소 변경으로 점진적 수정합니다.

## 1단계: 프로젝트 감지 & 빌드 실행

| 옵션 | 대상 | 빌드 명령 |
|------|------|----------|
| `--backend` | Python Backend | `cd src/backend && python -m py_compile api/app.py` |
| `--dashboard` | React Dashboard | `cd src/dashboard && npx tsc --noEmit` |
| `--all` | 전체 | 위 둘 다 실행 |
| (기본) | 변경 파일 기반 자동 감지 | |

## 2단계: 에러 수집 & 분류

빌드 명령 실행 후 에러를 분류:
- 타입 추론 오류
- 정의 누락
- import/export 오류
- 설정 오류

## 3단계: 점진적 수정

각 에러를 최소 변경으로 수정:
- 타입 어노테이션 추가
- null 체크 추가
- import 수정
- 의존성 설치

## 4단계: 검증

```bash
# 수정 후 재빌드
[빌드 명령] → exit code 0 확인
```

## 규칙

- 최소 diff로 수정 (리팩토링 금지)
- 로직 변경 금지 (빌드 에러 수정만)
- 각 수정 후 진행 상황 출력: "X/Y 에러 수정됨"
- 아키텍처 변경 금지
