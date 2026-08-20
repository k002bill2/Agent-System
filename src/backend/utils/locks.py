"""이벤트 루프에 안전한 asyncio 락 도구."""

import asyncio
import weakref


class LoopBoundLockPool:
    """실행 중인 이벤트 루프마다 락을 하나씩 내주는 풀.

    모듈 수준에 `asyncio.Lock()` 하나를 두면 **처음 경합한 루프에 바인딩**되고,
    다른 루프에서 쓰면 `RuntimeError: is bound to a different event loop` 가 난다.
    프로덕션은 루프가 하나뿐이라 무해하지만, 루프를 새로 만드는 테스트에서 그
    RuntimeError 가 "두 번째 요청이 거부됐다"로 오인되면 검증이 조용히 무력해진다
    (`return_exceptions=True` 로 모으면 예외 종류가 가려진다).

    루프는 약한 참조로 들고 있어 끝난 루프의 락은 자동으로 사라진다.
    """

    def __init__(self) -> None:
        self._locks: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Lock] = (
            weakref.WeakKeyDictionary()
        )

    def lock(self) -> asyncio.Lock:
        """현재 실행 중인 루프의 락 (`async with pool.lock():` 형태로 쓴다)."""
        loop = asyncio.get_running_loop()
        lock = self._locks.get(loop)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[loop] = lock
        return lock
