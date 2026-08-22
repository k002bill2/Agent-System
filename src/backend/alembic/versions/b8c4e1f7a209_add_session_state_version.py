"""add sessions.version for optimistic concurrency

Revision ID: b8c4e1f7a209
Revises: a7d3f1b9c2e4
Create Date: 2026-08-22

`update_state` 가 `state_json` 을 통째로 덮어쓰는데 버전이 없어, 두 프로세스가
read-modify-write 를 겹치면 늦게 쓴 쪽이 앞선 변경을 지운다(lost update).
승인 이중 소비(#283)와 세션 TTL 경합(#289)이 같은 부류의 사례다.

`version` 은 조건부 UPDATE 의 기준이 된다 —
`UPDATE sessions SET ..., version = version + 1 WHERE id = ? AND version = ?`.

기존 행은 전부 1 로 채워진다. 컬럼 도입 전에 읽어둔 state 에는 버전이 없으므로
그런 쓰기는 무조건 UPDATE 로 떨어진다 — 배포 순간에 충돌이 쏟아지지 않는다.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "b8c4e1f7a209"
down_revision: str | Sequence[str] | None = "a7d3f1b9c2e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1")


def downgrade() -> None:
    op.execute("ALTER TABLE sessions DROP COLUMN IF EXISTS version")
