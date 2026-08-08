"""프로젝트 설정 API 패키지 (`.claude/` 자산 관리).

`api/project_configs.py`(1,818줄 · 60라우트)를 도메인별 모듈로 분할한 결과.
소비자의 import 경로는 분할 전과 동일하게 유지된다.

밖으로 나가는 이름은 `router` 하나뿐이다 — 실측(2026-08-08) 결과 소비자는
`api/app.py:94` 의 `safe_import("api.project_configs", "router")` 뿐이고,
모듈 객체 패치(`patch.object`)도 0건이다.

Pydantic 모델은 이 패키지가 아니라 `models/project_config.py` 에 있다.
"""

from ._legacy import router

__all__ = ["router"]
