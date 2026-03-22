---
name: verify-frontend
description: >
  React/TypeScript/Tailwind 프론트엔드 패턴 검증. 컴포넌트 구현 후, PR 전 사용.
  Use when: (1) React 컴포넌트를 새로 생성/수정한 후, (2) Dashboard PR 생성 전,
  (3) 프론트엔드 코드 리뷰 시
---

# 프론트엔드 패턴 검증

검증 스크립트를 실행하여 5개 항목을 자동 검사:

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

## 관련 파일

| 경로 | 용도 |
|------|------|
| `src/dashboard/src/components/**/*.tsx` | React 컴포넌트 |
| `src/dashboard/src/pages/**/*.tsx` | 페이지 컴포넌트 |
| `src/dashboard/src/stores/**/*.ts` | Zustand 스토어 |
| `.claude/rules/aos-frontend.md` | 프론트엔드 규칙 원본 |
