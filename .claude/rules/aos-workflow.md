# AOS Workflow Rules

## Skill Routing (필수)
구현 전 반드시 해당 스킬을 Skill 도구로 호출:

| 작업 유형 | 스킬 |
|-----------|------|
| React/UI/컴포넌트 | `react-web-development` |
| 테스트/커버리지 | `test-automation` |
| 구현 완료 검증 | `verification-loop` |
| 에이전트 평가 | `run-eval` |

## 복잡도별 에이전트 수
| 복잡도 | 에이전트 수 | 기준 |
|--------|------------|------|
| Trivial | 0 | 단일 파일, 명확한 수정 |
| Simple | 1 | 2-3 파일, 한 영역 |
| Moderate | 2-3 | UI+API 또는 크로스 영역 |

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

## 평가 시스템
에이전트 성능 평가:
- `/run-eval` 스킬로 실행 (`.claude/skills/run-eval/`)
- `eval-task-runner`: 태스크 실행 및 pass@k 계산
- `eval-grader`: 코드 검사 + LLM 루브릭 채점
- 태스크: `.claude/evals/tasks/`, 루브릭: `.claude/evals/rubrics/`
