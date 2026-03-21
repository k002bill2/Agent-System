# Ralph Loop 실행 가이드

## 개요

AOS 자동화 루프 시스템을 3단계 Ralph Loop로 구축합니다.

```
Step 1: 자동화 스크립트 & 이벤트 트리거
    ↓ (의존)
Step 2: 모듈식 데이터 파이프라인
    ↓ (의존)
Step 3: 통합 테스트 & 검증
```

## 아키텍처

```
┌─────────────────────────────────────────────────┐
│              AutomationLoopService              │
│  (주기적 상태 감시 + 조건부 액션 실행)              │
│                                                 │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐    │
│  │ Condition│──▶│ Evaluate │──▶│  Action  │    │
│  │   Defs   │   │  Engine  │   │ Executor │    │
│  └──────────┘   └──────────┘   └──────────┘    │
│                                     │           │
│        ┌────────────────────────────┘           │
│        ▼                                        │
│  ┌─────────────────────────────────────────┐    │
│  │           PipelineService               │    │
│  │  Collect → Transform → Analyze → Output │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
         │              │              │
    HealthService  SchedulerService  WorkflowEngine
    (기존 AOS)      (기존 AOS)       (기존 AOS)
```

## 실행 방법

### Step 1 실행

```bash
/ralph-loop "$(cat ralph-loops/step1-automation-triggers/PROMPT.md)" \
  --completion-promise "STEP1 COMPLETE" \
  --max-iterations 15
```

### Step 2 실행 (Step 1 완료 후)

```bash
/ralph-loop "$(cat ralph-loops/step2-data-pipeline/PROMPT.md)" \
  --completion-promise "STEP2 COMPLETE" \
  --max-iterations 15
```

### Step 3 실행 (Step 2 완료 후)

```bash
/ralph-loop "$(cat ralph-loops/step3-integration-test/PROMPT.md)" \
  --completion-promise "STEP3 COMPLETE" \
  --max-iterations 10
```

## 생성되는 파일

```
src/backend/
├── services/
│   ├── automation_loop_service.py    # Step 1
│   └── pipeline/                     # Step 2
│       ├── __init__.py
│       ├── pipeline_service.py
│       ├── stage.py
│       ├── stages/
│       │   ├── collect_stage.py
│       │   ├── transform_stage.py
│       │   ├── analyze_stage.py
│       │   └── output_stage.py
│       └── models.py
├── api/
│   ├── automation.py                 # Step 1
│   └── pipelines.py                  # Step 2

tests/backend/
├── test_automation_loop.py           # Step 1
├── test_pipeline.py                  # Step 2
└── test_integration_automation.py    # Step 3
```

## 루프 취소

```bash
/cancel-ralph
```
