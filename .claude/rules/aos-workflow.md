# AOS Workflow Rules

## Skill Routing (필수)
구현 전 반드시 해당 스킬을 Skill 도구로 호출:

| 작업 유형 | 스킬 |
|-----------|------|
| React/UI/컴포넌트 | `react-web-development` |
| 테스트/커버리지 | `test-automation` |
| 병렬 에이전트 (3+) | `parallel-coordinator` |
| 구현 완료 검증 | `verification-loop` |
| 스킬/에이전트/커맨드 생성 | `skill-creator`, `subagent-creator`, `hook-creator`, `slash-command-creator` |
| ACE 거버넌스 | `ace-framework` |

## 복잡도별 에이전트 수
| 복잡도 | 에이전트 수 | 기준 |
|--------|------------|------|
| Trivial | 0 | 단일 파일, 명확한 수정 |
| Simple | 1 | 2-3 파일, 한 영역 |
| Moderate | 2-3 | UI+API 또는 크로스 영역 |
| Complex | 3+ | 풀스택, 아키텍처 변경 |

## 배포 전 검증 체크리스트
1. `tsc --noEmit` (TypeScript 타입 체크)
2. `lint` (ESLint/ruff)
3. `pytest` / `npm test` (테스트)
4. `npm run build` (빌드)
5. 에러 0 확인 후 커밋

## Dev Docs 3-파일 시스템
대규모 작업 시:
```
dev/active/[task-name]/
├── [task-name]-plan.md
├── [task-name]-context.md
└── [task-name]-tasks.md
```
워크플로우: `/dev-docs` → 구현 → `/update-dev-docs` → `/compact`
