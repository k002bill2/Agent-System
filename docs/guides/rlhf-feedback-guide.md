# RLHF 피드백 시스템 사용 가이드

## 개요

RLHF(Reinforcement Learning from Human Feedback) 피드백 시스템은 에이전트 실행 결과에 대한 사용자 피드백을 수집하고, 이를 Fine-tuning용 데이터셋으로 변환하는 시스템입니다.

### 주요 기능

- **피드백 수집**: 에이전트 응답에 대한 긍정/부정 피드백 수집
- **암묵적 피드백 감지**: 사용자가 에이전트 결과를 수정할 때 자동 감지
- **데이터셋 변환**: 수집된 피드백을 OpenAI Fine-tuning 형식으로 변환
- **내보내기**: JSONL, CSV 형식으로 데이터셋 내보내기

---

## 피드백 유형

### 1. Explicit Positive (명시적 긍정) 👍

사용자가 에이전트 응답에 만족했을 때 👍 버튼을 클릭하여 제출합니다.

```typescript
{
  feedback_type: "explicit_positive",
  original_output: "에이전트가 생성한 응답"
}
```

### 2. Explicit Negative (명시적 부정) 👎

사용자가 에이전트 응답에 불만족했을 때 👎 버튼을 클릭하고 사유를 선택합니다.

```typescript
{
  feedback_type: "explicit_negative",
  reason: "incorrect" | "incomplete" | "off_topic" | "style" | "performance" | "other",
  reason_detail: "상세 사유 (선택)",
  original_output: "에이전트가 생성한 응답"
}
```

**사유 옵션:**

| 코드 | 설명 | 예시 |
|------|------|------|
| `incorrect` | 결과가 틀림 | 문법 오류, 잘못된 로직 |
| `incomplete` | 불완전한 결과 | 에러 핸들링 누락, 일부 기능 미구현 |
| `off_topic` | 주제에서 벗어남 | 요청과 다른 내용 응답 |
| `style` | 스타일/형식 문제 | 코딩 컨벤션 미준수, 가독성 문제 |
| `performance` | 성능 문제 | 비효율적인 알고리즘, 메모리 낭비 |
| `other` | 기타 | 상세 사유 직접 입력 |

### 3. Implicit (암묵적 피드백)

사용자가 에이전트 응답을 직접 수정했을 때 자동으로 감지되어 수집됩니다.

```typescript
{
  feedback_type: "implicit",
  original_output: "에이전트가 생성한 원본 응답",
  corrected_output: "사용자가 수정한 응답"
}
```

> **참고**: 암묵적 피드백은 가장 가치 있는 학습 데이터입니다. 사용자가 실제로 원하는 출력을 직접 보여주기 때문입니다.

---

## 대시보드 사용법

### 피드백 제출하기

1. **태스크 실행 후 결과 확인**
   - 에이전트가 태스크를 완료하면 결과가 로그에 표시됩니다.

2. **피드백 버튼 클릭**
   - 결과 옆에 있는 👍 또는 👎 버튼을 클릭합니다.

3. **부정 피드백 시 사유 선택**
   - 👎 클릭 시 모달이 표시됩니다.
   - 적절한 사유를 선택하고 제출합니다.

### Feedback 탭 사용하기

**Agents** 페이지 → **Feedback** 탭에서 피드백을 관리합니다.

#### History 서브탭

- **통계 카드**: 총 피드백 수, 긍정 비율, 암묵적 비율, 대기 중 개수
- **필터**: 유형별, 상태별 필터링
- **피드백 목록**: 각 피드백의 상세 정보 확인
- **Process 버튼**: 개별 피드백을 데이터셋으로 변환

#### Dataset 서브탭

- **통계**: 총 엔트리 수, 긍정/부정 샘플 수, 에이전트별 분포
- **내보내기 옵션**:
  - 형식 선택 (JSONL / CSV)
  - 부정 샘플 포함 여부
  - 암묵적 피드백 포함 여부
