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

## e2e 테스트 잔여물 방지
- `afterAll`/`afterEach`에서 생성된 리소스(파일, 프로세스, DB 데이터) 정리 필수
- 임시 파일은 OS temp 디렉토리 또는 `.gitignore`된 경로에 생성
- 브라우저/프로세스는 테스트 종료 시 반드시 kill
- DB 테스트 데이터는 트랜잭션 롤백 또는 teardown으로 제거
- 스크린샷/녹화는 CI 아티팩트로만 보관, 로컬에 남기지 않음
- 테스트 실행 후 `git status`에 untracked 파일이 생기면 안 됨

## 평가 시스템
에이전트 성능 평가:
- `/run-eval` 스킬로 실행 (`.claude/skills/run-eval/`)
- `eval-task-runner`: 태스크 실행 및 pass@k 계산
- `eval-grader`: 코드 검사 + LLM 루브릭 채점
- 태스크: `.claude/evals/tasks/`, 루브릭: `.claude/evals/rubrics/`
