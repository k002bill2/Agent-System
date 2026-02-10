"""add project_name and effort_level to feedbacks table

Revision ID: a1b2c3d4e5f6
Revises: 5d070cc25fe8
Create Date: 2026-02-10 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = "5d070cc25fe8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add project_name and effort_level columns to feedbacks table."""
    op.add_column("feedbacks", sa.Column("project_name", sa.String(255), nullable=True))
    op.add_column("feedbacks", sa.Column("effort_level", sa.String(20), nullable=True))


def downgrade() -> None:
    """Remove project_name and effort_level columns from feedbacks table."""
    op.drop_column("feedbacks", "effort_level")
    op.drop_column("feedbacks", "project_name")
