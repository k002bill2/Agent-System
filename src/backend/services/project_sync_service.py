"""Project sync service — keeps in-memory PROJECTS_REGISTRY and DB ProjectModel aligned.

파일시스템 기반 PROJECTS_REGISTRY(메모리)와 DB ProjectModel이
따로 진화하지 않도록 동기화 헬퍼를 제공한다.

- sync_project_to_db: 단일 프로젝트 upsert (이름 기준)
- sync_all_projects_to_db: PROJECTS_REGISTRY 전체를 일괄 upsert
"""

from __future__ import annotations

import logging
import os
import re

logger = logging.getLogger(__name__)


def _use_database() -> bool:
    return os.getenv("USE_DATABASE", "false").lower() == "true"


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


async def sync_project_to_db(
    project_id: str,
    name: str,
    path: str,
    description: str | None = None,
) -> None:
    """Upsert a single project into the DB projects table (match by name).

    기존 `api.routes._sync_project_to_db`를 서비스로 추출한 함수.
    DB 미사용 모드에서는 no-op. 예외 발생 시 warning 로그만 남기고 호출자에게 전파하지 않는다.
    """
    if not _use_database():
        return

    try:
        from sqlalchemy import select

        from db.database import async_session_factory
        from db.models import ProjectModel

        slug = _slugify(name)

        async with async_session_factory() as session:
            result = await session.execute(select(ProjectModel).where(ProjectModel.name == name))
            existing = result.scalar_one_or_none()

            if existing:
                if path and existing.path != path:
                    existing.path = path
                if not existing.is_active:
                    existing.is_active = True
                await session.commit()
            else:
                new_project = ProjectModel(
                    id=project_id,
                    name=name,
                    slug=slug,
                    description=description or "",
                    path=path,
                    is_active=True,
                )
                session.add(new_project)
                await session.commit()
    except Exception as e:
        logger.warning("project_sync_failed", extra={"project": name, "error": str(e)})


async def sync_all_projects_to_db() -> int:
    """Sync every PROJECTS_REGISTRY entry to DB at startup.

    Returns:
        시도한 프로젝트 수 (성공/실패 관계없이). 호출자는 로그로 결과 확인.
    """
    if not _use_database():
        return 0

    try:
        from models.project import list_projects
    except Exception as e:
        logger.warning("project_sync_bulk_import_failed", extra={"error": str(e)})
        return 0

    projects = list_projects()
    for project in projects:
        await sync_project_to_db(
            project_id=project.id,
            name=project.name,
            path=project.path,
            description=project.description,
        )

    logger.info("project_sync_bulk_completed", extra={"count": len(projects)})
    return len(projects)
