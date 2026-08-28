"""플레이그라운드 설정 — 저장 모드 플래그 · 경로 · 기본 프롬프트 · 목 도구 목록.

`STORAGE_DIR` 은 패키지 승격으로 이 파일의 깊이가 한 단계 늘어난 만큼
`.parent` 를 하나 더 탄다. 원본(`services/playground_service.py`)이
가리키던 `src/backend/data` 를 그대로 가리켜야 한다 — 세션 파일이 거기 있다.
"""

import os
from pathlib import Path

USE_DATABASE = os.getenv("USE_DATABASE", "false").lower() == "true"


# 패키지 승격으로 이 파일이 한 단계 깊어졌다 — 원본
# `services/playground_service.py` 에서 `.parent.parent` 가 가리키던
# `src/backend/` 를 계속 가리키려면 `.parent` 를 하나 더 타야 한다.
# 기존 `playground_sessions.json` 이 거기 있으므로 경로가 바뀌면
# 세션이 통째로 사라진 것처럼 보인다. `SESSIONS_FILE` 도 여기서 파생된다.
STORAGE_DIR = Path(__file__).parent.parent.parent / "data"


SESSIONS_FILE = STORAGE_DIR / "playground_sessions.json"


DEFAULT_SYSTEM_PROMPT = """당신은 AOS 플랫폼의 AI 어시스턴트입니다.

- 한국어로 답변하고, 코드/명령어/경로는 원문을 그대로 유지합니다.
- project context가 제공되면 그것을 사실의 단일 출처로 삼고,
  컨텍스트에 없는 사실은 추측 대신 "제공된 컨텍스트에 없습니다"라고 명시합니다.
- 답하기 전에 의도와 필요한 정보를 1~2문장으로 정리한 뒤 답변합니다.
- 외부/최신 정보가 필요하면 사용 가능한 도구를 우선 호출합니다.
- 여러 단계가 필요한 작업은 단계별로 명확히 설명합니다."""


PLAYGROUND_TOOLS = {
    "web_search": {
        "name": "web_search",
        "description": "Search the web for information",
        "parameters": {
            "query": {"type": "string", "description": "Search query"},
            "max_results": {"type": "integer", "description": "Max results", "default": 5},
        },
    },
    "code_execute": {
        "name": "code_execute",
        "description": "Execute code in a sandbox",
        "parameters": {
            "language": {"type": "string", "description": "Programming language"},
            "code": {"type": "string", "description": "Code to execute"},
        },
    },
    "file_read": {
        "name": "file_read",
        "description": "Read a file from the workspace",
        "parameters": {
            "path": {"type": "string", "description": "File path"},
        },
    },
    "file_write": {
        "name": "file_write",
        "description": "Write content to a file",
        "parameters": {
            "path": {"type": "string", "description": "File path"},
            "content": {"type": "string", "description": "Content to write"},
        },
    },
    "api_call": {
        "name": "api_call",
        "description": "Make an HTTP API call",
        "parameters": {
            "method": {"type": "string", "description": "HTTP method"},
            "url": {"type": "string", "description": "URL to call"},
            "body": {"type": "object", "description": "Request body"},
        },
    },
}
