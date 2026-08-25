"""Session service for managing orchestration sessions.

Provides an abstraction layer over storage (in-memory or database).
"""

import logging
import os
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta
from typing import Any, cast

from db.database import async_session_factory
from db.repository import (
    STATE_VERSION_KEY,
    MessageRepository,
    SessionRepository,
    StateWriteResult,
    TaskRepository,
    deserialize_state,
)
from models.agent_state import AgentState, create_initial_state, migrate_state
from models.project import Project
from utils.time import to_aware_utc, utcnow

logger = logging.getLogger(__name__)

# 버전 충돌 재시도 횟수. 충돌은 "다른 쓰기가 먼저 반영됐다" 는 뜻이라 재시도
# 가능한 조건이다 — 소진되면 그때는 지속적 경합이므로 올려 보낸다.
SESSION_WRITE_RETRIES = 3


class SessionVersionConflictError(RuntimeError):
    """다른 쓰기가 먼저 반영돼 이 쓰기의 기준 버전이 낡았다.

    재시도 가능한 조건이다 — 다시 읽어 수정을 얹으면 된다. 500 이 아니다.
    """

    def __init__(self, session_id: str) -> None:
        super().__init__(f"session {session_id} was modified by another writer")
        self.session_id = session_id


# Environment variable to control storage mode
USE_DATABASE = os.getenv("USE_DATABASE", "false").lower() == "true"

# Session TTL configuration (in days)
SESSION_TTL_DAYS = int(os.getenv("SESSION_TTL_DAYS", "7"))
# Inactive session cleanup threshold (in hours)
SESSION_INACTIVE_HOURS = int(os.getenv("SESSION_INACTIVE_HOURS", "24"))

# 한 번의 sweep 이 훑을 세션 수 상한. 전 행을 무제한으로 끌어오면 세션이 많은
# 배포에서 sweep 하나가 메모리·왕복을 독차지한다. 남은 것은 다음 sweep 이 집는다
# (`updated_at` 오름차순이라 오래된 것부터).
SESSION_SWEEP_LIMIT = int(os.getenv("SESSION_SWEEP_LIMIT", "500"))


