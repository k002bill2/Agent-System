#!/usr/bin/env python3
"""projects/ 디렉토리에 등록된 프로젝트를 DB에 시딩하는 스크립트.

사용법:
    cd src/backend
    python scripts/seed_projects_to_db.py [--dry-run]
"""

import asyncio
import sys
import uuid
import re
from pathlib import Path

# src/backend를 sys.path에 추가
sys.path.insert(0, str(Path(__file__).parent.parent))


def slugify(name: str) -> str:
    """Generate URL-friendly slug from project name."""
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug.strip("-")


async def main(dry_run: bool = False):
    import os

    os.environ.setdefault("USE_DATABASE", "true")

    from db.database import async_session_factory
    from db.models import ProjectAccessModel, ProjectModel, UserModel
    from models.project import init_projects, list_projects
    from sqlalchemy import select

    # projects/ 디렉토리에서 프로젝트 로드
    base_path = Path(__file__).parent.parent.parent.parent
    init_projects(str(base_path))

    file_projects = list_projects()
    print(f"파일시스템 프로젝트 {len(file_projects)}개 발견:")
    for p in file_projects:
        print(f"  - {p.id}: {p.name} ({p.path})")

    print()
    if dry_run:
        print("[DRY-RUN 모드] DB에 실제로 쓰지 않습니다.\n")

    async with async_session_factory() as session:
        # 어드민 유저 조회 (created_by 에 사용)
        admin_result = await session.execute(
            select(UserModel).where(UserModel.is_admin == True).limit(1)  # noqa: E712
        )
        admin = admin_result.scalar_one_or_none()
        admin_id = admin.id if admin else None
        if admin:
            print(f"어드민 유저: {admin.email} ({admin.id})\n")
        else:
            print("어드민 유저 없음 - created_by는 NULL로 등록됩니다.\n")

        registered = 0
        skipped = 0

        for proj in file_projects:
            slug = slugify(proj.name)

            # 이미 DB에 있는지 확인 (name 또는 slug 기준)
            existing_result = await session.execute(
                select(ProjectModel).where(ProjectModel.slug == slug)
            )
            existing = existing_result.scalar_one_or_none()

            if existing:
                print(f"  {proj.name} [{slug}]: 이미 DB에 있음, 건너뜀")
                skipped += 1
                continue

            project_id = str(uuid.uuid4())
            db_project = ProjectModel(
                id=project_id,
                name=proj.name,
                slug=slug,
                description=proj.description or "",
                path=proj.path,
                is_active=True,
                settings={},
                created_by=admin_id,
            )

            if not dry_run:
                session.add(db_project)

                # owner ACL도 함께 등록
                if admin_id:
                    access = ProjectAccessModel(
                        id=str(uuid.uuid4()),
                        project_id=project_id,
                        user_id=admin_id,
                        role="owner",
                        granted_by=admin_id,
                    )
                    session.add(access)

            print(f"  {proj.name} [{slug}]: {'[DRY-RUN] 등록 예정' if dry_run else '등록 완료'}")
            print(f"    path: {proj.path}")
            print(f"    description: {proj.description or '(없음)'}")
            registered += 1

        if not dry_run:
            await session.commit()

        print(f"\n완료: {registered}개 등록, {skipped}개 건너뜀")


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    asyncio.run(main(dry_run=dry_run))
