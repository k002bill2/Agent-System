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

## Error Handling
- `HTTPException` with 적절한 status code
- `logging.getLogger(__name__)` 사용
- 민감 정보 로깅 금지
