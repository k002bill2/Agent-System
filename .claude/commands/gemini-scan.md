---
description: Gemini CLI로 대규모 코드베이스 분석 실행
---

# Gemini Codebase Scan

Gemini의 1M 토큰 컨텍스트를 활용하여 전체 코드베이스를 분석합니다.

## 인자 형식

`/gemini-scan [scope] [analysis-type]`

- **scope**: `backend` | `frontend` | `full` (기본: full)
- **analysis-type**: `architecture` | `deps` | `dead-code` | `security` (기본: architecture)

## 실행 방법

인자를 파싱하여 다음 명령을 실행하세요:

```bash
node .claude/hooks/gemini-bridge.js scan $ARGUMENTS
```

인자가 없으면 `full architecture`로 실행합니다.

## 분석 유형 설명

| 유형 | 설명 |
|------|------|
| `architecture` | 컴포넌트 의존성, 레이어 분리, API 계약 일관성 |
| `deps` | 순환 import, 미사용 import, 무거운 의존성 |
| `dead-code` | 사용되지 않는 export, 도달 불가 코드 |
| `security` | 인증/인가 갭, 입력 검증, 시크릿 노출 |

## 주의사항

- 대규모 스캔은 최대 180초 소요될 수 있습니다.
- 일일 API 호출 제한(900건)에 포함됩니다.
- 결과는 `.claude/gemini-bridge/reviews/`에 저장됩니다.

실행 결과의 FINDINGS와 RECOMMENDATIONS를 분석하고, priority:high 항목에 대해 구체적인 개선 방안을 제시하세요.
