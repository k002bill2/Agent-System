# AOS Backend Rules

## FastAPI Patterns
- Router: `APIRouter(prefix="/api/...", tags=[...])` + `Depends(get_session)`
- Service Layer: 비즈니스 로직은 Service 클래스로 분리
- Pydantic models: request/response 검증 필수

## SQLAlchemy Async
- `async_sessionmaker` + dependency injection
- `mapped_column` declarative 모델
- Relationship: `selectinload` 기본

## LangGraph Nodes
- `async def node_name(state: AgentState) -> AgentState:` 패턴
- StateGraph 조립 후 conditional edges로 라우팅
- HITL 노드: 위험 작업 전 승인 요청

## Python
- 타입 힌트 필수 (모든 함수 시그니처 + 반환값)
- async/await 일관 사용 (sync 호출로 이벤트 루프 차단 금지)
- asyncpg prepared statement 캐시 충돌 주의

## Pytest
- 새 async 테스트는 `@pytest.mark.asyncio`(또는 모듈 상단 `pytestmark = pytest.mark.asyncio`) 필수 — pytest rootdir가 repo 루트로 잡히면 `src/backend/pyproject.toml`의 `asyncio_mode = "auto"`가 적용되지 않아(실질 STRICT) 마커 없는 async 테스트는 CI Backend Tests에서 "async not supported"로 실패한다
- 실행: CWD `src/backend`에서 `uv run pytest ../../tests/backend -v --tb=short` (CI Backend Tests와 동일 경로·명령)
- 하네스 Phase D 계약: 백엔드 테스트 코드의 소유자는 backend-integration-specialist(Phase B에서 구현과 함께 작성), Phase D는 실행·보고

## Error Handling
- `HTTPException` with 적절한 status code
- `logging.getLogger(__name__)` 사용
- 민감 정보 로깅 금지
