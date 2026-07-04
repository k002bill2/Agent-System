# CLI Subscription LLM Usage Plan

**Status:** Approved to start with documentation first
**Date:** 2026-07-02

## Goal

Agent-System의 LLM 실행과 사용량 추적을 API key billing 중심에서 CLI subscription entitlement 중심으로 전환한다.

## Confirmed Direction

1. 1차 provider 범위는 `codex_cli` 기본 런타임과 `claude -p` Task Analyzer 실행 계측이다.
2. API fallback은 기본 비활성화한다. admin/manager가 명시적으로 허용한 경우만 사용한다.
3. 1차 Docker 배포는 단일 CLI profile을 공유하되, AOS 내부에서 user/org별 사용량을 분리한다.
4. External Usage의 primary source는 provider billing API가 아니라 내부 `LLMUsageLedger`이다.
5. 기존 API key UI는 삭제하지 않고 Advanced / API fallback 영역으로 격하한다.

## Implementation Phases

1. 문서화
   - `docs/architecture/llm-runtime-usage.md`
   - `docs/architecture/cli-subscription-llm.md`
   - `docs/plans/cli-subscription-usage-monitoring.md`
2. DB 모델 추가
   - `UserLLMEntitlement`
   - `LLMCLIProfile`
   - `LLMUsageLedger`
3. Backend runtime resolver 추가
   - provider/mode/user/org/source 결정
   - CLI first, API fallback gated
4. Usage ledger 계측
   - Playground
   - Task Analyzer
   - Git draft commits
   - Session/orchestrator
   - tmux/Claude CLI execution
   - proxy/API fallback
5. Settings / External Usage UI 전환
   - Settings: LLM Access 중심
   - External Usage: internal ledger summary 중심
6. 검증 및 마이그레이션
   - 기존 admin usage key collector는 optional reconciliation로 유지
   - backend/frontend focused tests 후 `/check-health`

## Blocking Decisions Deferred

- provider별 CLI 구독권의 다중 사용자 위임 약관 확인
- 사용자별 CLI profile 격리 방식
- CLI별 정확한 token metadata 파싱 가능 여부
