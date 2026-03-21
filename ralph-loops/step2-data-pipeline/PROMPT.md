# Step 2: 모듈식 데이터 파이프라인

## 목표

Step 1의 `AutomationLoopService`와 기존 `WorkflowEngine`을 조합하여,
**데이터 수집 → 변환 → 분석 → 출력**을 자동화하는 파이프라인 서비스를 구축한다.

각 단계는 독립 모듈로 설계하여 재조합 가능하게 한다.

## 선행 조건 (WAIT FOR)

- `src/backend/services/automation_loop_service.py`가 존재하고 테스트 통과
- `tests/backend/test_automation_loop.py` 전체 PASS

## 완료 조건

아래가 모두 충족되면 `<promise>STEP2 COMPLETE</promise>`를 출력하라.

1. `src/backend/services/pipeline/` 디렉토리 구조 완성
2. 파이프라인 정의 → 실행 → 결과 조회 흐름 동작
3. 단위 테스트 `tests/backend/test_pipeline.py` 통과
4. `ruff check` 및 `ruff format --check` 통과

## 구현 사양

### 디렉토리 구조

```
src/backend/services/pipeline/
├── __init__.py
├── pipeline_service.py      # 파이프라인 오케스트레이션
├── stage.py                 # 스테이지 기본 클래스
├── stages/
│   ├── __init__.py
│   ├── collect_stage.py     # 데이터 수집 (API, DB, 파일)
│   ├── transform_stage.py   # 데이터 변환 (필터, 매핑, 집계)
│   ├── analyze_stage.py     # 분석 (통계, 이상 탐지)
│   └── output_stage.py      # 출력 (로그, 파일, 웹훅)
└── models.py                # 파이프라인 데이터 모델
```

### 1. Stage 기본 클래스 (`stage.py`)

```python
class StageResult(BaseModel, frozen=True):
    """스테이지 실행 결과 (불변)"""
    stage_name: str
    status: Literal["success", "failed", "skipped"]
    data: dict[str, Any] = {}
    error: str | None = None
    duration_ms: float = 0


class BaseStage(ABC):
    """파이프라인 스테이지 기본 클래스"""

    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    def input_schema(self) -> type[BaseModel] | None:
        """입력 스키마 (선택적 검증)"""
        return None

    @property
    def output_schema(self) -> type[BaseModel] | None:
        """출력 스키마 (선택적 검증)"""
        return None

    @abstractmethod
    async def execute(self, context: PipelineContext) -> StageResult:
        """스테이지 실행"""
        ...
```

### 2. PipelineService (`pipeline_service.py`)

```python
class PipelineConfig(BaseModel, frozen=True):
    """파이프라인 설정 (불변)"""
    name: str
    stages: list[StageConfig]          # 순서대로 실행할 스테이지
    error_strategy: Literal["fail_fast", "continue", "retry"] = "fail_fast"
    max_retries: int = 2
    timeout_seconds: int = 300


class PipelineService:
    """모듈식 데이터 파이프라인 오케스트레이터"""

    def register_stage(self, stage_type: str, stage_class: type[BaseStage]) -> None:
        """스테이지 타입 등록 (플러그인 패턴)"""

    async def create_pipeline(self, config: PipelineConfig) -> str:
        """파이프라인 정의 생성, pipeline_id 반환"""

    async def execute_pipeline(self, pipeline_id: str, initial_data: dict | None = None) -> PipelineResult:
        """파이프라인 실행 (순차적 스테이지 체인)"""

    async def get_pipeline_result(self, run_id: str) -> PipelineResult:
        """실행 결과 조회"""

    async def list_pipelines(self) -> list[PipelineSummary]:
        """파이프라인 목록"""
```

### 3. 내장 스테이지 구현

#### CollectStage (`stages/collect_stage.py`)
- `source_type`: `"health_metrics"` | `"api_call"` | `"file_read"`
- HealthService에서 메트릭 수집, 외부 API 호출, 파일 읽기

#### TransformStage (`stages/transform_stage.py`)
- `operation`: `"filter"` | `"map"` | `"aggregate"` | `"flatten"`
- Pydantic 모델로 입출력 스키마 검증

#### AnalyzeStage (`stages/analyze_stage.py`)
- `analysis_type`: `"statistics"` | `"anomaly_detection"` | `"trend"`
- 간단한 통계 (평균, 표준편차, 백분위수)
- 이상 탐지: Z-score 기반

#### OutputStage (`stages/output_stage.py`)
- `output_type`: `"log"` | `"file"` | `"webhook"` | `"automation_trigger"`
- AutomationLoopService와 연동: 파이프라인 결과를 자동화 루프 트리거로 전달

### 4. AutomationLoop ↔ Pipeline 연동

```python
# AutomationLoopService의 ActionDef에 pipeline 타입 추가
class ActionDef(BaseModel):
    type: Literal["webhook", "workflow", "log", "notify", "pipeline"]
    target: str  # pipeline_id
    params: dict[str, Any] = {}
```

### 5. API 라우터 (`api/pipelines.py`)

```
POST   /api/pipelines                    → 파이프라인 생성
GET    /api/pipelines                    → 파이프라인 목록
POST   /api/pipelines/{id}/execute       → 파이프라인 실행
GET    /api/pipelines/{id}/runs/{run_id} → 실행 결과 조회
DELETE /api/pipelines/{id}               → 파이프라인 삭제
```

## 핵심 패턴

- **Strategy Pattern**: 각 Stage는 독립된 전략 → 스테이지 교체/추가 용이
- **Chain of Responsibility**: 스테이지 간 `PipelineContext`로 데이터 전달
- **Plugin Registry**: `register_stage()`로 커스텀 스테이지 등록 가능
- **Immutability**: `StageResult`, `PipelineConfig` 등 `frozen=True`
- **Schema Validation**: 스테이지 간 데이터 형식 불일치 사전 검증

## 제약 사항 (DO NOT)

- 외부 유료 서비스 연동 금지 (사전 승인 없이)
- Step 1 코드의 인터페이스 변경 금지 (확장만 허용)
- pandas, numpy 등 무거운 의존성 추가 금지 (표준 라이브러리 + pydantic)

## STOP IF

- 파이프라인 단계 간 데이터 형식 불일치 발견 시 → 스키마 검증 로직 먼저 구현
- 스테이지 실행 중 예외가 삼켜지는(swallowed) 패턴 발견 시 → 에러 전파 재설계
