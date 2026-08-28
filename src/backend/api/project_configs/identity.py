"""정규 프로젝트 신원(`ProjectModel.id`) ↔ 모니터 식별자 번역.

DB 모드에서 프로젝트의 권위는 `ProjectModel` 이다 — `/api/projects`, 세션
리졸버, `deps.require_project_role`, `api/git/_shared.resolve_project` 가 전부
UUID 를 키로 쓴다. 반면 `.claude/` 자산을 실제로 읽는 `ProjectConfigMonitor`
는 경로 파생 키(`-Users-me-Work-Proj`)밖에 모른다.

두 어휘를 섞지 않기 위해 방향을 하나로 고정한다:

  - **바깥으로 나가는 신원은 정규 DB id** (`stamp_*`). 경로 파생 id 를 공개
    식별자로 내보내지 않는다. 대시보드는 목록·요약에서 받은 `project_id` 를
    그대로 다음 요청에 쓰므로(`stores/projectConfigs/`), 여기서 새는 id 는
    곧 화면마다 다른 키가 된다.
  - **안으로 들어온 정규 id 는 모니터 식별자로 해석**
    (`monitor_id_for_registered_path`). 해석은 **DB 에 등록된 경로**에 대해서만
    한다 — 파일시스템을 훑어 후보를 찾지 않는다. 등록되지 않은 프로젝트는
    해석되지 않고, 호출자는 평소대로 404 를 낸다(fail-closed).

파일시스템 모드는 이 모듈을 쓰지 않는다. 그 모드에서는 경로 파생 id 가 곧
정규 id 이므로 번역할 것이 없다.
"""

import logging
import os
from typing import TypeVar

from fastapi import Request
from pydantic import BaseModel

from models.project_config import ProjectConfigSummary, ProjectInfo
from services.project_config_monitor import get_project_config_monitor

logger = logging.getLogger(__name__)

# `require_project_config_access` 가 `{project_id}` 를 모니터 식별자로 바꿔치기
# 하면서 원래의 정규 id 를 남겨 두는 요청 스코프 슬롯. 라우트가 선언하지 않은
# 키라 FastAPI 의 파라미터 해석에는 잡히지 않는다.
CANONICAL_ID_SLOT = "_aos_canonical_project_id"

# `ProjectConfigSummary` 안에서 `project_id` 를 들고 다니는 자식 자산 필드.
_SUMMARY_CHILD_FIELDS = (
    "skills",
    "agents",
    "mcp_servers",
    "user_mcp_servers",
    "hooks",
    "commands",
    "rules",
    "memories",
)

_ModelT = TypeVar("_ModelT", bound=BaseModel)


def use_database() -> bool:
    return os.getenv("USE_DATABASE", "false").lower() == "true"


def canonical_project_id(request: Request) -> str | None:
    """이 요청의 정규 프로젝트 id. 번역이 없었으면 None."""
    return request.path_params.get(CANONICAL_ID_SLOT)


def canonical_or(request: Request, fallback: str) -> str:
    """이 요청의 공개 프로젝트 id — 번역이 없었으면 들어온 값 그대로.

    파일시스템 모드에서는 들어온 경로 파생 id 가 곧 공개 id 이므로 이 함수의
    결과로 찍는 것이 항등이다. 덕분에 호출부는 모드 분기 없이 무조건 찍으면
    된다 — 분기를 40여 곳에 복제하면 그중 하나를 빠뜨리는 쪽이 진짜 위험이다.
    """
    return canonical_project_id(request) or fallback


def monitor_id_for_registered_path(path: str) -> str | None:
    """DB 에 등록된 경로를 모니터에 붙이고 그 모니터 식별자를 돌려준다.

    `add_external_project` 는 이미 감시 중이면 False 를 돌려주지만 그것은
    실패가 아니다 — 필요한 것은 등록 여부가 아니라 키다. 키는 모니터 자신의
    정규화(`encode_project_path`)로만 만든다.

    호출자가 넘기는 경로는 **DB 행의 경로**뿐이다. 이 함수는 파일시스템을
    탐색하지 않으므로 미등록 프로젝트가 이 경로로 감시 대상이 되지 않는다.
    """
    if not path:
        return None
    monitor = get_project_config_monitor()
    monitor.add_external_project(path)
    return monitor.encode_project_path(path)


def stamp(model: _ModelT, canonical_id: str) -> _ModelT:
    """`project_id` 를 정규 id 로 바꾼 사본 (입력은 그대로 둔다)."""
    return model.model_copy(update={"project_id": canonical_id})


def stamp_summary(summary: ProjectConfigSummary, canonical_id: str) -> ProjectConfigSummary:
    """요약의 프로젝트와 **자식 자산 전부**에 정규 id 를 찍는다.

    자식까지 찍는 이유: 대시보드가 다음 요청을 만들 때 쓰는 것이
    `skill.project_id` · `agent.project_id` 다(`stores/projectConfigs/skills.ts`
    등). 최상위만 바꾸면 한 응답 안에 두 어휘가 섞인다.
    """
    updates: dict[str, object] = {"project": stamp(summary.project, canonical_id)}
    for field in _SUMMARY_CHILD_FIELDS:
        updates[field] = [stamp(item, canonical_id) for item in getattr(summary, field)]
    return summary.model_copy(update=updates)


def stamp_project_info(project: ProjectInfo, canonical_id: str) -> ProjectInfo:
    return stamp(project, canonical_id)


async def canonical_id_for_path(path: str) -> str | None:
    """이 파일시스템 경로로 등록된 DB 프로젝트의 정규 id (없으면 None).

    경로로 들어오는 표면(`/by-path`)의 응답 신원을 맞추기 위한 최선 노력
    조회다. 인가 판단에는 쓰이지 않으므로 조회 실패는 번역 없음으로 떨어진다
    — 지금 DB 를 전혀 보지 않는 라우트에 새 실패 모드를 만들지 않기 위해서다.
    """
    if not use_database() or not path:
        return None

    try:
        from sqlalchemy import select

        from db.database import async_session_factory
        from db.models import ProjectModel

        target = get_project_config_monitor().encode_project_path(path)
        async with async_session_factory() as session:
            result = await session.execute(
                select(ProjectModel).where(ProjectModel.is_active == True)  # noqa: E712
            )
            for row in result.scalars().all():
                if not row.path:
                    continue
                if target == _encode(str(row.path)):
                    return str(row.id)
    except Exception:
        logger.warning("Canonical project id lookup by path failed", exc_info=True)
    return None


def _encode(path: str) -> str:
    return get_project_config_monitor().encode_project_path(path)
