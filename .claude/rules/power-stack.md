# Power Stack Integration (GSD + Superpowers + Gstack)

## 3-Layer 구조
- **GSD** (워크플로우): 프로젝트 라이프사이클 관리 → `.planning/`
- **Superpowers** (스킬 강화): 개별 작업 품질 향상 → 글로벌 플러그인
- **Gstack** (페르소나): 역할 기반 관점 오버레이 → `.gstack/personas/`

## 통합 규칙
1. 새 프로젝트/마일스톤: `/gsd:new-project` → `.planning/` 초기화
2. 페이즈 실행 시: GSD 워크플로우 + Superpowers 스킬 + Gstack 페르소나 조합
3. 페르소나 활성화 기준:
   - 계획/설계 단계: `Engineer_Manager` 관점 적용
   - 테스트/검증 단계: `QA_Lead` 관점 적용
4. `.planning/STATE.md`가 세션 간 컨텍스트의 단일 진실 소스
5. Superpowers는 항상 글로벌 버전 사용 (로컬 복제 금지)

## 라우팅 매트릭스

| 작업 유형 | GSD | Superpowers | Gstack 페르소나 |
|-----------|-----|-------------|----------------|
| 프로젝트 초기화 | `new-project` | `brainstorming` | Engineer_Manager |
| 페이즈 계획 | `plan-phase` | `writing-plans` | Engineer_Manager |
| 구현 실행 | `execute-phase` | `executing-plans` | - |
| 테스트 | `add-tests` | `test-driven-development` | QA_Lead |
| 검증 | `verify-work` | `verification-before-completion` | QA_Lead |
| 코드 리뷰 | - | `requesting-code-review` | QA_Lead |
| 디버깅 | `debug` | `systematic-debugging` | - |
| 마일스톤 감사 | `audit-milestone` | - | Engineer_Manager |

## 페르소나 vs 에이전트
- **페르소나** (`.gstack/personas/`): 관점 오버레이 — "누구의 시각으로 평가할 것인가"
- **에이전트** (`.claude/agents/`): 실행 단위 — "누가 작업을 수행할 것인가"
- 동일 작업에 페르소나와 에이전트를 동시 적용 가능
