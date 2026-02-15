"""add_project_id_to_audit_logs

Revision ID: 86bdb0f50c3c
Revises: a1b2c3d4e5f6
Create Date: 2026-02-15 17:50:20.052616

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "86bdb0f50c3c"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add project_id column and indexes to audit_logs."""
    op.add_column("audit_logs", sa.Column("project_id", sa.String(length=36), nullable=True))
    op.create_index(op.f("ix_audit_logs_project_id"), "audit_logs", ["project_id"], unique=False)
    op.create_index("ix_audit_project_action", "audit_logs", ["project_id", "action"], unique=False)


def downgrade() -> None:
    """Remove project_id column and indexes from audit_logs."""
    op.drop_index("ix_audit_project_action", table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_project_id"), table_name="audit_logs")
    op.drop_column("audit_logs", "project_id")
