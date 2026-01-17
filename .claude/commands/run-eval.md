---
description: AI 에이전트 평가 태스크 실행 및 pass@k 지표 계산
allowed-tools: read, grep, glob, bash, task
---

# AI Agent Evaluation Runner

AI 에이전트의 성능을 체계적으로 평가하고 pass@k 지표를 계산합니다.

## 사용법

```bash
# 단일 태스크 평가
/run-eval task_ui_001

# 카테고리별 평가
/run-eval --category ui_component
/run-eval --category service
/run-eval --category bug_fix

# 전체 평가
/run-eval --all

# k번 반복 실행 (pass@k 계산)
/run-eval task_ui_001 --k=3
/run-eval --all --k=3

# 특정 에이전트로 실행
/run-eval task_ui_001 --agent=mobile-ui-specialist
```

## 실행 단계

### 1. 태스크 로드
`$ARGUMENTS`에서 태스크 ID 또는 옵션을 파싱합니다:

```markdown
## 인자 파싱

입력: $ARGUMENTS

- task_id: 특정 태스크 ID (예: task_ui_001)
- --category: 카테고리 필터 (ui_component, service, bug_fix, refactor)
- --all: 모든 태스크 실행
- --k: 반복 횟수 (기본값: 1)
- --agent: 특정 에이전트 지정 (선택)
```

### 2. 태스크 정의 로드
`.claude/evals/tasks/` 디렉토리에서 YAML 파일을 읽습니다:

```bash
# 단일 태스크
cat .claude/evals/tasks/task_ui_001.yaml

# 카테고리별
grep -l "category: ui_component" .claude/evals/tasks/*.yaml

# 전체
ls .claude/evals/tasks/*.yaml | grep -v schema | grep -v _templates
```

### 3. 평가 실행
eval-task-runner 에이전트를 호출하여 평가를 실행합니다:

```markdown
Task(eval-task-runner):
  task_id: task_ui_001
  k: 3
  agent: mobile-ui-specialist (optional)
```

### 4. 결과 저장
`.claude/evals/results/{date}/` 디렉토리에 결과를 저장합니다.

### 5. 요약 출력

```markdown
# 평가 결과: task_ui_001

## 실행 요약
| 실행 | 점수 | 결과 | 소요시간 |
|------|------|------|----------|
| Run 1 | 0.85 | PASS | 8m 12s |
| Run 2 | 0.72 | PASS | 11m 45s |
| Run 3 | 0.65 | FAIL | 15m 00s |

## 지표
- **pass@1**: 1.00 (첫 시도 성공)
- **pass@3**: 1.00 (3번 중 1회 이상 성공)
- **pass^3**: 0.67 (3번 모두 성공 확률)
- **평균 점수**: 0.74
- **성공률**: 66.7%

## 상세 피드백
### 코드 검사 (40%)
- ✅ 파일 존재: src/components/station/StationCard.tsx
- ✅ 테스트 존재: StationCard.test.tsx
- ✅ any 타입 없음
- ⚠️ 접근성 레이블 일부 누락

### LLM 평가 (60%)
- 가독성: 4/5
- 아키텍처: 5/5
- 유지보수성: 4/5
- 성능: 3/5 (memo 미사용)
- 보안: 5/5

## 개선 제안
1. 모든 TouchableOpacity에 accessibilityLabel 추가
2. 성능 최적화를 위해 React.memo() 적용 고려
```

## 명령어 처리 로직

```typescript
// 인자 파싱
const args = parseArguments($ARGUMENTS);

if (args.taskId) {
  // 단일 태스크 평가
  await runSingleTask(args.taskId, args.k || 1);
} else if (args.category) {
  // 카테고리별 평가
  const tasks = await getTasksByCategory(args.category);
  await runBatchEvaluation(tasks, args.k || 1);
} else if (args.all) {
  // 전체 평가
  const tasks = await getAllTasks();
  await runBatchEvaluation(tasks, args.k || 1);
} else {
  // 사용법 안내
  showUsage();
}
```

## 출력 형식

### 단일 태스크
위의 상세 결과 형식으로 출력

### 배치 평가
```markdown
# 배치 평가 결과: ui_component

## 요약
| 태스크 | pass@1 | pass@3 | 평균 점수 |
|--------|--------|--------|-----------|
| task_ui_001 | 1.00 | 1.00 | 0.85 |
| task_ui_002 | 0.67 | 1.00 | 0.78 |
| task_ui_003 | 1.00 | 1.00 | 0.92 |

## 전체 지표
- 총 태스크: 3
- 총 실행: 9
- 평균 pass@1: 0.89
- 평균 pass@3: 1.00
- 전체 평균 점수: 0.85

## 저성능 태스크
1. task_ui_002 - pass@1: 0.67
   - 주요 이슈: 첫 시도에서 접근성 레이블 누락
```

## 결과 파일 위치

```
.claude/evals/results/
├── 2025-01-10/
│   ├── task_ui_001.json
│   ├── task_ui_002.json
│   └── summary.json
```

## 에러 처리

- **태스크 없음**: "지정된 태스크를 찾을 수 없습니다: {task_id}"
- **타임아웃**: 실행을 FAIL로 기록하고 다음 실행으로 진행
- **에이전트 오류**: 오류를 기록하고 결과에 포함

## 관련 리소스

- [eval-task-runner 에이전트](../agents/eval-task-runner.md)
- [eval-grader 에이전트](../agents/eval-grader.md)
- [태스크 스키마](../evals/tasks/schema.yaml)
- [루브릭](../evals/rubrics/)
