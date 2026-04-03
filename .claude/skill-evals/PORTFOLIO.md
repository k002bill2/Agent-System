# AOS Skill Evaluation Portfolio

**Date**: 2026-03-31
**Evaluator**: Claude Opus 4.6
**Skills Evaluated**: 9
**Total Eval Runs**: 10 (AB: 8, Workflow: 2)

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Skills evaluated | 9 |
| AB tests completed | 4/4 |
| Workflow tests completed | 2/5 |
| Average baseline score | 0.843 |
| Average enhanced score | 0.970 |
| **Average uplift** | **+12.7%** |
| Description F1 (keyword) | 0.52 |
| Description accuracy | 63.9% |

### Key Finding

**스킬의 핵심 가치는 "구조화된 출력 형식"과 "프로젝트 특화 패턴"입니다.** 원시 코딩/분석 능력은 프로젝트 규칙(CLAUDE.md)만으로도 높은 수준에 도달하지만, 정해진 체크리스트 형식과 AOS-specific 수정 패턴은 스킬을 통해서만 제공됩니다.

---

## Phase 2: A/B Test Results

### Ability Enhancement Skills (4)

| Rank | Skill | Baseline | Enhanced | Uplift | Value Proposition |
|------|-------|----------|----------|--------|------------------|
| 1 | verify-backend | 0.70 | 0.95 | **+25%** | 5-item 체크리스트 + 수정 코드 예시 |
| 2 | verify-frontend | 0.75 | 0.95 | **+20%** | 5-item 체크리스트 + 예외 규칙 인식 |
| 3 | test-automation | 0.92 | 0.98 | **+6%** | 갭 필링 전략 + AAA 엄격 준수 |
| 4 | react-web-development | 1.00 | 1.00 | **+0%** | 프로젝트 규칙과 중복 (path alias만 차이) |

#### Uplift Pattern Analysis

```
High Uplift (20-25%):  verify-* skills
  → Value: STRUCTURED CHECKLIST FORMAT + EXCEPTION RULES
  → Baseline misses: format compliance, project-specific patterns

Low Uplift (0-6%):  development skills (rwd, ta)
  → Baseline already high due to project rules (aos-frontend.md)
  → Skill overlaps with CLAUDE.md → aos-*.md rule chain
  → Need differentiation: unique patterns not in project rules
```

### Workflow / Meta Skills (2/5)

| Skill | Score | Highlights |
|-------|-------|-----------|
| agent-observability | **1.00** | Perfect KPI calculation, privacy compliant, timeline correlation |
| agent-improvement | **1.00** | 3/3 failures diagnosed, root cause + specific fixes + re-eval plan |

**Skipped** (require live environments): verification-loop, merge-worktree, run-eval

---

## Phase 3: Description Accuracy

### Overall: F1 = 0.52, Accuracy = 63.9%

| Rank | Skill | F1 | Accuracy | Issue |
|------|-------|----|----------|-------|
| 1 | test-automation | 0.88 | 85% | OK |
| 2 | merge-worktree | 0.86 | 85% | OK |
| 3 | verify-frontend | 0.74 | 75% | Minor FN |
| 4 | react-web-development | 0.59 | 65% | **CRITICAL**: 한국어 매칭 부족 |
| 5 | verification-loop | 0.59 | 65% | **CRITICAL**: 구어체 쿼리 매칭 부족 |
| 6 | verify-backend | 0.50 | 60% | **CRITICAL**: 한국어 쿼리 미대응 |
| 7 | run-eval | 0.29 | 50% | **CRITICAL**: 영문 전문용어만 존재 |
| 8 | agent-observability | 0.29 | 50% | **CRITICAL**: 한국어 키워드 없음 |
| 9 | agent-improvement | 0.00 | 40% | **CRITICAL**: 매칭 키워드 부재 |

### Root Cause

