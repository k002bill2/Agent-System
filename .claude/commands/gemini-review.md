---
description: Gemini CLI로 현재 코드 변경사항 크로스 리뷰 실행
---

# Gemini Cross-Review

Gemini CLI를 사용하여 현재 코드 변경사항을 크로스 리뷰합니다.

## 실행 방법

다음 명령을 실행하세요:

```bash
node .claude/hooks/gemini-bridge.js review $ARGUMENTS
```

## 결과 해석

- **VERDICT: approve** → 크로스파일 이슈 없음
- **VERDICT: needs-attention** → 이슈 목록 확인 후 대응 필요

## 주의사항

- Gemini는 읽기 전용입니다. 파일을 직접 수정하지 않습니다.
- 결과는 `.claude/gemini-bridge/reviews/`에 JSON으로 저장됩니다.
- 일일 900건 API 호출 제한이 있습니다.
- 리뷰 결과의 이슈 중 `severity:critical`이면 반드시 확인하세요.

실행 결과를 분석하고, critical/warning 이슈가 있으면 해당 파일을 확인하여 대응 방안을 제시하세요.