- **Export 버튼**: 데이터셋 다운로드

---

## API 사용법

### 피드백 제출

```bash
curl -X POST http://localhost:8000/api/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "sess-abc123",
    "task_id": "task-xyz789",
    "feedback_type": "explicit_negative",
    "reason": "incomplete",
    "reason_detail": "에러 핸들링 코드가 누락됨",
    "original_output": "function add(a, b) { return a + b; }"
  }'
```

### 피드백 목록 조회

```bash
# 전체 조회
curl http://localhost:8000/api/feedback

# 필터링
curl "http://localhost:8000/api/feedback?feedback_type=explicit_negative&status=pending&limit=20"
```

**쿼리 파라미터:**

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `session_id` | string | 세션 ID 필터 |
| `feedback_type` | string | 피드백 유형 필터 |
| `status` | string | 상태 필터 (pending, processed, skipped, error) |
| `agent_id` | string | 에이전트 ID 필터 |
| `start_date` | datetime | 시작 날짜 |
| `end_date` | datetime | 종료 날짜 |
| `limit` | int | 최대 반환 개수 (기본: 50) |
| `offset` | int | 페이지 오프셋 |

### 피드백 통계 조회

```bash
curl http://localhost:8000/api/feedback/stats
```

**응답 예시:**

```json
{
  "total_count": 150,
  "by_type": {
    "explicit_positive": 80,
    "explicit_negative": 45,
    "implicit": 25
  },
  "by_reason": {
    "incorrect": 20,
    "incomplete": 15,
    "style": 10
  },
  "by_status": {
    "pending": 30,
    "processed": 120
  },
  "by_agent": {
    "web-ui-specialist": 60,
    "backend-integration-specialist": 50,
    "test-automation-specialist": 40
  },
  "positive_rate": 0.533,
  "implicit_rate": 0.167
}
```

### 피드백 처리 (데이터셋 변환)

```bash
# 단일 처리
curl -X POST http://localhost:8000/api/feedback/{feedback_id}/process

# 일괄 처리
curl -X POST http://localhost:8000/api/feedback/process-batch \
  -H "Content-Type: application/json" \
  -d '{"feedback_ids": ["id1", "id2", "id3"]}'

# 대기 중인 피드백 전체 처리
curl -X POST "http://localhost:8000/api/feedback/process-pending?limit=100"
```

### 데이터셋 내보내기

```bash
# JSONL 형식 (기본)
curl "http://localhost:8000/api/feedback/dataset/export" > dataset.jsonl

# CSV 형식
curl "http://localhost:8000/api/feedback/dataset/export?format=csv" > dataset.csv

# 옵션 적용
curl "http://localhost:8000/api/feedback/dataset/export?format=jsonl&include_negative=true&include_implicit=true&agent_filter=web-ui-specialist"
```

**내보내기 옵션:**

| 파라미터 | 타입 | 기본값 | 설명 |
|----------|------|--------|------|
| `format` | string | jsonl | 출력 형식 (jsonl, csv) |
| `include_negative` | bool | true | 부정 샘플 포함 여부 |
| `include_implicit` | bool | true | 암묵적 피드백 포함 여부 |
| `agent_filter` | string | - | 에이전트 ID 필터 (쉼표 구분) |
| `start_date` | datetime | - | 시작 날짜 |
| `end_date` | datetime | - | 종료 날짜 |

---

## 데이터셋 형식

### JSONL (OpenAI Fine-tuning 호환)

```jsonl
{"messages": [{"role": "system", "content": "You are an expert AI assistant..."}, {"role": "user", "content": "Task: task-abc123"}, {"role": "assistant", "content": "Generated code..."}], "metadata": {"feedback_type": "explicit_positive", "agent_id": "web-ui-specialist"}}
{"messages": [{"role": "system", "content": "You are an expert AI assistant..."}, {"role": "user", "content": "Task: task-def456"}, {"role": "assistant", "content": "Corrected code..."}], "metadata": {"feedback_type": "implicit", "agent_id": "backend-integration-specialist"}}
```

