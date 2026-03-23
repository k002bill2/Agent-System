---
name: verify-frontend
description: "Use when verifying React/TypeScript/Tailwind patterns after component creation or modification, before Dashboard PR, or during frontend code review. Checks memo/displayName, TypeScript any, inline styles, accessibility, and dark mode."
allowed-tools: Bash, Grep, Glob, Read
---

# Verify Frontend

## Overview

React 컴포넌트의 5가지 필수 패턴(memo/displayName, TypeScript any, 인라인 스타일, 접근성, 다크모드)을 자동 검증하는 스킬. 컴포넌트 생성/수정 후 또는 PR 전에 실행한다.

## 검증 실행

```bash
bash scripts/verify.sh
```

## 검사 항목

1. **memo() / displayName** — export 컴포넌트에 `memo()` 래핑 필수
2. **TypeScript any 금지** — `unknown` + type guard 사용
3. **인라인 스타일 금지** — Tailwind 전용 (`style={{}}` 불가)
4. **접근성** — 인터랙티브 요소에 `aria-label` 필수
5. **다크모드** — 라이트 색상(`bg-white` 등)에 `dark:` 대응 필수

## 출력 형식

| # | 검사 항목 | 상태 | 이슈 수 |
|---|-----------|------|---------|
| 1 | memo/displayName | PASS/FAIL | N |
| 2 | TypeScript any | PASS/FAIL | N |
| 3 | 인라인 스타일 | PASS/FAIL | N |
| 4 | 접근성 (aria) | PASS/FAIL | N |
| 5 | 다크모드 | PASS/FAIL | N |

## 예외 (위반 아님)

- **테스트 파일** (`*.test.tsx`, `*.spec.tsx`) — any, memo 미적용 허용
- **타입 정의** (`*.d.ts`) — 외부 라이브러리 호환용 any 허용
- **SVG/아이콘 컴포넌트** — 단순 래퍼는 memo/displayName 면제
- **동적 스타일** — 런타임 계산 필요 시 인라인 스타일 허용 (transform, width 등)
- **서드파티 래퍼** — 외부 라이브러리 props 전달 시 any 허용

## Common Mistakes

| 실수 | 수정 |
|------|------|
| 테스트 파일에서 FAIL 보고 | 예외 목록 확인 — 테스트 파일은 면제 |
| `displayName` 없이 `memo()` 적용 | 반드시 `Component.displayName = 'Component'` 추가 |
| `bg-gray-100` 사용 후 dark 미대응 | `dark:bg-gray-800` 등 대응 클래스 추가 |
| `onClick` 있는 `div` 사용 | `button` 시맨틱 태그로 변경 + `aria-label` |
| 동적 값에 Tailwind 강제 | `transform`, `width` 등 런타임 값은 인라인 예외 |

## References

| 경로 | 용도 |
|------|------|
| `src/dashboard/src/components/**/*.tsx` | React 컴포넌트 |
| `src/dashboard/src/pages/**/*.tsx` | 페이지 컴포넌트 |
| `src/dashboard/src/stores/**/*.ts` | Zustand 스토어 |
| `.claude/rules/aos-frontend.md` | 프론트엔드 규칙 원본 |
