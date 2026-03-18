---
allowed-tools: Read, Grep, Glob, Bash(git:*)
description: 코드베이스를 탐색하여 구조를 파악합니다.
argument-hint: [검색어] [--deps] [--scope 경로]
---

# /explore - 코드베이스 탐색

## 0단계: 파라미터 파싱
- 검색어 (필수)
- `--deps`: 의존성 추적 포함
- `--scope 경로`: 탐색 범위 제한

## 1단계: 키워드 확장

| 입력 | 확장 |
|------|------|
| auth | login, logout, session, jwt, token |
| agent | orchestrator, node, graph, langgraph |
| api | endpoint, route, handler, router |
| dashboard | component, page, ui, react |

## 2단계: 초기 탐색

### 파일명 검색
Glob으로 검색어 포함 파일 찾기

### 코드 내용 검색
Grep으로 정의/사용처 찾기

### Git 히스토리
```bash
git log --all --oneline --grep="{검색어}" -10
```

## 3단계: 결과 정리

카테고리별 분류:
- **파일**: 파일명에 검색어 포함
- **정의**: 함수/클래스/타입 정의
- **사용처**: import, 호출, 참조
- **커밋**: 관련 Git 히스토리

## 4단계: 의존성 추적 (--deps)

import/require 체인을 따라가며 의존성 그래프 구축.
