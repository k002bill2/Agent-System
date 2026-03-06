---
description: "E2E 자동화 파이프라인 - feature/bugfix/refactor 모드 자동 감지"
---

# /auto Pipeline

$ARGUMENTS 를 분석하여 아래 파이프라인을 자동 실행합니다.

## Step 1: 모드 감지

입력에서 키워드를 분석하여 모드를 결정합니다:

- **bugfix** 모드: `fix`, `bug`, `error`, `broken`, `crash`, `regression` 키워드 포함
- **refactor** 모드: `refactor`, `clean`, `simplify`, `reorganize`, `extract` 키워드 포함
- **feature** 모드 (기본): 위 키워드가 없는 경우

감지된 모드를 사용자에게 알려주세요: `[/auto] 모드: {mode} | 요청: {summary}`

## Step 2: Plan

1. 요청 범위 분석 (관련 파일, 영향 범위)
2. 복잡도 판단:
   - **Trivial**: 단일 파일, 명확한 수정 → TDD 스킵 가능
   - **Simple**: 2-3 파일, 한 영역
   - **Moderate**: UI+API 또는 크로스 영역 → 서브에이전트 고려
   - **Complex**: 풀스택 → 서브에이전트 필수
3. 스킬 라우팅 결정 (React → `react-web-development`, 테스트 → `test-automation` 등)

## Step 3: TDD (feature/bugfix 모드)

- **feature**: 예상 동작에 대한 실패 테스트 먼저 작성
- **bugfix**: 버그를 재현하는 실패 테스트 먼저 작성
- **refactor**: 이 단계 스킵 (기존 테스트가 가드레일)
- Trivial 복잡도면 이 단계 스킵 가능

테스트 실행하여 실패 확인: `npm test` 또는 `pytest`

## Step 4: Implement

1. 해당 스킬을 Skill 도구로 호출 (스킬 라우팅에 따라)
2. 구현 수행
   - Moderate+ 복잡도: 서브에이전트 위임 고려
   - 스킬의 가이드라인을 따를 것
3. 구현 완료 후 Step 3의 테스트가 통과하는지 확인

## Step 5: Self-Review

```bash
git diff --stat
git diff
```

변경사항 셀프 리뷰:
- 불필요한 변경은 없는가?
- 코드 품질은 적절한가?
- 타입 안전성은 유지되는가?
- 보안 이슈는 없는가?

## Step 6: Verify

순서대로 실행하고, 각 단계 통과 확인:

**Frontend 변경 시:**
```bash
cd src/dashboard && npx tsc --noEmit
cd src/dashboard && npm run lint
cd src/dashboard && npm test -- --run
cd src/dashboard && npm run build
```

**Backend 변경 시:**
```bash
cd src/backend && python -m ruff check .
cd src/backend && pytest ../../tests/backend --tb=short
```

**실패 시 가드레일:**
- 1차 실패: 에러 분석 후 수정 시도
- 2차 실패 (같은 에러): **멈추고 사용자에게 보고** (근본 원인 분석 포함)
- 절대 같은 전략 3회 반복 금지

## Step 7: Commit

모든 검증 통과 후:

1. 변경 파일 구체적으로 스테이징: `git add <specific files>`  (`git add .` 금지)
2. Conventional Commit 메시지 작성:
   - `feat(scope): description` (feature)
   - `fix(scope): description` (bugfix)
   - `refactor(scope): description` (refactor)
3. 커밋 실행

**주의**: push/PR은 자동으로 하지 않음. 사용자가 `/commit-push-pr`로 별도 요청.

## Step 8: Sync (선택)

해당하는 경우에만:
- Dev Docs 활성화 상태면 `/update-dev-docs` 실행
- 스킬/에이전트/커맨드 변경 시 레지스트리 동기화 고려
- Agent Memory: 주목할 학습이 있으면 해당 에이전트의 learnings.md에 기록

---

## 요약

```
[모드 감지] → [Plan] → [TDD] → [Implement] → [Review] → [Verify] → [Commit] → [Sync]
                         ↑                                    |
                         └── 실패 시 1회 재시도 ──────────────┘
```
