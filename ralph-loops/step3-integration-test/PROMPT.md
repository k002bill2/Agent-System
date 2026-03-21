# Step 3: 자동화 루프 통합 테스트 & 검증

## 목표

Step 1(AutomationLoopService)과 Step 2(PipelineService)가
**E2E로 연동**되는 것을 검증하는 통합 테스트를 작성한다.

## 선행 조건 (WAIT FOR)

- `tests/backend/test_automation_loop.py` 전체 PASS
- `tests/backend/test_pipeline.py` 전체 PASS
- `ruff check` 및 `ruff format --check` 통과

## 완료 조건

아래가 모두 충족되면 `<promise>STEP3 COMPLETE</promise>`를 출력하라.

1. `tests/backend/test_integration_automation.py` 존재 및 전체 PASS
2. 아래 시나리오 3개 모두 테스트 통과
3. `ruff check` 및 `ruff format --check` 통과
4. 전체 테스트 스위트 (`pytest tests/backend/ -x`) 통과

## 테스트 시나리오

### 시나리오 1: 조건 감지 → 액션 실행 루프

```python
async def test_condition_triggers_action():
    """
    Given: health.db.latency_ms > 100ms 조건의 루프가 활성화됨
    When: HealthService가 latency 120ms 반환
    Then: 설정된 액션(log)이 실행됨
    And: cooldown 기간 내 동일 조건 재트리거 안 됨
    """
```

### 시나리오 2: 파이프라인 E2E 실행

```python
async def test_pipeline_collect_transform_output():
    """
    Given: collect → transform → output 3단계 파이프라인 정의
    When: 파이프라인 실행
    Then: 각 스테이지 순서대로 실행됨
    And: 스테이지 간 데이터가 올바르게 전달됨
    And: 최종 결과에 모든 스테이지 결과 포함
    """
```

### 시나리오 3: 자동화 루프 → 파이프라인 트리거 연동

```python
async def test_automation_loop_triggers_pipeline():
    """
    Given: 조건 충족 시 pipeline을 실행하는 자동화 루프
    When: 조건이 충족됨
    Then: 해당 파이프라인이 자동 실행됨
    And: 파이프라인 결과가 기록됨
    """
```

## 테스트 패턴

### Mock 전략

```python
# HealthService mock - 메트릭 값 제어
@pytest.fixture
def mock_health_service():
    service = AsyncMock(spec=HealthService)
    service.check_health.return_value = SystemHealth(
        status=HealthStatus.HEALTHY,
        components={
            "database": ComponentHealth(
                name="database",
                status=HealthStatus.HEALTHY,
                latency_ms=120.0,  # 테스트용 높은 값
            )
        },
    )
    return service
```

### 비동기 루프 테스트

```python
# asyncio.Task 기반 루프는 짧은 interval + max_iterations로 제어
config = AutomationLoopConfig(
    name="test-loop",
    interval_seconds=0.1,    # 빠른 실행
    max_iterations=3,        # 3회 후 자동 종료
    conditions=[...],
    actions=[...],
)
```

### 정리(Cleanup) 보장

```python
@pytest.fixture
async def automation_service():
    service = AutomationLoopService()
    yield service
    # 모든 루프 정리
    for loop in await service.list_loops():
        await service.stop_loop(loop.loop_id)
```

## 검증 항목 체크리스트

- [ ] AutomationLoopService 생성/시작/중지/삭제 CRUD
- [ ] 조건 평가 로직 (gt, lt, eq, gte, lte, ne)
- [ ] Cooldown 메커니즘 (동일 조건 재트리거 방지)
- [ ] max_iterations 도달 시 자동 종료
- [ ] 파이프라인 스테이지 순차 실행
- [ ] 스테이지 간 데이터 전달 정확성
- [ ] 에러 전략 (fail_fast, continue, retry)
- [ ] 자동화 루프 → 파이프라인 트리거 연동
- [ ] Graceful shutdown (진행 중 루프 안전 종료)
- [ ] 메모리 누수 없음 (asyncio.Task 정리)

## 제약 사항

- 실제 외부 서비스 호출 금지 (모두 Mock)
- 실제 DB 사용 금지 (in-memory 모드)
- 테스트 타임아웃: 개별 30초, 전체 120초
