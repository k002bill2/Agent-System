---
description: LLM 모델 레지스트리 갱신 (신모델 추가/가격/context/default) — update-llm-models 스킬 실행.
argument-hint: [모델 ID] [가격 $/1M in/out] [context window] [--make-default]
---

# Update LLM Models

Skill 도구로 `update-llm-models` 스킬을 호출하여 AOS LLM 모델 레지스트리 갱신 절차를 실행합니다.

## 사용법

```
/update-llm-models <모델 ID> [가격] [context] [--make-default]
```

예: `/update-llm-models claude-sonnet-5 $3/$15 1M --make-default`

## 동작

1. Skill 도구 호출: `skill: "update-llm-models"`, `args: "$ARGUMENTS"`
2. 스킬 절차(스펙 확정 → SSOT `_MODELS` → 가격표 매트릭스(provider별) → 프론트 미러 → 테스트 → 게이트 → 문서 → Codex 리뷰)를 그대로 따른다. 구현은 worker 위임, 검증은 `/codex:review`.
3. 인자가 비어 있으면 스킬 0단계(신모델 스펙 확정)부터 시작 — 모델 ID·가격·context를 공식 소스로 확인한다.

## 경계

- 이미 등록된 **enabled 모델** 간 **default만 전환**하는 요청이면 이 커맨드 불필요 — `PATCH /api/llm/models/{id}` body `{"is_default": true}` (또는 Settings → LLM Access 카드) 안내로 충분.
- 단, **disabled 모델**을 default로 만들려는 경우는 `is_default`만 세워서는 안 된다 — `get_default()`가 enabled 모델만 검색하므로 실제 default로 동작하지 않는다. 가격 검증 후 `is_enabled: true`를 함께 처리하도록 안내하라.
