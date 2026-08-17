# AOS Workflow Rules

## Skill Routing (필수)
구현 전 반드시 해당 스킬을 Skill 도구로 호출:

| 작업 유형 | 스킬 |
|-----------|------|
| React/UI/컴포넌트 | `react-web-development` |
| 프론트 테스트/커버리지 (Vitest) | `test-automation` |
| 구현 완료 검증 | `verification-loop` |
| 에이전트 평가 | `run-eval` |

백엔드 pytest는 라우팅할 전용 스킬이 없다 — `aos-backend.md`의 Pytest 규칙과 게이트 SSOT `verification-loop`를 따른다.

## 복잡도별 에이전트 수
| 복잡도 | 에이전트 수 | 기준 |
|--------|------------|------|
| Trivial | 0 | 단일 파일, 명확한 수정 |
| Simple | 1 | 2-3 파일, 한 영역 |
| Moderate | 2-3 | UI+API 또는 크로스 영역 |

※ 하네스(`aos-feature-harness`) 사용 시 예외: 표의 수치는 **Phase B 빌드 에이전트 수** 기준이다. 하네스는 여기에 계획·통합QA·테스트·리뷰·문서 전문 에이전트를 추가로 조율하므로 총 스폰 수는 이 표를 초과할 수 있다 (모순 아님).

## 배포 전 검증
게이트 명령의 유일한 정의(SSOT)는 `verification-loop` 스킬이다 — BE(ruff+mypy+pytest)/FE(tsc+lint+vitest run+build) 트랙, 명령·CWD·통과 기준 포함. 배포·커밋 전에는 그 스킬의 Level 2(변경 트랙) 또는 Level 3(PR 전, 두 트랙 전체)를 실행하고 에러 0을 확인한다. 이 문서에 게이트 명령을 복제하지 않는다.

## 리치 스펙 (스펙은 마크다운에 한정하지 않는다)
- UI 스펙: 마크다운 서술 대신 HTML 목업 1장을 첨부한다 — 모델에겐 분석 가능한 코드, 사람에겐 보이는 화면.
- 동작 스펙: 실패하는 테스트가 곧 요구사항(spec-as-test). 포팅·마이그레이션은 참조 구현("이 함수와 똑같이 동작")을 지정한다.
- 리뷰 기준이 주관적이면 루브릭(`.claude/evals/rubrics/` 형식)을 스펙에 첨부해 검증 에이전트가 채점하게 한다.

## Dev Docs 3-파일 시스템
대규모 작업 시:
```
dev/active/[task-name]/
├── [task-name]-plan.md
├── [task-name]-context.md
└── [task-name]-tasks.md    # YAML frontmatter + 체크박스 본문
```
워크플로우: `/dev-docs` → 구현 → `/update-dev-docs` → `/compact`

`tasks.md` 자동 실행 (frontmatter 필수, 없으면 migrate 먼저):
```
src/backend/.venv/bin/python scripts/phase_runner.py migrate  dev/active/<phase>
src/backend/.venv/bin/python scripts/phase_runner.py validate dev/active/<phase>
/execute-tasks-file dev/active/<phase>     # 웨이브 순차 + 태스크 병렬 실행
```
실행기는 `superpowers:dispatching-parallel-agents`로 디스패치하고, 각 웨이브 완료 후 체크박스를 동기화하며, 모든 웨이브 종료 시 `verification-loop`를 호출한다. `gsd:execute-phase`와 병행 가능.

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
