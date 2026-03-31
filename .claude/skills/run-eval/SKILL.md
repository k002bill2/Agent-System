---
name: run-eval
description: "AI 에이전트 평가 실행 전문 스킬. .claude/evals/tasks/ 태스크 정의 기반으로 에이전트 성능 벤치마크를 실행하고 pass@k, pass^k, avg_score 지표를 계산. '/run-eval', '평가 돌려줘', 'eval 실행', 'pass@k 계산', '벤치마크', '--category ui_component', '--all' 등의 요청에 트리거. 에이전트 실패 원인 분석(agent-improvement)이 아닌, 정량적 성능 측정과 결과 기록에 특화."
disable-model-invocation: true
argument-hint: "[task_id | --category <name> | --all] [--k=N]"
---

# AI Agent Evaluation Runner

## Overview

Systematically evaluate AI agent performance and compute pass@k metrics. Provides structured benchmarking with per-task scoring, category-level aggregation, and actionable insights for low-performing agents.

## Usage

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

## Execution Steps

### 1. Parse Arguments

`$ARGUMENTS`에서 태스크 ID 또는 옵션을 파싱합니다:

- task_id: 특정 태스크 ID (예: task_ui_001)
- --category: 카테고리 필터 (ui_component, service, bug_fix, refactor)
- --all: 모든 태스크 실행
- --k: 반복 횟수 (기본값: 1)
- --agent: 특정 에이전트 지정 (선택)

### 2. Load Task Definitions

`.claude/evals/tasks/` 디렉토리에서 YAML 파일을 읽습니다:

```bash
# 단일 태스크
cat .claude/evals/tasks/task_ui_001.yaml

# 카테고리별
grep -l "category: ui_component" .claude/evals/tasks/*.yaml

# 전체
ls .claude/evals/tasks/*.yaml | grep -v schema | grep -v _templates
```

### 3. Run Evaluation

eval-task-runner 에이전트를 호출하여 평가를 실행합니다.
eval 시스템 상세는 [references/eval-guide.md](references/eval-guide.md) 참조.

### 4. Save Results

`.claude/evals/results/{date}/` 디렉토리에 결과를 저장합니다.

### 5. Output Summary

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

## Batch Evaluation Output

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

## Error Handling

- **태스크 없음**: "지정된 태스크를 찾을 수 없습니다: {task_id}"
- **타임아웃**: 실행을 FAIL로 기록하고 다음 실행으로 진행
- **에이전트 오류**: 오류를 기록하고 결과에 포함

## Common Mistakes

| Mistake | Correction |
|---------|-----------|
| Running `--all` without checking available tasks first | List `.claude/evals/tasks/*.yaml` first to confirm task definitions exist |
| Using specialist agent types (e.g., web-ui-specialist) | Always use `general-purpose` subagent_type — specialists may output XML instead of tool calls |
| Forgetting `--k` for reliable pass@k metrics | Single runs (k=1) only give pass@1; use `--k=3` or higher for meaningful pass@k |
| Comparing results across different dates without context | Check if agent prompts or skills changed between runs — results may not be directly comparable |
| Not feeding low-performance results into agent-improvement | After eval, use `agent-improvement` skill to diagnose and fix failing patterns |

## References

- Task definitions: `.claude/evals/tasks/`
- Rubrics: `.claude/evals/rubrics/`
- Results: `.claude/evals/results/`
- Eval guide: `references/eval-guide.md`
- **REQUIRED:** Use `superpowers:agent-improvement` for post-eval failure diagnosis
