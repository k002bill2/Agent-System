# AI Agent Evaluation System

AI 에이전트의 성능을 체계적으로 평가하고 pass@k 지표를 계산하는 시스템입니다.

## 디렉토리 구조

```
.claude/evals/
├── README.md               # 이 파일
├── tasks/                  # 태스크 정의 (17개)
│   ├── schema.yaml         # 태스크 스키마
│   ├── task_ui_001.yaml    # AgentCard 컴포넌트 (medium)
│   ├── task_ui_002.yaml    # Pagination 컴포넌트 (easy)
│   ├── task_ui_003.yaml    # VirtualizedDataTable (hard)
│   ├── task_ui_004.yaml    # 워크플로우 그래프 에디터 (expert)
│   ├── task_service_001.yaml  # Agent CRUD API (medium)
│   ├── task_service_002.yaml  # Agent Registry API (hard)
│   ├── task_service_003.yaml  # 분산 태스크 스케줄러 (expert)
│   ├── task_bug_001.yaml   # useEffect 무한 루프 (easy)
│   ├── task_bug_002.yaml   # WebSocket 경쟁 상태 (hard)
│   ├── task_bug_003.yaml   # 풀스택 상태 동기화 (expert)
│   ├── task_refactor_001.yaml  # Zustand Store 분리 (hard)
│   ├── task_refactor_002.yaml  # API Service Layer (hard)
│   ├── task_integration_001.yaml  # 실시간 모니터링 (hard)
│   ├── task_api_001.yaml   # LLM Provider Gateway (medium)
│   ├── task_api_002.yaml   # Webhook 이벤트 디스패치 (hard)
│   ├── task_test_001.yaml  # AgentCard 테스트 스위트 (medium)
│   └── task_test_002.yaml  # API 계약 테스트 (hard)
├── rubrics/                # 평가 루브릭 (5개)
│   ├── ui_component.yaml   # React UI 컴포넌트 평가
│   ├── service.yaml        # Backend 서비스 평가
│   ├── bug_fix.yaml        # 버그 수정 평가
│   ├── integration.yaml    # 풀스택 통합 평가
│   ├── api.yaml            # API 통합/게이트웨이 평가
│   └── test.yaml           # 테스트 작성 품질 평가
└── results/                # 평가 결과 (날짜별)
    └── {YYYY-MM-DD}/
        ├── task_*.json
        └── summary.json
```

## 사용법

```bash
# 단일 태스크 평가
/run-eval task_ui_001

# 카테고리별 평가
/run-eval --category ui_component
/run-eval --category service
/run-eval --category bug_fix
/run-eval --category refactor
/run-eval --category api
/run-eval --category test

# 전체 평가
/run-eval --all

# pass@k 계산 (k번 반복)
/run-eval task_ui_001 --k=3
/run-eval --all --k=3

# 특정 에이전트로 실행
/run-eval task_ui_001 --agent=web-ui-specialist
```

## 태스크 카테고리

| 카테고리 | 설명 | 예시 |
|----------|------|------|
| `ui_component` | React UI 컴포넌트 생성 | AgentCard, Pagination |
| `service` | Backend API/서비스 구현 | CRUD 엔드포인트 |
| `bug_fix` | 버그 수정 | 무한 리렌더링 수정 |
| `refactor` | 코드 리팩토링 | Store 분리 |
| `integration` | 풀스택 통합 | 프론트+백엔드 연동 |
| `api` | API 통합/게이트웨이 | LLM Gateway, Webhook |
| `test` | 테스트 작성 | 컴포넌트/계약 테스트 |

## 평가 지표

### pass@k
k번의 시도 중 최소 1회 이상 성공할 확률

```
pass@k = 1 - C(n-c, k) / C(n, k)

n: 총 시도 횟수
c: 성공 횟수
k: 샘플 수
```

### 점수 구성
- **코드 검사 (Code Checks)**: 40%
  - 파일 존재 여부
  - 테스트 파일 존재
  - 타입스크립트 품질
  - 접근성 준수

- **LLM 평가 (LLM Grading)**: 60%
  - 가독성
  - 아키텍처
  - 유지보수성
  - 성능
  - 보안

## 난이도

| 난이도 | 설명 | 태스크 수 |
|--------|------|-----------|
| `easy` | 단일 파일, 명확한 수정 | 2 |
| `medium` | 2-3 파일, 한 영역 | 4 |
| `hard` | 다중 파일, 크로스 영역 | 8 |
| `expert` | 풀스택, 복합 아키텍처 | 3 |

## 루브릭

### ui_component.yaml
React/TypeScript UI 컴포넌트 평가 기준

### service.yaml
Backend 서비스 및 API 평가 기준

### bug_fix.yaml
버그 수정 태스크 평가 기준

### integration.yaml
풀스택 통합 태스크 평가 기준

### api.yaml
API 통합, 게이트웨이, 웹훅 처리 품질 평가 기준

### test.yaml
테스트 스위트 작성 및 커버리지 품질 평가 기준

## 태스크 정의 예시

```yaml
id: task_ui_001
name: "AgentCard 컴포넌트 생성"
category: ui_component
difficulty: medium

description: |
  에이전트 정보를 표시하는 AgentCard 컴포넌트를 생성합니다.

acceptance_criteria:
  - TypeScript로 작성
  - Tailwind CSS 스타일링
  - 테스트 파일 포함

input:
  prompt: "에이전트 정보를 표시하는 AgentCard 컴포넌트를 생성해주세요."
  context_files:
    - src/dashboard/src/types/index.ts

expected_output:
  files:
    - src/dashboard/src/components/agents/AgentCard.tsx
    - src/dashboard/src/components/agents/AgentCard.test.tsx
  patterns:
    - "interface.*Props"
    - "export.*AgentCard"
  forbidden_patterns:
    - ": any"

evaluation:
  timeout_minutes: 15
  rubric: ui_component.yaml
  weights:
    code_checks: 40
    llm_grading: 60
  passing_score: 0.7

metadata:
  created_at: 2025-01-28
  author: system
  tags: [react, component, ui]
  recommended_agent: web-ui-specialist
```

## 결과 형식

### 단일 실행 결과

```json
{
  "task_id": "task_ui_001",
  "run_id": "run_001",
  "timestamp": "2025-01-28T10:30:00Z",
  "agent": "web-ui-specialist",
  "duration_seconds": 492,
  "result": "PASS",
  "score": 0.85,
  "code_checks": {
    "score": 0.9,
    "details": [...]
  },
  "llm_grading": {
    "score": 0.82,
    "dimensions": {...}
  },
  "feedback": "..."
}
```

### 배치 실행 요약

```json
{
  "batch_id": "batch_20250128",
  "total_tasks": 5,
  "total_runs": 15,
  "pass_at_1": 0.8,
  "pass_at_3": 1.0,
  "average_score": 0.78,
  "by_category": {...},
  "low_performers": [...]
}
```

## 관련 에이전트

- **eval-task-runner**: 평가 태스크 실행 오케스트레이터
- **eval-grader**: 코드 검사 및 LLM 평가 수행

## 새 태스크 추가

1. `tasks/schema.yaml` 참조
2. `tasks/task_{category}_{number}.yaml` 파일 생성
3. 적절한 루브릭 선택 또는 새로 생성
4. `/run-eval {task_id}` 로 테스트
