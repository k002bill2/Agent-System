"""TerminalService — 어댑터 선택·실행 오케스트레이션과 싱글턴 홀더.

`_terminal_service` 는 `get_terminal_service` 가 `global` 로 재바인딩하므로
반드시 같은 모듈에 있어야 한다 — 가르면 인스턴스 사본이 분열된다.
"""

from .adapters import (
    AlacrittyAdapter,
    CmuxAdapter,
    GhosttyAdapter,
    ITermAdapter,
    KittyAdapter,
    TerminalAppAdapter,
    TmuxAdapter,
    WarpAdapter,
    WezTermAdapter,
)
from .base import TERMINAL_INFO, TerminalAdapter, TerminalType
from .orca import OrcaAdapter


class TerminalService:
    """Facade that routes execution to the correct terminal adapter."""

    def __init__(self) -> None:
        self._adapters: dict[TerminalType, TerminalAdapter] = {
            TerminalType.WARP: WarpAdapter(),
            TerminalType.TMUX: TmuxAdapter(),
            TerminalType.TERMINAL_APP: TerminalAppAdapter(),
            TerminalType.ITERM2: ITermAdapter(),
            TerminalType.KITTY: KittyAdapter(),
            TerminalType.ALACRITTY: AlacrittyAdapter(),
            TerminalType.GHOSTTY: GhosttyAdapter(),
            TerminalType.WEZTERM: WezTermAdapter(),
            TerminalType.CMUX: CmuxAdapter(),
            TerminalType.ORCA: OrcaAdapter(),
        }

    def get_adapter(self, terminal: TerminalType) -> TerminalAdapter:
        """Return the adapter for the given terminal type."""
        return self._adapters[terminal]

    async def detect_available(self) -> list[dict]:
        """Probe every adapter and return availability info."""
        results: list[dict] = []
        for t, adapter in self._adapters.items():
            info = TERMINAL_INFO[t]
            available = await adapter.is_available()
            results.append(
                {
                    "type": t.value,
                    "name": info["name"],
                    "description": info["description"],
                    "available": available,
                }
            )
        return results


_terminal_service: TerminalService | None = None


def get_terminal_service() -> TerminalService:
    """Return the TerminalService singleton."""
    global _terminal_service
    if _terminal_service is None:
        _terminal_service = TerminalService()
    return _terminal_service