### CSV

```csv
id,feedback_id,system_prompt,user_input,assistant_output,is_positive,agent_id,feedback_type
entry-001,fb-abc,You are an expert...,Task: task-abc123,Generated code...,true,web-ui-specialist,explicit_positive
entry-002,fb-def,You are an expert...,Task: task-def456,Corrected code...,true,backend-integration-specialist,implicit
```

---

## Fine-tuning 워크플로우

### 1. 피드백 수집

```
사용자 → 에이전트 실행 → 결과 확인 → 피드백 제출 (👍/👎/수정)
```

### 2. 품질 검토

```bash
# 통계 확인
curl http://localhost:8000/api/feedback/stats

# 부정 피드백 검토
curl "http://localhost:8000/api/feedback?feedback_type=explicit_negative&status=pending"
```

### 3. 데이터셋 생성

```bash
# 대기 중인 피드백 일괄 처리
curl -X POST http://localhost:8000/api/feedback/process-pending

# 데이터셋 통계 확인
curl http://localhost:8000/api/feedback/dataset/stats
```

### 4. 데이터셋 내보내기

```bash
# JSONL 형식으로 내보내기
curl "http://localhost:8000/api/feedback/dataset/export?format=jsonl" > training_data.jsonl
```

### 5. Fine-tuning 실행

```python
# OpenAI Fine-tuning 예시
import openai

# 데이터 업로드
with open("training_data.jsonl", "rb") as f:
    file = openai.files.create(file=f, purpose="fine-tune")

# Fine-tuning 작업 생성
job = openai.fine_tuning.jobs.create(
    training_file=file.id,
    model="gpt-4o-mini-2024-07-18"
)
```

---

## 모범 사례

### 피드백 수집

1. **일관된 기준 적용**: 같은 유형의 문제에는 같은 사유를 선택하세요.
2. **상세 사유 활용**: `other` 선택 시 구체적인 설명을 입력하세요.
3. **암묵적 피드백 활용**: 결과를 수정할 때 수정 전/후를 명확히 구분하세요.

### 데이터 품질

1. **정기적 검토**: 수집된 피드백을 주기적으로 검토하세요.
2. **이상치 제거**: 명백히 잘못된 피드백은 `skipped` 처리하세요.
3. **균형 유지**: 긍정/부정 샘플의 비율을 적절히 유지하세요.

### 데이터셋 관리

1. **버전 관리**: 내보낸 데이터셋에 날짜를 포함하여 버전 관리하세요.
2. **백업**: 중요한 데이터셋은 별도로 백업하세요.
3. **점진적 학습**: 전체 데이터를 한 번에 사용하지 말고 점진적으로 추가하세요.

---

## 문제 해결

### 피드백이 제출되지 않음

1. Backend 서버가 실행 중인지 확인
2. 브라우저 콘솔에서 네트워크 오류 확인
3. `session_id`와 `task_id`가 유효한지 확인

### 데이터셋이 비어 있음

1. 피드백이 `pending` 상태인지 확인
2. `process-pending` API로 피드백 처리 실행
3. 내보내기 필터 옵션 확인

### 데이터베이스 모드에서 오류 발생

1. `USE_DATABASE=true` 환경 변수 설정 확인
2. PostgreSQL 연결 상태 확인
3. 마이그레이션 실행 여부 확인

---

## 관련 문서

- [CLAUDE.md](../../CLAUDE.md) - 프로젝트 전체 문서
- [API 문서](http://localhost:8000/docs) - FastAPI 자동 생성 문서
- [개발계획서](../prd/) - PRD 문서

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|----------|
| 1.0 | 2026-01-20 | 최초 작성 |
