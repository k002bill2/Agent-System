"""add_project_invitations

Revision ID: f3a8b2c1d4e5
Revises: 86bdb0f50c3c
Create Date: 2026-02-18

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f3a8b2c1d4e5"
down_revision: str | Sequence[str] | None = "86bdb0f50c3c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Use raw SQL with IF NOT EXISTS to handle cases where the table
    # was created outside of Alembic migrations.
    op.execute("""
        CREATE TABLE IF NOT EXISTS project_invitations (
            id VARCHAR(36) NOT NULL,
            project_id VARCHAR(36) NOT NULL,
            invited_by VARCHAR(36),
            email VARCHAR(255) NOT NULL,
            role VARCHAR(20) NOT NULL,
            token VARCHAR(128) NOT NULL,
            status VARCHAR(20) DEFAULT 'pending' NOT NULL,
            expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
            created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
            PRIMARY KEY (id),
            FOREIGN KEY(invited_by) REFERENCES users (id) ON DELETE SET NULL,
            UNIQUE (token),
            CONSTRAINT uq_project_invitation_email UNIQUE (project_id, email)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_project_invitation_token
        ON project_invitations (token)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_project_invitation_project
        ON project_invitations (project_id)
    """)


def downgrade() -> None:
    op.drop_index("ix_project_invitation_project", table_name="project_invitations")
    op.drop_index("ix_project_invitation_token", table_name="project_invitations")
    op.drop_table("project_invitations")
