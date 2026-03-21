# Eval 시스템 가이드

> Based on: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agent

AI 에이전트 평가 시스템의 구조와 에이전트 역할을 설명합니다.

## 에이전트 역할

### eval-task-runner
평가 태스크 실행 오케스트레이터. 태스크 정의를 로드하고, 전문 에이전트를 스폰하여 실행한 뒤, 결과를 수집합니다.

**주요 책임:**
- 태스크 YAML 파싱 및 로드
- 전문 에이전트 스폰 (타임아웃 관리)
- eval-grader에 채점 요청
- pass@k 지표 계산
- 결과 JSON 저장

**subagent_type**: 반드시 `general-purpose` 사용 (specialist 에이전트는 Tool API 대신 XML 출력 문제 있음).

### eval-grader
코드 검사 및 LLM 루브릭 기반 채점 에이전트.

**6가지 Grader 타입:**
| Type | Method | Use Case |
|------|--------|----------|
| code | 결정론적 검사 | 파일 존재, 타입 체크 |
| llm | LLM 루브릭 | 코드 품질, 설계 |
| human | 인간 검토 | 복잡한 판단 |
| state_check | 상태 검증 | 파일 상태 |
| transcript | 행동 분석 | 효율성, 도구 사용 |
| static_analysis | 정적 분석 | ruff, mypy, eslint |

**점수 구성:**
- 코드 검사 (Code Checks): 가중치 40% (기본)
- LLM 평가 (LLM Grading): 가중치 60% (기본)
- 합격 기준: final_score ≥ 0.7

## 태스크 YAML 스키마

```yaml
# 필수 필드
id: string                    # 고유 ID (예: task_ui_001)
name: string                  # 태스크 이름
category: enum                # ui_component | service | bug_fix | refactor | api | test
difficulty: enum              # easy | medium | hard | expert

# 태스크 설명
description: string
acceptance_criteria: list

# 입력 컨텍스트
input:
  prompt: string              # 에이전트에게 전달할 프롬프트
  context_files: list         # 참조할 파일 목록 (선택)

# 예상 출력
expected_output:
  files: list                 # 생성/수정될 파일 목록
  patterns: list              # 포함되어야 할 패턴
  forbidden_patterns: list    # 포함되면 안 되는 패턴

# 평가 설정
evaluation:
  timeout_minutes: number     # 타임아웃 (기본: 15)
  rubric: string              # 루브릭 파일
  weights:
    code_checks: number       # 코드 검사 비중 (0-100)
    llm_grading: number       # LLM 평가 비중 (0-100)
  passing_score: number       # 합격 점수 (0-1, 기본: 0.7)
```

## 루브릭 구조

루브릭은 `.claude/evals/rubrics/`에 YAML로 정의됩니다.

| 루브릭 | 대상 | 평가 차원 |
|--------|------|----------|
| `ui_component.yaml` | React UI 컴포넌트 | 가독성, 아키텍처, 유지보수성, 성능, 보안 |
| `service.yaml` | Backend 서비스/API | 에러 처리, 아키텍처, 타입 안전성 |
| `bug_fix.yaml` | 버그 수정 | 근본 원인 분석, 회귀 테스트 |

**LLM 평가 5개 차원** (각 1-5점):
1. **가독성**: 네이밍, 주석, 코드 구조
2. **아키텍처**: 패턴 준수, 관심사 분리
3. **유지보수성**: 테스트 용이성, 확장성
4. **성능**: 불필요한 렌더, 메모이제이션
5. **보안**: 입력 검증, 데이터 노출

## 지표 계산

### pass@k
k번 시도 중 최소 1회 성공 확률:
```
pass@k = 1 - C(n-c, k) / C(n, k)
n: 총 시도, c: 성공 횟수, k: 샘플 수
```

### pass^k
k번 모두 성공 확률:
```
pass^k = (c/n)^k
```

### Grade Scale
| Score | Grade |
|-------|-------|
| 0.95+ | A+ |
| 0.90-0.94 | A |
| 0.85-0.89 | B+ |
| 0.80-0.84 | B |
| 0.70-0.79 | C |
| <0.70 | F |

## 파일 구조

```
.claude/evals/
├── tasks/              # 태스크 정의 YAML
│   └── schema.yaml     # 스키마 참조
├── rubrics/            # 평가 루브릭
└── results/{date}/     # 날짜별 결과 JSON
```
