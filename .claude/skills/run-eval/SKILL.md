---
name: run-eval
description: AI 에이전트 평가 태스크 실행 및 pass@k 지표 계산.
allowed-tools: Read, Grep, Glob, Bash
argument-hint: "[task_id | --category <type> | --all] [--k=N]"
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
/run-eval task_ui_001 --agent=web-ui-specialist
```

## 실행 단계

### 1. 태스크 로드
`$ARGUMENTS`에서 태스크 ID 또는 옵션을 파싱합니다:

- task_id: 특정 태스크 ID (예: task_ui_001)
- --category: 카테고리 필터 (ui_component, service, bug_fix, refactor)
- --all: 모든 태스크 실행
- --k: 반복 횟수 (기본값: 1)
- --agent: 특정 에이전트 지정 (선택)

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
eval-task-runner 에이전트를 호출하여 평가를 실행합니다.
eval 시스템 상세는 [references/eval-guide.md](references/eval-guide.md) 참조.

### 4. 결과 저장
`.claude/evals/results/{date}/` 디렉토리에 결과를 저장합니다.

### 5. 요약 출력

```markdown
# 평가 결과: {task_id}

## 실행 요약
| 실행 | 점수 | 결과 | 소요시간 |
|------|------|------|----------|
| Run 1 | 0.85 | PASS | 8m 12s |
| Run 2 | 0.72 | PASS | 11m 45s |
| Run 3 | 0.65 | FAIL | 15m 00s |

## 지표
- **pass@1**: 1.00
- **pass@k**: 1.00
- **pass^k**: 0.67
- **평균 점수**: 0.74
- **성공률**: 66.7%
```

## 배치 평가 출력

```markdown
# 배치 평가 결과: {category}

## 요약
| 태스크 | pass@1 | pass@3 | 평균 점수 |
|--------|--------|--------|-----------|
| task_ui_001 | 1.00 | 1.00 | 0.85 |
| task_ui_002 | 0.67 | 1.00 | 0.78 |

## 저성능 태스크
1. task_ui_002 - pass@1: 0.67
   - 주요 이슈: {description}
```

## 에러 처리

- **태스크 없음**: "지정된 태스크를 찾을 수 없습니다: {task_id}"
- **타임아웃**: 실행을 FAIL로 기록하고 다음 실행으로 진행
- **에이전트 오류**: 오류를 기록하고 결과에 포함
