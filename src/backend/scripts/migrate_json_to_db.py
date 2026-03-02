#!/usr/bin/env python3
"""Migrate JSON data to PostgreSQL database."""

import asyncio
import json
import sys
from datetime import datetime

from utils.time import utcnow
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text

from db.database import async_session_factory, engine
from db.models import (
    Base,
    OrganizationInvitationModel,
    OrganizationMemberModel,
    OrganizationModel,
    UserModel,
)

DATA_DIR = Path(__file__).parent.parent / "data"
ORGS_FILE = DATA_DIR / "organizations.json"
MEMBERS_FILE = DATA_DIR / "organization_members.json"
INVITATIONS_FILE = DATA_DIR / "organization_invitations.json"


def parse_datetime(dt_str: str | None) -> datetime | None:
    """Parse datetime string to datetime object."""
    if not dt_str:
        return None
    try:
        return datetime.fromisoformat(dt_str.replace(" ", "T"))
    except (ValueError, AttributeError):
        return None


async def create_tables():
    """Create database tables if they don't exist."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✓ Database tables created/verified")


async def migrate_organizations():
    """Migrate organizations from JSON to DB."""
    if not ORGS_FILE.exists():
        print("  No organizations.json found, skipping...")
        return 0

    with open(ORGS_FILE, encoding="utf-8") as f:
        orgs_data = json.load(f)

    count = 0
    async with async_session_factory() as session:
        for org_id, org in orgs_data.items():
            # Check if already exists
            result = await session.execute(
                text("SELECT id FROM organizations WHERE id = :id"), {"id": org_id}
            )
            if result.fetchone():
                print(f"  Organization {org['name']} already exists, skipping...")
                continue

            model = OrganizationModel(
                id=org["id"],
                name=org["name"],
                slug=org["slug"],
                description=org.get("description"),
                status=org.get("status", "active"),
                plan=org.get("plan", "free"),
                contact_email=org.get("contact_email"),
                contact_name=org.get("contact_name"),
                logo_url=org.get("logo_url"),
                primary_color=org.get("primary_color"),
                max_members=org.get("max_members", 5),
                max_projects=org.get("max_projects", 3),
                max_sessions_per_day=org.get("max_sessions_per_day", 100),
                max_tokens_per_month=org.get("max_tokens_per_month", 100000),
                current_members=org.get("current_members", 0),
                current_projects=org.get("current_projects", 0),
                tokens_used_this_month=org.get("tokens_used_this_month", 0),
                settings=org.get("settings", {}),
                created_at=parse_datetime(org.get("created_at")) or utcnow(),
                updated_at=parse_datetime(org.get("updated_at")) or utcnow(),
            )
            session.add(model)
            count += 1
            print(f"  + Organization: {org['name']} ({org['slug']})")

        await session.commit()
    return count


async def ensure_users_exist():
    """Ensure users referenced in members exist in the users table."""
    if not MEMBERS_FILE.exists():
        return 0

    with open(MEMBERS_FILE, encoding="utf-8") as f:
        members_data = json.load(f)

    # Collect unique users
    users_to_create = {}
    for member in members_data.values():
        user_id = member["user_id"]
        if user_id not in users_to_create:
            users_to_create[user_id] = {
                "id": user_id,
                "email": member["email"],
                "name": member.get("name"),
            }

    count = 0
    async with async_session_factory() as session:
        for user_id, user_info in users_to_create.items():
            # Check if user exists
            result = await session.execute(
                text("SELECT id FROM users WHERE id = :id"), {"id": user_id}
            )
            if result.fetchone():
                print(f"  User {user_info['email']} already exists")
                continue

            user = UserModel(
                id=user_info["id"],
                email=user_info["email"],
                name=user_info.get("name"),
                oauth_provider="email",  # Assume email provider
                is_active=True,
            )
            session.add(user)
            count += 1
            print(f"  + User: {user_info['email']}")

        await session.commit()
    return count


async def migrate_members():
    """Migrate organization members from JSON to DB."""
    if not MEMBERS_FILE.exists():
        print("  No organization_members.json found, skipping...")
        return 0

    with open(MEMBERS_FILE, encoding="utf-8") as f:
        members_data = json.load(f)

    count = 0
    async with async_session_factory() as session:
        for member_id, member in members_data.items():
            # Check if already exists
            result = await session.execute(
                text("SELECT id FROM organization_members WHERE id = :id"), {"id": member_id}
            )
            if result.fetchone():
                print(f"  Member {member['email']} already exists, skipping...")
                continue

            model = OrganizationMemberModel(
                id=member["id"],
                organization_id=member["organization_id"],
                user_id=member["user_id"],
                email=member["email"],
                name=member.get("name"),
                role=member.get("role", "member"),
                permissions=member.get("permissions", []),
                is_active=member.get("is_active", True),
                invited_by=member.get("invited_by"),
                invited_at=parse_datetime(member.get("invited_at")),
                joined_at=parse_datetime(member.get("joined_at")),
                last_active_at=parse_datetime(member.get("last_active_at")),
                created_at=parse_datetime(member.get("created_at")) or utcnow(),
            )
            session.add(model)
            count += 1
            print(f"  + Member: {member['email']} (role: {member.get('role', 'member')})")

        await session.commit()
    return count


async def migrate_invitations():
    """Migrate invitations from JSON to DB."""
    if not INVITATIONS_FILE.exists():
        print("  No organization_invitations.json found, skipping...")
        return 0

    with open(INVITATIONS_FILE, encoding="utf-8") as f:
        invitations_data = json.load(f)

    count = 0
    async with async_session_factory() as session:
        for inv_id, inv in invitations_data.items():
            # Check if already exists
            result = await session.execute(
                text("SELECT id FROM organization_invitations WHERE id = :id"), {"id": inv_id}
            )
            if result.fetchone():
                print(f"  Invitation for {inv['email']} already exists, skipping...")
                continue

            model = OrganizationInvitationModel(
                id=inv["id"],
                organization_id=inv["organization_id"],
                email=inv["email"],
                role=inv.get("role", "member"),
                invited_by=inv["invited_by"],
                token=inv["token"],
                message=inv.get("message"),
                expires_at=parse_datetime(inv["expires_at"]) or utcnow(),
                accepted=inv.get("accepted", False),
                accepted_at=parse_datetime(inv.get("accepted_at")),
                created_at=parse_datetime(inv.get("created_at")) or utcnow(),
            )
            session.add(model)
            count += 1
            print(f"  + Invitation: {inv['email']}")

        await session.commit()
    return count


async def main():
    """Run migration."""
    print("=" * 60)
    print("  JSON to PostgreSQL Migration")
    print("=" * 60)
    print()

    print("[1/4] Creating database tables...")
    await create_tables()
    print()

    print("[2/5] Migrating organizations...")
    org_count = await migrate_organizations()
    print(f"  → {org_count} organizations migrated")
    print()

    print("[3/5] Ensuring users exist...")
    user_count = await ensure_users_exist()
    print(f"  → {user_count} users created")
    print()

    print("[4/5] Migrating members...")
    member_count = await migrate_members()
    print(f"  → {member_count} members migrated")
    print()

    print("[5/5] Migrating invitations...")
    inv_count = await migrate_invitations()
    print(f"  → {inv_count} invitations migrated")
    print()

    print("=" * 60)
    print("  Migration complete!")
    print(
        f"  Total: {org_count} orgs, {user_count} users, {member_count} members, {inv_count} invitations"
    )
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