class SessionMetadata:
    """Metadata for session management."""

    def __init__(
        self,
        session_id: str,
        created_at: datetime,
        last_activity: datetime,
        expires_at: datetime,
    ):
        self.session_id = session_id
        self.created_at = created_at
        self.last_activity = last_activity
        self.expires_at = expires_at

    def is_expired(self) -> bool:
        """Check if the session has expired."""
        return utcnow() > self.expires_at

    def is_inactive(self, threshold_hours: int = SESSION_INACTIVE_HOURS) -> bool:
        """Check if the session is inactive beyond the threshold."""
        threshold = utcnow() - timedelta(hours=threshold_hours)
        return self.last_activity < threshold

    def touch(self) -> None:
        """Update last activity timestamp."""
        self.last_activity = utcnow()

    def to_dict(self) -> dict:
        """Convert to dictionary for serialization."""
        return {
            "session_id": self.session_id,
            "created_at": self.created_at.isoformat(),
            "last_activity": self.last_activity.isoformat(),
            "expires_at": self.expires_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "SessionMetadata":
        """Create from dictionary.

        **파싱 결과를 aware 로 정규화한다.** offset 유무가 문자열에 좌우되기
        때문이다 — `utcnow()` 가 naive 이던 시절에 저장된 세션의 `_metadata` 는
        suffix 가 없어 `fromisoformat` 이 naive 를 돌려준다. 그것을 aware 인
        `utcnow()` 와 비교하면 TypeError 가 나고, sweep 의 `except` 절이 그것을
        "손상된 메타데이터" 로 삼켜 **만료 세션이 영영 지워지지 않는다** (#309).
        """
        return cls(
            session_id=data["session_id"],
            created_at=to_aware_utc(datetime.fromisoformat(data["created_at"])),
            last_activity=to_aware_utc(datetime.fromisoformat(data["last_activity"])),
            expires_at=to_aware_utc(datetime.fromisoformat(data["expires_at"])),
        )


class SessionService:
    """Service for managing orchestration sessions.

    Supports both in-memory and database storage modes.
    """

    def __init__(self, use_database: bool = USE_DATABASE):
        self.use_database = use_database
        self._memory_sessions: dict[str, AgentState] = {}
        self._session_metadata: dict[str, SessionMetadata] = {}

    async def create_session(
        self,
        user_id: str | None = None,
        max_iterations: int = 100,
        project: Project | None = None,
        session_id: str | None = None,
        ttl_days: int | None = None,
        organization_id: str | None = None,
    ) -> str:
        """Create a new orchestration session.

        Args:
            organization_id: If provided, quota is checked before creation.
                Raises ValueError if session quota is exceeded.
        """
        # Quota check if organization_id is provided
        if organization_id:
            from services.organization_service import OrganizationService
            from services.quota_service import QuotaService

            org = OrganizationService.get_organization(organization_id)
            if org:
                # Count today's sessions for this org
                sessions_today = self._count_org_sessions_today(organization_id)
                check = QuotaService.check_session_quota(org, sessions_today)
                if not check.allowed:
                    raise ValueError(check.message)

        session_id = session_id or str(uuid.uuid4())
        now = utcnow()
        ttl = ttl_days or SESSION_TTL_DAYS

        state = create_initial_state(
            session_id=session_id,
            user_id=user_id,
            organization_id=organization_id,
            max_iterations=max_iterations,
        )

        # Add project context if provided
        if project:
            state["project"] = {
                "id": project.id,
                "name": project.name,
                "path": project.path,
                "description": project.description,
            }
            if project.claude_md:
                state["system_context"] = project.claude_md

        # Create session metadata
        metadata = SessionMetadata(
            session_id=session_id,
            created_at=now,
            last_activity=now,
            expires_at=now + timedelta(days=ttl),
        )
        self._session_metadata[session_id] = metadata

        # Add metadata to state for persistence
        state["_metadata"] = metadata.to_dict()

        if self.use_database:
            async with async_session_factory() as db:
                repo = SessionRepository(db)
                await repo.create(
                    session_id=session_id,
                    user_id=user_id,
                    project_id=project.id if project else None,
                    organization_id=organization_id,
                    initial_state=state,
                )
                await db.commit()
        else:
            self._memory_sessions[session_id] = state

        return session_id

    async def get_session(self, session_id: str, update_activity: bool = True) -> AgentState | None:
        """Get session state.

        Args:
            session_id: The session ID
            update_activity: Whether to update last_activity timestamp

        Returns:
            Session state or None if not found or expired
        """
        state = None

        version: int | None = None
        if self.use_database:
            async with async_session_factory() as db:
                repo = SessionRepository(db)
                row = await repo.get_state_with_version(session_id)
                if row is not None:
                    state, version = row
        else:
            state = self._memory_sessions.get(session_id)

        if not state:
            return None

        # Migrate from older schema versions if needed
        state = migrate_state(state)

        # DB 경로는 JSON 을 돌려주므로 tasks/agents 가 raw dict 다. 노드들은
        # `task.status` 처럼 속성으로 접근하므로 여기서 모델로 되돌린다.
        # 저장 백엔드를 추상화하는 유일한 관문이라 memory 경로에도 함께 적용한다
        # (이미 모델이면 그대로 통과 — deserialize_state 는 재적용에 안전).
        state = deserialize_state(state)

        # 저장소의 메타데이터로 **항상** 다시 읽는다 (issue #289). 필드마다
        # 권위가 다르다:
        #   - `expires_at` 은 **리스**다. 저장소가 내주는 것이므로 저장소가
        #     이긴다. 로컬 사본이 이기면 이미 죽은 세션이 되살아나고, 반대로
        #     낡은 사본을 우선하면 아래 만료 검사가 살아 있는 세션을 지운다.
        #   - `last_activity` 는 **high-water mark** 다. 활동은 누구의 관측이든
        #     실제로 일어난 일이라 더 늦은 쪽이 이긴다. DB 모드에서는 `touch()`
        #     가 영속화되지 않으므로, 저장소 값으로 덮으면 방금 읽힌 세션이
        #     비활성으로 분류된다.
        cached = self._session_metadata.get(session_id)
        metadata = cached
        stored_metadata = state.get("_metadata")
        if stored_metadata:
            try:
                metadata = SessionMetadata.from_dict(stored_metadata)
            except (KeyError, TypeError, ValueError):
                # 손상된 blob 은 건너뛰고 기존 사본을 유지한다 —
                # 매 읽기마다 터지게 두면 그 세션이 영구 500 이 된다.
                logger.warning(
                    "Malformed session metadata, keeping cached copy",
                    extra={"session_id": session_id},
                )
            else:
                if cached and cached.last_activity > metadata.last_activity:
                    metadata.last_activity = cached.last_activity
                self._session_metadata[session_id] = metadata

        # Check expiration
        if metadata and metadata.is_expired():
            # Session expired, clean up
            await self.delete_session(session_id)
            return None

        # Update last activity
        if metadata and update_activity:
            metadata.touch()
            state["_metadata"] = metadata.to_dict()

        # 이 읽기의 행 버전을 state 에 실어 보낸다 — 읽는 쪽마다 자기 스냅샷을
        # 들고 가야 겹친 read-modify-write 가 조건부 UPDATE 에서 걸린다.
        # 서비스 수준 dict 로 두면 같은 프로세스의 동시 읽기 둘이 그것을 공유해
        # 늦은 쓰기가 통과한다 (issue #292). 메모리 모드는 단일 프로세스라 없음.
        if version is not None:
            state[STATE_VERSION_KEY] = version

        # `deserialize_state` 는 저장 포맷(dict) 을 다루는 헬퍼라 `dict` 를 돌려준다.
        # `AgentState` 계약을 세우는 곳은 저장소를 감싸는 이 관문 하나뿐이다.
        return cast(AgentState, state)

    async def update_session(
        self,
        session_id: str,
        state: AgentState,
        *,
        check_version: bool = True,
    ) -> bool:
        """Update session state.

        `check_version=True` 이고 state 가 읽기 시점의 버전을 들고 있으면 조건부
        UPDATE 를 한다. 그 사이 다른 쓰기가 반영됐으면 `SessionVersionConflictError` 를
        던진다 — 이 쓰기의 기준이 낡았다는 뜻이고, 다시 읽어 재시도해야 한다.
        반환 `bool` 은 예전과 같은 뜻이다(행이 있어 썼는가).

        `check_version=False` 는 last-writer-wins 를 **의도적으로** 고르는 경로다.
        완료된 그래프 실행의 최종 state 처럼 재시도가 불가능한 쓰기에만 쓴다.

        메모리 모드는 버전이 없어 언제나 무조건 쓰기다 — 단일 프로세스라 겹칠
        상대가 없다. 재시도 루프는 DB 모드에서만 실제로 돈다.
        """
        if self.use_database:
            expected = state.get(STATE_VERSION_KEY) if check_version else None
            async with async_session_factory() as db:
                repo = SessionRepository(db)
                outcome, new_version = await repo.update_state(session_id, state, expected)
                if outcome is StateWriteResult.CONFLICT:
                    await db.rollback()
                    raise SessionVersionConflictError(session_id)
                await db.commit()
                if new_version is not None:
                    # 쓴 뒤의 버전을 호출자 state 에 되돌려준다. 안 그러면 같은
                    # state 로 다시 쓸 때 아무도 끼어들지 않았는데 충돌한다.
                    state[STATE_VERSION_KEY] = new_version
                return outcome is StateWriteResult.WRITTEN
        else:
            if session_id in self._memory_sessions:
                self._memory_sessions[session_id] = state
                return True
            return False

    def is_session_expired(self, session_id: str) -> bool:
        """세션이 TTL 을 넘겼는지 — 메타데이터만 보므로 state 로드 없이 저렴하다.

        메타데이터가 없으면 만료로 본다. 결정적인 이유는 **삭제**다 —
        `delete_session` 이 메타데이터를 지우므로, 서비스 경로에서 만료로 삭제된
        세션은 메타데이터가 없는 상태로 남는다(`refresh_session` 이 그 경로를
        탄다). 부재를 "살아 있음"으로 보면 호출자의 캐시가 이미 삭제된 세션을
        계속 내주게 된다.

        만료로 보면 호출자는 캐시를 버리고 정식 조회 경로로 떨어지며, 거기서
        세션이 없으면 None 이 나온다. 메타데이터 없는 레거시 state 는 매번
        저장소로 떨어지지만 그건 성능 비용이고, `create_session` 이 언제나
        `state["_metadata"]` 를 써왔으므로 사실상 도달하지 않는다.
        """
        metadata = self._session_metadata.get(session_id)
        if not metadata:
            return True
        return metadata.is_expired()

    async def mutate_session(
        self,
        session_id: str,
        mutate: Callable[[AgentState], Awaitable[AgentState | None]],
        retries: int = SESSION_WRITE_RETRIES,
    ) -> AgentState | None:
        """read → 수정 → 조건부 쓰기. 충돌하면 다시 읽어 재시도한다.

        `state_json` 을 통째로 쓰는 구조에서 read-modify-write 의 **정식 경로**다.
        직접 `get_session` + `update_session` 을 부르면 그 사이의 다른 쓰기를 지운다.

        `mutate` 는 읽어온 state 를 받아 쓸 state 를 돌려주는 **async** 함수다
        (저장소를 다시 읽어 판정하는 compare-and-set 을 안에 둘 수 있어야 한다). `None` 을 돌려주면
        쓰지 않고 중단한다(수정할 것이 없을 때). 재시도 시 **다시 호출되므로**
        부작용 없이 순수하게 state 만 다뤄야 한다.

        반환은 실제로 저장된 state, 세션이 없거나 `mutate` 가 중단하면 `None`.

        메모리 모드는 버전이 없어 충돌하지 않는다 — 재시도 루프는 DB 모드에서만
        실제로 돈다. 메모리 모드 테스트로는 이 루프가 검증되지 않는다.
        """
        for attempt in range(retries):
            state = await self.get_session(session_id)
            if state is None:
                return None

            mutated = await mutate(state)
            if mutated is None:
                return None

            try:
                if not await self.update_session(session_id, mutated):
                    return None  # 행이 사라졌다 — 재시도해도 소용없다
            except SessionVersionConflictError:
                logger.info(
                    "Session write conflicted, retrying",
                    extra={"session_id": session_id, "attempt": attempt + 1},
                )
                continue
            return mutated

        raise SessionVersionConflictError(session_id)

    async def delete_session(self, session_id: str) -> bool:
        """Delete a session."""
        # Remove metadata
        self._session_metadata.pop(session_id, None)

        if self.use_database:
            async with async_session_factory() as db:
                repo = SessionRepository(db)
                result = await repo.delete(session_id)
                await db.commit()
                return result
        else:
            if session_id in self._memory_sessions:
                del self._memory_sessions[session_id]
                return True
            return False

    async def refresh_session(self, session_id: str, extend_days: int | None = None) -> bool:
        """Refresh session expiration time.

        Args:
            session_id: The session ID
            extend_days: Days to extend from now (default: SESSION_TTL_DAYS)

        Returns:
            True if session was refreshed
        """
        # 읽고 고쳐 쓰는 경로다. 버전 충돌은 재시도한다 — 다른 쓰기가 먼저
        # 반영됐다는 뜻일 뿐이고, 호출자(`api/sessions.py`, `api/websocket.py`)는
        # 불리언으로 분기하므로 그대로 올리면 재시도 가능한 조건이 500 이 된다.
        for _ in range(SESSION_WRITE_RETRIES):
            state = await self.get_session(session_id, update_activity=False)
            if not state:
                return False

            metadata = self._session_metadata.get(session_id)
            if not metadata:
                return False

            previous = metadata.to_dict()
            extend = extend_days or SESSION_TTL_DAYS
            metadata.expires_at = utcnow() + timedelta(days=extend)
            metadata.touch()
            state["_metadata"] = metadata.to_dict()
            # 영속화가 실패하면 메모리만 연장된 상태가 되어 저장소와 갈라진다.
            # 실패 형태는 셋이다 — 버전 충돌(재시도), False 반환(행이 없음),
            # 저장소 예외(장애).
            try:
                persisted = await self.update_session(session_id, state)
            except SessionVersionConflictError:
                self._session_metadata[session_id] = SessionMetadata.from_dict(previous)
                continue
            except Exception:
                # 예외는 삼키지 않는다. DB 장애는 "갱신 거절" 이 아니다.
                self._session_metadata[session_id] = SessionMetadata.from_dict(previous)
                raise
            if not persisted:
                self._session_metadata[session_id] = SessionMetadata.from_dict(previous)
                return False
            return True

        raise SessionVersionConflictError(session_id)

    async def get_session_info(self, session_id: str) -> dict | None:
        """Get session metadata info without loading full state.

        Returns session info including TTL status.
        """
        state = await self.get_session(session_id, update_activity=False)
        if not state:
            return None

        metadata = self._session_metadata.get(session_id)
        if not metadata:
            return None

        now = utcnow()
        return {
            "session_id": session_id,
            "created_at": metadata.created_at.isoformat(),
            "last_activity": metadata.last_activity.isoformat(),
            "expires_at": metadata.expires_at.isoformat(),
            "is_expired": metadata.is_expired(),
            "is_inactive": metadata.is_inactive(),
            "ttl_remaining_hours": max(0, (metadata.expires_at - now).total_seconds() / 3600),
        }

    async def cleanup_expired_sessions(self, limit: int = SESSION_SWEEP_LIMIT) -> int:
        """만료·비활성 세션을 정리한다. 정리한 건수를 돌려준다.

        DB 모드는 **저장소를 훑는다** (issue #291). 로컬 `_session_metadata` 키만
        돌던 예전 구조에는 결함이 두 겹 있었다:

        - **낡은 판정** — 다른 인스턴스가 연장한 세션을 이 프로세스의 낡은 사본만
          보고 지운다. `expires_at` 은 리스라 저장소가 이긴다 (#289 에서 정한 규칙).
        - **누락** — 이 프로세스가 만진 적 없는 세션은 애초에 대상이 아니다.
          다중 인스턴스에서는 **어느 인스턴스도 정리하지 않는 세션**이 생긴다.

        메모리 모드는 단일 프로세스라 둘 다 성립하지 않으므로 기존 경로를 그대로 둔다.
        """
        if self.use_database:
            return await self._sweep_storage(limit)
        return self._sweep_memory()

    async def _sweep_storage(self, limit: int) -> int:
        """저장소를 훑어 만료 세션을 조건부로 지운다 (DB 모드).

        **전체를 페이지로 순회한다.** 한 페이지만 보고 끝내면, 앞을 차지한 살아 있는
        세션들이 갱신되지 않는 한 순서가 그대로라 **영원히** 창 앞에 남고 그 뒤의
        만료 세션은 어느 sweep 에서도 닿지 못한다. 그래서 `limit` 은 작업량 상한이
        아니라 **페이지 크기**다 — 메모리는 한 페이지로 묶이고, 한 번의 sweep 비용은
        세션 수에 비례한다(정리 작업의 성격상 불가피하다).

        판정은 Python 이 한다 — 손상된 `_metadata` 하나가 SQL 캐스팅에서 문장 전체를
        실패시키면 정리가 영영 멈추기 때문이다. 삭제는 판정 시점의 행 버전을 조건으로
        걸어, 그 사이 들어온 `refresh_session` 의 연장을 지우지 않는다.
        """
        cleaned = 0
        cursor: str | None = None
        async with async_session_factory() as db:
            repo = SessionRepository(db)
            while True:
                page = await repo.list_metadata_for_sweep(limit, after=cursor)
                if not page:
                    break
                for candidate in page:
                    if not self._is_expired_in_storage(candidate.session_id, candidate.metadata):
                        continue
                    if await repo.delete_if_version(candidate.session_id, candidate.version):
                        cleaned += 1
                        # 이 인스턴스가 캐시에 들고 있었다면 함께 버린다. 없으면 no-op —
                        # 저장소를 훑으므로 만진 적 없는 세션도 대상이 된다.
                        self._session_metadata.pop(candidate.session_id, None)
                # 삭제된 행은 커서를 흔들지 않는다 — 기본키는 불변이다.
                cursor = page[-1].session_id
            await db.commit()
        return cleaned

    def _is_expired_in_storage(self, session_id: str, raw_metadata: Any) -> bool:
        """저장소의 `_metadata` 로 **만료** 여부만 판정한다 (DB 모드).

        `is_inactive()` 를 보지 않는 이유가 핵심이다. `last_activity` 를 갱신하는
        `touch()` 는 **한 번도 영속화되지 않는다** — `get_session` 이 로컬 사본만
        고친다. 그래서 저장소의 `last_activity` 는 "아무도 갱신하지 않는 값" 이고,
        그것으로 비활성을 판정하면 활발히 **읽히지만 쓰이지는 않는** 세션이 24 시간
        뒤 삭제된다. 로컬 사본을 high-water mark 로 얹는 것도 답이 아니다 — 다른
        인스턴스만 관측한 활동은 여전히 보이지 않는다.

        `expires_at` 은 다르다. **리스**이고 `refresh_session` 이 저장소에 실제로
        쓰므로 저장소가 권위를 가진다 (#289 에서 정한 규칙).

        판정할 수 없으면 **지우지 않는다** — 메타데이터가 없거나 손상된 세션을
        지우는 것은 되돌릴 수 없고, 남겨 두는 쪽의 대가는 그 세션이 남는 것뿐이다.
        """
        if not isinstance(raw_metadata, dict):
            return False
        try:
            metadata = SessionMetadata.from_dict(raw_metadata)
        except (KeyError, TypeError, ValueError):
            logger.warning(
                "Malformed session metadata, skipping sweep",
                extra={"session_id": session_id},
            )
            return False
        return metadata.is_expired()

    def _is_sweepable_in_memory(self, raw_metadata: Any) -> bool:
        """메모리 모드 판정 — 만료 **또는** 비활성.

        DB 모드(`_is_expired_in_storage`)와 달리 `is_inactive()` 를 함께 본다.
        단일 프로세스라 `touch()` 가 갱신하는 로컬 사본이 곧 저장소이고,
        `last_activity` 가 실제 활동을 반영하기 때문이다.
        """
        if not isinstance(raw_metadata, dict):
            return False
        try:
            metadata = SessionMetadata.from_dict(raw_metadata)
        except (KeyError, TypeError, ValueError):
            return False  # 손상된 메타데이터 — 판정할 수 없으면 지우지 않는다
        return metadata.is_expired() or metadata.is_inactive()

    def _sweep_memory(self) -> int:
        """메모리 모드 sweep — 단일 프로세스라 로컬 사본이 곧 저장소다."""
        cleaned = 0
        for session_id in list(self._session_metadata.keys()):
            metadata = self._session_metadata.get(session_id)
            if metadata and (metadata.is_expired() or metadata.is_inactive()):
                self._session_metadata.pop(session_id, None)
                self._memory_sessions.pop(session_id, None)
                cleaned += 1

        # metadata 항목 없이 state 에만 `_metadata` 가 있는 예전 세션도 본다.
        for session_id in list(self._memory_sessions.keys()):
            if session_id in self._session_metadata:
                continue
            state = self._memory_sessions.get(session_id)
            if state and self._is_sweepable_in_memory(state.get("_metadata")):
                self._memory_sessions.pop(session_id, None)
                cleaned += 1

        return cleaned

    def _count_org_sessions_today(self, organization_id: str) -> int:
        """Count sessions created today for an organization (in-memory mode)."""
        today_start = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        count = 0
        for state in self._memory_sessions.values():
            if state.get("organization_id") == organization_id:
                metadata = state.get("_metadata")
                if metadata:
                    try:
                        created = to_aware_utc(datetime.fromisoformat(metadata["created_at"]))
                        if created >= today_start:
                            count += 1
                    except (KeyError, ValueError):
                        pass
        return count

    async def list_sessions(
        self,
        user_id: str | None = None,
        limit: int = 50,
        project_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """List sessions, optionally scoped to one project.

        `project_id` 는 저장소 질의로 내려간다. 호출자가 결과 목록을 걸러내면
        `limit` 이 필터보다 먼저 적용돼, 대상 프로젝트의 세션이 상위 `limit` 개
        밖에 있으면 없는 것처럼 보인다.
        """
        if self.use_database:
            async with async_session_factory() as db:
                repo = SessionRepository(db)
                if user_id:
                    sessions = await repo.list_by_user(user_id, limit=limit, project_id=project_id)
                else:
                    sessions = await repo.list_active(limit=limit, project_id=project_id)
                return [
                    {
                        "id": s.id,
                        "user_id": s.user_id,
                        "project_id": s.project_id,
                        "status": s.status,
                        "created_at": s.created_at.isoformat() if s.created_at else None,
                        "total_tokens": s.total_tokens,
                        "total_cost_usd": s.total_cost_usd,
                    }
                    for s in sessions
                ]
        else:
            memory_rows: list[dict[str, Any]] = []
            for sid, state in list(self._memory_sessions.items()):
                if len(memory_rows) >= limit:
                    break
                if project_id and state.get("project", {}).get("id") != project_id:
                    continue
                memory_rows.append(
                    {
                        "id": sid,
                        "user_id": state.get("user_id"),
                        "project_id": state.get("project", {}).get("id"),
                        "status": "active",
                        "created_at": state.get("created_at"),
                        "total_tokens": sum(
                            u.get("total_tokens", 0) for u in state.get("token_usage", {}).values()
                        ),
                        "total_cost_usd": state.get("total_cost", 0),
                    }
                )
            return memory_rows

    async def update_cost(
        self,
        session_id: str,
        total_tokens: int,
        total_cost_usd: float,
    ) -> bool:
        """Update session cost tracking."""
        if self.use_database:
            async with async_session_factory() as db:
                repo = SessionRepository(db)
                result = await repo.update_cost(session_id, total_tokens, total_cost_usd)
                await db.commit()
                return result
        else:
            # In-memory mode - cost is already tracked in state
            return True

    async def save_message(
        self,
        session_id: str,
        role: str,
        content: str,
        message_type: str | None = None,
        agent_id: str | None = None,
        tool_name: str | None = None,
        tool_args: dict | None = None,
        tool_result: dict | None = None,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
    ) -> None:
        """Save a message to the database (if enabled)."""
        if self.use_database:
            async with async_session_factory() as db:
                repo = MessageRepository(db)
                await repo.create(
                    session_id=session_id,
                    role=role,
                    content=content,
                    message_type=message_type,
                    agent_id=agent_id,
                    tool_name=tool_name,
                    tool_args=tool_args,
                    tool_result=tool_result,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                )
                await db.commit()

    async def save_task(
        self,
        task_id: str,
        session_id: str,
        title: str,
        description: str = "",
        parent_id: str | None = None,
        dependencies: list[str] | None = None,
    ) -> None:
        """Save a task to the database (if enabled)."""
        if self.use_database:
            async with async_session_factory() as db:
                repo = TaskRepository(db)
                await repo.create(
                    task_id=task_id,
                    session_id=session_id,
                    title=title,
                    description=description,
                    parent_id=parent_id,
                    dependencies=dependencies,
                )
                await db.commit()

    async def update_task_status(
        self,
        task_id: str,
        status: str,
        result: dict | None = None,
        error: str | None = None,
    ) -> None:
        """Update task status in the database (if enabled)."""
        if self.use_database:
            async with async_session_factory() as db:
                repo = TaskRepository(db)
                await repo.update_status(task_id, status, result, error)
                await db.commit()


# Global service instance
_session_service: SessionService | None = None


def get_session_service() -> SessionService:
    """Get the global session service instance."""
    global _session_service
    if _session_service is None:
        _session_service = SessionService()
    return _session_service


def set_session_service(service: SessionService) -> None:
    """Set the global session service instance."""
    global _session_service
    _session_service = service
