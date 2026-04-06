# Agent Orchestration Service (AOS)

## What This Is
LangGraph 기반 멀티 에이전트 오케스트레이션 서비스.
Claude Code 설정과 실제 시스템 소스 코드를 함께 관리하는 하이브리드 모노레포.

## Core Value
Claude Code 에이전트가 체계적으로 협업하여 복잡한 개발 작업을 자율 수행.

## Context
상세 문서: `CLAUDE.md`, `docs/architecture.md`, `docs/features.md` 참조.
Power Stack 통합 완료 (GSD+Superpowers+Gstack 글로벌 설치).

## Constraints
- CLAUDE.md 200줄 이하 유지
- DRY, KISS, YAGNI, Immutability 원칙
- TDD: RED → GREEN → IMPROVE, 80%+ 커버리지

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Power Stack 3-Layer 도입 | GSD+Superpowers+Gstack 워크플로우 통합 | Adopted |
| .planning/ 사용 | GSD 기존 구조 활용 (.gsd/states/ 대신) | Adopted |
| .superpowers/specs/ 미생성 | 글로벌 플러그인으로 충분 (YAGNI) | Adopted |
