---
title: "Model policy guards and execution attribution"
tags: [llm, playground, fallback, registry, regression]
status: active
created: 2026-08-31
---

# 목적

Buzz 검토와 `AGENT_SYSTEM_MODEL_ALIAS_CODE_EVIDENCE.md`,
`AGENT_SYSTEM_MODEL_POLICY_ISSUE_372_373_VERIFICATION.md`의 코드 근거를 반영해,
모델 자동 업데이트를 새 alias UI로 확장하기 전에 현재 안전성 결함을 최소 범위로
수정한다. 기본 브랜치에는 변경하지 않고 이 전용 worktree에서만 구현한다.

# 범위

1. **실행 게이트**: disabled/미등록 모델이 인증된 runtime resolver와 직접 LLM 생성
   경로를 우회해 실행되지 않도록 한다. DB discovery 모델은 registry에 있고 enabled인
   경우 실제 runtime config로 실행 가능해야 한다.
2. **fallback 무변이**: stale 모델 fallback은 해당 실행의 retry에만 적용한다.
   `PlaygroundSession.model`을 성공 전/후에 자동 재작성하지 않는다. 실패한 fallback
   target도 세션에 영구 저장되지 않아야 한다.
3. **실행 단위 귀속**: `PlaygroundExecution`에 요청 모델과 실제 성공 모델을 기록한다.
   기존 JSON 파일/DB JSON 컬럼과 backward compatibility를 유지하며 DB migration은
   만들지 않는다.
4. **stream parity**: non-tools streaming도 첫 출력 전 inaccessible model 오류 시
   동일한 fallback을 적용한다. 이미 출력한 뒤 오류가 나면 중복 재시도하지 않고
   실패를 유지한다. tools/non-tools 모두 resolved model을 사용해 비용을 계산한다.
5. **registry sync 승격 차단**: 이미 해당 provider의 DB 모델 행이 있으면, code
   registry의 새 `is_default=True` 모델을 12시간 sync가 자동 default로 승격하지
   않는다. 완전히 초기화된 provider의 bootstrap default만 예외로 둔다. disabled
   기존 default가 있는 경우에도 기존 관리자 결정을 덮지 않는다.

# 제외 범위

- 실제 품질 골든셋, shadow/canary, 자동 승격 workflow 구축
- 신규 alias UI/API 설계 및 기존 세션을 alias-follow로 일괄 전환
- provider discovery 대상 확대
- 배포, DB 데이터 변경, Git commit/push/PR/merge

# 예상 변경 파일

- `src/backend/services/llm_runtime_resolver.py`
- `src/backend/services/llm_service.py`
- `src/backend/services/playground_service/llm.py`
- `src/backend/services/playground_service/service.py`
- `src/backend/models/playground.py`
- `src/backend/models/llm_models.py`
- 관련 `tests/backend/test_*.py`

# 수용 기준

- disabled requested model은 resolver에서 `LLMRuntimeResolutionError`가 발생한다.
- DB-only + enabled registry model은 `_get_llm`이 legacy static map 부재만으로
  `Unknown model`을 내지 않고 registry metadata로 build한다.
- fallback 성공 후 `session.model`은 원래 requested model 그대로이며, execution에는
  requested/resolved model이 각각 남는다.
- fallback target 자체가 build 불가능하면 실패를 세션 모델로 commit하지 않는다.
- non-tools stream stale model은 fallback 성공 시 정상 결과와 resolved model 비용을
  사용하고, 첫 chunk 이후 오류는 재시도하지 않는다.
- startup sync는 disabled 기존 default를 새 code default로 자동 교체하지 않는다.
- 직접 추가한 regression test가 먼저 RED가 되고, GREEN 뒤 backend 전체 테스트를
  `cd src/backend && uv run pytest ../../tests/backend -v --tb=short`로 실행한다.
- 테스트·정적 검토 외에 runtime 적용, 배포, 원격 쓰기는 하지 않는다.

# Developer 지시

엄격한 TDD로 한 vertical slice씩 진행한다. 먼저 현재 테스트와 관련 호출 경로를
읽고 각 acceptance criterion을 재현하는 failing test를 추가한 뒤, 최소 구현을 한다.
기존 테스트의 정책 기대값이 새 안전선과 충돌하면 이유를 명시해 갱신하되, unrelated
refactor는 하지 않는다. 모든 변경 파일·명령·결과를 보고하고, commit/push는 하지
말고 worktree를 남긴다. `ultrathink`로 fallback async-generator 경계와 persistence
경로를 특히 검토한다.

# Security review 계약

변경 후 별도 관점에서 disabled model bypass, entitlement/provider mismatch,
fallback retry loop, session poisoning, usage/cost misattribution, DB sync race,
정보 노출을 읽기 전용으로 검토한다. 독립 보안 검토가 끝나기 전에는 완료로 판정하지
않는다.

# 후속 구현 범위 — 2026-09-01 승인
Buzz 최종 검토의 권고 중 외부 provider 호출·canary·배포 없이 검증 가능한 안전 범위만
진행한다. 기본 브랜치와 runtime은 변경하지 않는다.

1. Playground 세션 생성·수정 시 Registry에 존재하고 enabled인 모델만 저장한다.
   기존 세션 로딩 및 legacy 데이터 호환은 보존하며, 거부는 원자적으로 처리한다.
2. `get_default()`의 암묵적인 첫 enabled 모델 선택을 deterministic fail-closed 정책으로
   바꿀지 현재 호출부·기존 테스트를 확인하고, 호환성 영향이 크면 명시적 fallback을
   추가한다. provider별 기본값 충돌이 조용히 숨겨지지 않아야 한다.
3. stream generator가 cancellation·client disconnect·초기화 예외에서도 RUNNING
   execution을 남기지 않도록 최소 수정하고, 정상·실패·취소 상태 및 resolved model
   귀속을 테스트한다.
4. alias/concrete 모델과 registry revision 등 계측은 기존 JSON/DB schema를 깨지 않는
   optional metadata로 설계한다. 실제 provider 응답을 확인하지 못한 모델은 자동
   승격하지 않는다.
5. code seed에서 `gpt-5.5`를 즉시 enabled로 두지 않도록 되돌리고, Anthropic 기본값은
   기존 검증된 `claude-sonnet-5`로 복원한다. `gpt-5.6` alias 및 `gemini-3.7-flash`
   기본 승격은 live smoke 전까지 보류한다.

# 후속 수용 기준
- 신규/수정 세션에 disabled·unknown 모델을 저장하려 하면 명확한 검증 오류가 나고,
  기존 세션의 다른 설정은 변경되지 않는다.
- provider별 code default가 하나만 존재하며, 기본값이 없을 때 순서 의존적인 모델을
  조용히 선택하지 않는다.
- stream 취소·예외 뒤 반환/영속화되는 execution은 RUNNING이 아니며, 성공 시 실제
  resolved model을 기록한다.
- 후속 회귀 테스트는 각 구현 전에 RED, 구현 후 GREEN을 실제 실행으로 확인한다.
- backend 전체 테스트 `cd src/backend && uv run pytest ../../tests/backend -v --tb=short`
  및 가능한 정적 검사를 실행한다.
- commit, push, PR, merge, DB 데이터 변경, runtime 재기동, 외부 provider smoke,
  자동 승격은 실행하지 않는다.