- **Precision 100%** (FP=0): 스킬이 잘못 트리거되는 경우 없음
- **Recall ~37%**: 스킬이 트리거되어야 할 때 놓치는 경우 63%
- **원인**: description이 영문 기술 용어 위주. 한국어 유저 쿼리와 키워드 불일치

### Improvement Recommendations

| Priority | Action | Expected Impact |
|----------|--------|----------------|
| P0 | agent-improvement: 한국어 키워드 추가 (에이전트 실패, 진단, 프롬프트 개선) | F1 0.00 → 0.70+ |
| P0 | agent-observability: 한국어 키워드 추가 (이벤트 분석, KPI, 트레이스) | F1 0.29 → 0.70+ |
| P1 | run-eval: 한국어 키워드 추가 (평가, 벤치마크, 성능 측정) | F1 0.29 → 0.70+ |
| P1 | verify-backend: 한국어 키워드 추가 (검증, 검사, 점검) | F1 0.50 → 0.75+ |
| P2 | verification-loop: 구어체 트리거 추가 (확인해줘, 돌려줘, 문제없는지) | F1 0.59 → 0.80+ |

**Caveat**: 이 결과는 키워드 기반 시뮬레이션입니다. 실제 Claude Code는 LLM semantic 매칭을 사용하므로 실제 트리거 정확도는 이보다 높을 수 있습니다.

---

## Consolidated Skill Assessment

| Skill | AB Uplift | Workflow | Desc F1 | Overall Grade |
|-------|-----------|----------|---------|---------------|
| verify-backend | +25% | - | 0.50 | **A** (high impact, desc needs work) |
| verify-frontend | +20% | - | 0.74 | **A** (high impact, good desc) |
| agent-improvement | - | 1.00 | 0.00 | **B+** (great workflow, terrible desc) |
| agent-observability | - | 1.00 | 0.29 | **B+** (great workflow, poor desc) |
| test-automation | +6% | - | 0.88 | **B** (low uplift, best desc) |
| merge-worktree | - | skipped | 0.86 | **B-** (good desc, untested workflow) |
| verification-loop | - | skipped | 0.59 | **C+** (untested, mediocre desc) |
| run-eval | - | skipped | 0.29 | **C** (untested, poor desc) |
| react-web-development | +0% | - | 0.59 | **C** (zero uplift, needs differentiation) |

---

## Recommendations

### Immediate Actions

1. **verify-backend/frontend**: 유지 및 강화 — AB uplift +20-25%로 가장 높은 ROI
2. **agent-improvement/observability**: description 한국어 키워드 추가 — workflow 품질은 만점이지만 발견 불가
3. **react-web-development**: `aos-frontend.md`와 차별화 — 고급 패턴(performance hooks, state patterns) 추가

### Architecture Insight

```
Project Rules (CLAUDE.md → aos-*.md)
  ↓ covers 84% of basic patterns
Skills
  ↓ adds +12.7% for structured output
  ↓ adds +20-25% for VERIFICATION workflows
  ↓ adds ~0% for basic DEVELOPMENT patterns (overlap)
```

**스킬의 최적 사용처**: "검증/분석" 워크플로우 > "개발/구현" 워크플로우

---

## Assets Generated

| File | Purpose |
|------|---------|
| `.claude/skill-evals/*/evals/evals.json` (9) | Eval 정의 |
| `.claude/skill-evals/benchmark.json` | AB + Workflow 채점 결과 |
| `.claude/skill-evals/eval-viewer.html` | 시각화 대시보드 |
| `.claude/skill-evals/trigger-queries.json` | 180개 트리거 쿼리 |
| `.claude/skill-evals/run_loop.py` | Description 매칭 측정 스크립트 |
| `.claude/skill-evals/description-accuracy.json` | 매칭 정확도 결과 |
| `.claude/skill-evals/PORTFOLIO.md` | 이 포트폴리오 리포트 |

---

*Generated by AOS Skill Eval System — Phase 1-4 Complete*
