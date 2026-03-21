# Step 1: 자동화 스크립트 & 이벤트 트리거 로직

## 목표

기존 AOS 인프라(`SchedulerService`, `WebhookService`, `WorkflowEngine`) 위에
**자동화 루프 서비스(AutomationLoopService)**를 구축한다.

이 서비스는 주기적 상태 감시 + 이벤트 기반 반응을 결합하여,
시스템 메트릭 변화에 자동으로 대응하는 루프를 제공한다.

## 완료 조건

아래가 모두 충족되면 `<promise>STEP1 COMPLETE</promise>`를 출력하라.

1. `src/backend/services/automation_loop_service.py` 존재
2. `src/backend/api/automation.py` 라우터 존재
3. 단위 테스트 `tests/backend/test_automation_loop.py` 통과
4. `ruff check` 및 `ruff format --check` 통과

## 기존 코드 참조 (중복 구현 금지)

| 서비스 | 위치 | 역할 |
|--------|------|------|
| `SchedulerService` | `src/backend/services/scheduler_service.py` | APScheduler 크론 스케줄링 |
| `WebhookService` | `src/backend/services/webhook_service.py` | 이벤트 수신 & HMAC 검증 |
| `WorkflowEngine` | `src/backend/services/workflow_engine.py` | DAG 기반 작업 실행 |
| `HealthService` | `src/backend/services/health_service.py` | 헬스 체크 & 컴포넌트 상태 |

## 구현 사양

### 1. AutomationLoopService (`services/automation_loop_service.py`)

```python
class AutomationLoopConfig(BaseModel):
    """자동화 루프 설정"""
    name: str                          # 루프 이름
    interval_seconds: int = 60         # 감시 주기
    max_iterations: int | None = None  # 최대 반복 (None=무한)
    conditions: list[ConditionDef]     # 트리거 조건들
    actions: list[ActionDef]           # 조건 충족 시 실행할 액션
    cooldown_seconds: int = 300        # 같은 조건 재트리거 방지


class ConditionDef(BaseModel):
    """트리거 조건 정의"""
    metric: str                        # 감시할 메트릭 (e.g., "health.db.latency_ms")
    operator: Literal["gt", "lt", "eq", "ne", "gte", "lte"]
    threshold: float
    duration_seconds: int = 0          # N초 이상 지속 시 트리거


class ActionDef(BaseModel):
    """트리거 시 실행할 액션"""
    type: Literal["webhook", "workflow", "log", "notify"]
    target: str                        # webhook URL, workflow_id, 로그 메시지 등
    params: dict[str, Any] = {}


class AutomationLoopService:
    """주기적 상태 감시 + 조건부 액션 실행 루프"""

    async def create_loop(self, config: AutomationLoopConfig) -> str:
        """루프 생성, loop_id 반환"""

    async def start_loop(self, loop_id: str) -> None:
        """루프 시작 (asyncio.Task로 백그라운드 실행)"""

    async def stop_loop(self, loop_id: str) -> None:
        """루프 중지"""

    async def get_loop_status(self, loop_id: str) -> LoopStatus:
        """루프 상태 조회"""

    async def list_loops(self) -> list[LoopStatus]:
        """전체 루프 목록"""

    async def _run_loop(self, loop_id: str) -> None:
        """내부 루프 실행 로직"""

    async def _evaluate_conditions(self, conditions: list[ConditionDef]) -> list[ConditionResult]:
        """조건 평가 (HealthService 메트릭 활용)"""

    async def _execute_actions(self, actions: list[ActionDef]) -> list[ActionResult]:
        """액션 실행"""
```

### 2. API 라우터 (`api/automation.py`)

```
POST   /api/automation/loops          → 루프 생성
GET    /api/automation/loops          → 루프 목록
GET    /api/automation/loops/{id}     → 루프 상태
POST   /api/automation/loops/{id}/start   → 루프 시작
POST   /api/automation/loops/{id}/stop    → 루프 중지
DELETE /api/automation/loops/{id}     → 루프 삭제
```

### 3. 핵심 패턴

- **싱글톤**: `get_automation_loop_service()` 팩토리
- **비동기**: 모든 메서드 `async/await`
- **Immutability**: Pydantic `frozen=True` 설정 모델
- **Cooldown**: 동일 조건 반복 트리거 방지
- **Graceful Shutdown**: 루프 태스크 취소 시 정리 보장
- **메모리 누수 방지**: `asyncio.Task` 참조 관리, 완료된 태스크 정리

## 제약 사항 (DO NOT)

- UI 컴포넌트 작성 금지
- 프로덕션 DB 직접 수정 금지
- 기존 서비스 코드 수정 금지 (import하여 사용만)
- 외부 유료 서비스 연동 금지

## STOP IF

- 이벤트 리스너가 메모리 누수를 유발하는 경우 → 즉시 중단하고 원인 분석
- `asyncio.Task`가 정리되지 않는 패턴 발견 시 → 재설계
