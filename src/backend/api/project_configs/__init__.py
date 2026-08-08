"""프로젝트 설정 API 패키지 (`.claude/` 자산 관리).

`api/project_configs.py`(1,818줄 · 60라우트)를 도메인별 모듈로 분할한 결과.
소비자의 import 경로는 분할 전과 동일하게 유지된다.

밖으로 나가는 이름은 `router` 하나뿐이다 — 실측(2026-08-08) 결과 소비자는
`api/app.py:94` 의 `safe_import("api.project_configs", "router")` 뿐이고,
모듈 객체 패치(`patch.object`)도 0건이다.

Pydantic 모델은 이 패키지가 아니라 `models/project_config.py` 에 있다.
"""

from . import agents, commands, hooks, mcp, memories, rules, skills
from ._legacy import router

# **include 순서가 계약이다.** 실측(2026-08-08) 완전 가림 제약 10건 중 모듈
# 간에 걸리는 것은 둘이다:
#
#   1. `GET /{project_id}` 가 `/global` · `/paths` · `/stream` · `/by-path` 를 삼킨다
#   2. `{project_id}/rules` 계열이 `global/rules` 계열을 삼킨다
#      (`{project_id}` 자리에 리터럴 `global` 이 들어가 모양이 같아진다)
#
# 따라서 전역 설정 모듈이 프로젝트 규칙·요약 모듈보다 **먼저** 와야 한다.
# 알파벳 순 정렬을 하지 마라. test_no_shadowing_route_pairs 가 이를 잡는다.
#
# `skills` · `agents` · `mcp` · `hooks` · `commands` · `memories` 는 전부
# 3세그먼트 이상이라 모듈 간 순서 제약이 없다. `rules` 만 전역 뒤여야 한다.
#
# `memories` 의 제약(`/{memory_id}` 가 `/index` 를 삼킨다)은 **모듈 안**이라
# 여기서 풀 수 없다 — 그 모듈의 핸들러 선언 순서가 계약이다.
router.include_router(skills.router)
router.include_router(agents.router)
router.include_router(mcp.router)
router.include_router(hooks.router)
router.include_router(commands.router)
router.include_router(memories.router)
router.include_router(rules.router)

__all__ = ["router"]
