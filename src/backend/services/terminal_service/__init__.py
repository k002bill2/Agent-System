"""터미널 서비스 패키지.

원래 단일 `services/terminal_service.py`(867줄)를 분할한 결과.
소비자의 `from services.terminal_service import TERMINAL_INFO` 는 그대로 유효하다.

재노출은 **좁게** 한다 — 소비자가 실제로 요구하는 6종뿐이다.
`shutil`·`sys`·`asyncio`·`_write_exec_script` 를 여기 두지 않는 것은 의도다:
테스트의 패치는 그 이름들을 실제로 쓰는 `orca` 경로를 겨냥한다.
"""

from .base import TERMINAL_INFO, TerminalType
from .orca import OrcaAdapter, _resolve_orca_command
from .service import TerminalService, get_terminal_service

__all__ = [
    "TERMINAL_INFO",
    "OrcaAdapter",
    "TerminalService",
    "TerminalType",
    "_resolve_orca_command",
    "get_terminal_service",
]
