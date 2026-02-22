#!/usr/bin/env python3
"""기존 DB 프로젝트에 어드민 유저를 owner로 등록하는 마이그레이션 스크립트."""

import asyncio
import sys
import uuid
from pathlib import Path

# src/backend를 sys.path에 추가
sys.path.insert(0, str(Path(__file__).parent.parent))


async def main():
    import os

    os.environ.setdefault("USE_DATABASE", "true")

    from sqlalchemy import select

    from db.database import async_session_factory
    from db.models import ProjectAccessModel, ProjectModel, UserModel

    async with async_session_factory() as session:
        # 어드민 유저 조회
        admin_result = await session.execute(
            select(UserModel).where(UserModel.is_admin == True).limit(1)  # noqa: E712
        )
        admin = admin_result.scalar_one_or_none()
        if not admin:
            print("어드민 유저가 없습니다. 먼저 어드민 계정을 만들어주세요.")
            return

        print(f"어드민 유저: {admin.email} ({admin.id})")

        # 모든 활성 프로젝트 조회
        projects_result = await session.execute(
            select(ProjectModel).where(ProjectModel.is_active == True)  # noqa: E712
        )
        projects = projects_result.scalars().all()
        print(f"총 {len(projects)}개 프로젝트 처리")

        registered = 0
        skipped = 0

        for proj in projects:
            # 이미 ACL이 있는지 확인
            acl_result = await session.execute(
                select(ProjectAccessModel)
                .where(ProjectAccessModel.project_id == proj.id)
                .limit(1)
            )
            existing = acl_result.scalar_one_or_none()
            if existing:
                print(f"  {proj.name}: ACL 이미 있음, 건너뜀")
                skipped += 1
                continue

            # owner 결정: created_by가 있으면 해당 유저, 없으면 어드민
            owner_id = proj.created_by or admin.id
            if proj.created_by:
                owner_result = await session.execute(
                    select(UserModel).where(UserModel.id == proj.created_by)
                )
                owner = owner_result.scalar_one_or_none()
                if not owner:
                    owner_id = admin.id

            access = ProjectAccessModel(
                id=str(uuid.uuid4()),
                project_id=proj.id,
                user_id=owner_id,
                role="owner",
                granted_by=admin.id,
            )
            session.add(access)
            print(f"  {proj.name}: owner={owner_id}")
            registered += 1

        await session.commit()
        print(f"\n완료: {registered}개 등록, {skipped}개 건너뜀")


if __name__ == "__main__":
    asyncio.run(main())
