"""Database connection and session management."""

import os
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

# Database URL from environment
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://aos:aos@localhost:5432/aos",
)

# Build connect_args with optional SSL
_connect_args: dict = {"statement_cache_size": 0}

_db_ssl_mode = os.getenv("DB_SSL_MODE", "")
if _db_ssl_mode:
    import ssl as _ssl

    ssl_ctx = _ssl.create_default_context()
    _db_ssl_cert_path = os.getenv("DB_SSL_CERT_PATH", "")
    if _db_ssl_cert_path:
        ssl_ctx.load_verify_locations(_db_ssl_cert_path)
    if _db_ssl_mode == "require":
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = _ssl.CERT_NONE
    _connect_args["ssl"] = ssl_ctx

# Create async engine
engine = create_async_engine(
    DATABASE_URL,
    echo=os.getenv("DB_ECHO", "false").lower() == "true",
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    connect_args=_connect_args,
)

# Async session factory
async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all models."""

    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Get database session (FastAPI dependency).

    Usage:
        async def handler(db: AsyncSession = Depends(get_db)) -> ...: ...
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Initialize database - create all tables and run migrations."""
    # Import models to register them with Base.metadata before create_all
    import db.models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Run incremental migrations for columns added after initial create_all
    await _run_migrations()


async def _run_migrations() -> None:
    """Run incremental schema migrations.

    create_all does NOT add new columns to existing tables,
    so we handle column additions here.
    """
    from sqlalchemy import text

    async with engine.begin() as conn:
        # Migration 1: Add 'role' column to users table
        result = await conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'users' AND column_name = 'role'"
            )
        )
        if not result.fetchone():
            await conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user'"))
            # Sync existing is_admin flags
            await conn.execute(
                text(
                    "UPDATE users SET role = 'admin' WHERE is_admin = true AND (role IS NULL OR role = 'user')"
                )
            )

        # Migration 2: Add 'sort_order' column to menu_visibility table
        result = await conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'menu_visibility' AND column_name = 'sort_order'"
            )
        )
        if not result.fetchone():
            await conn.execute(text("ALTER TABLE menu_visibility ADD COLUMN sort_order INTEGER"))

        # Migration 3: Create merge_requests table
        result = await conn.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_name = 'merge_requests'"
            )
        )
        if not result.fetchone():
            await conn.execute(
                text("""
                CREATE TABLE merge_requests (
                    id VARCHAR(36) PRIMARY KEY,
                    project_id VARCHAR(100) NOT NULL,
                    title VARCHAR(500) NOT NULL,
                    description TEXT,
                    source_branch VARCHAR(200) NOT NULL,
                    target_branch VARCHAR(200) NOT NULL,
                    status VARCHAR(20) DEFAULT 'open',
                    conflict_status VARCHAR(20) DEFAULT 'unknown',
                    auto_merge BOOLEAN DEFAULT FALSE,
                    author_id VARCHAR(100),
                    author_name VARCHAR(200),
                    author_email VARCHAR(300),
                    reviewers JSONB DEFAULT '[]'::jsonb,
                    approved_by JSONB DEFAULT '[]'::jsonb,
                    merged_by VARCHAR(100),
                    closed_by VARCHAR(100),
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    merged_at TIMESTAMP,
                    closed_at TIMESTAMP
                )
            """)
            )
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_merge_requests_project_status "
                    "ON merge_requests (project_id, status)"
                )
            )
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_merge_requests_created "
                    "ON merge_requests (created_at)"
                )
            )

        # Migration 4: Create branch_protection_rules table
        result = await conn.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_name = 'branch_protection_rules'"
            )
        )
        if not result.fetchone():
            await conn.execute(
                text("""
                CREATE TABLE branch_protection_rules (
                    id VARCHAR(36) PRIMARY KEY,
                    project_id VARCHAR(100) NOT NULL,
                    branch_pattern VARCHAR(200) NOT NULL,
                    require_approvals INTEGER DEFAULT 0,
                    require_no_conflicts BOOLEAN DEFAULT TRUE,
                    allowed_merge_roles JSONB DEFAULT '["owner","admin"]'::jsonb,
                    allow_force_push BOOLEAN DEFAULT FALSE,
                    allow_deletion BOOLEAN DEFAULT FALSE,
                    auto_deploy BOOLEAN DEFAULT FALSE,
                    deploy_workflow VARCHAR(200),
                    enabled BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """)
            )
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_branch_protection_project "
                    "ON branch_protection_rules (project_id)"
                )
            )
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_branch_protection_enabled "
                    "ON branch_protection_rules (project_id, enabled)"
                )
            )

        # Migration 5: Add auto_merge column to merge_requests (if table existed before)
        result = await conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'merge_requests' AND column_name = 'auto_merge'"
            )
        )
        if not result.fetchone():
            await conn.execute(
                text("ALTER TABLE merge_requests ADD COLUMN auto_merge BOOLEAN DEFAULT FALSE")
            )

        # Migration 6: Create project_access table for RBAC
        result = await conn.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_name = 'project_access'"
            )
        )
        if not result.fetchone():
            await conn.execute(
                text("""
                CREATE TABLE project_access (
                    id VARCHAR(36) PRIMARY KEY,
                    project_id VARCHAR(36) NOT NULL,
                    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    role VARCHAR(20) NOT NULL,
                    granted_by VARCHAR(36),
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    CONSTRAINT uq_project_user UNIQUE (project_id, user_id)
                )
            """)
            )
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_project_access_project "
                    "ON project_access (project_id)"
                )
            )
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_project_access_user ON project_access (user_id)"
                )
            )
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_project_access_project_user "
                    "ON project_access (project_id, user_id)"
                )
            )

        # Migration 8: Create projects table for DB-managed project registry
        result = await conn.execute(
            text("SELECT table_name FROM information_schema.tables WHERE table_name = 'projects'")
        )
        if not result.fetchone():
            await conn.execute(
                text("""
                CREATE TABLE projects (
                    id VARCHAR(36) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL UNIQUE,
                    slug VARCHAR(100) NOT NULL UNIQUE,
                    description TEXT,
                    path VARCHAR(1000),
                    is_active BOOLEAN DEFAULT TRUE,
                    settings JSONB DEFAULT '{}'::jsonb,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL
                )
            """)
            )
            await conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_projects_active ON projects (is_active)")
            )
            await conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_projects_slug ON projects (slug)")
            )
            await conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_projects_created ON projects (created_at)")
            )

            # Seed: "Agent-System" project
            import uuid

            agent_system_id = str(uuid.uuid4())
            await conn.execute(
                text(
                    "INSERT INTO projects (id, name, slug, description, path, is_active) "
                    "VALUES (:id, :name, :slug, :desc, :path, TRUE) "
                    "ON CONFLICT (name) DO NOTHING"
                ),
                {
                    "id": agent_system_id,
                    "name": "Agent-System",
                    "slug": "agent-system",
                    "desc": "LangGraph 기반 멀티 에이전트 오케스트레이션 서비스",
                    "path": None,  # Will be set via API if needed
                },
            )

        # Migration 9: Add last_run_at and last_run_status to workflow_definitions
        result = await conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'workflow_definitions' AND column_name = 'last_run_at'"
            )
        )
        if not result.fetchone():
            await conn.execute(
                text("ALTER TABLE workflow_definitions ADD COLUMN last_run_at TIMESTAMP")
            )
            await conn.execute(
                text("ALTER TABLE workflow_definitions ADD COLUMN last_run_status VARCHAR(20)")
            )

        # Migration 10: Create llm_model_configs table and seed from registry
        result = await conn.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_name = 'llm_model_configs'"
            )
        )
        if not result.fetchone():
            await conn.execute(
                text("""
                CREATE TABLE llm_model_configs (
                    id VARCHAR(100) PRIMARY KEY,
                    display_name VARCHAR(255) NOT NULL,
                    provider VARCHAR(50) NOT NULL,
                    context_window INTEGER NOT NULL DEFAULT 128000,
                    input_price FLOAT NOT NULL DEFAULT 0.001,
                    output_price FLOAT NOT NULL DEFAULT 0.002,
                    is_default BOOLEAN NOT NULL DEFAULT FALSE,
                    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                    supports_tools BOOLEAN NOT NULL DEFAULT TRUE,
                    supports_vision BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """)
            )
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_llm_model_provider_enabled "
                    "ON llm_model_configs (provider, is_enabled)"
                )
            )
            # Seed from in-memory registry
            from models.llm_models import _MODELS

            for model in _MODELS:
                await conn.execute(
                    text(
                        "INSERT INTO llm_model_configs "
                        "(id, display_name, provider, context_window, input_price, output_price, "
                        "is_default, is_enabled, supports_tools, supports_vision) "
                        "VALUES (:id, :display_name, :provider, :context_window, :input_price, "
                        ":output_price, :is_default, :is_enabled, :supports_tools, :supports_vision) "
                        "ON CONFLICT (id) DO UPDATE SET "
                        "display_name = EXCLUDED.display_name, "
                        "context_window = EXCLUDED.context_window, "
                        "input_price = EXCLUDED.input_price, "
                        "output_price = EXCLUDED.output_price, "
                        "supports_tools = EXCLUDED.supports_tools, "
                        "supports_vision = EXCLUDED.supports_vision"
                    ),
                    {
                        "id": model.id,
                        "display_name": model.display_name,
                        "provider": model.provider.value,
                        "context_window": model.context_window,
                        "input_price": model.input_price,
                        "output_price": model.output_price,
                        "is_default": model.is_default,
                        "is_enabled": model.is_enabled,
                        "supports_tools": model.supports_tools,
                        "supports_vision": model.supports_vision,
                    },
                )
            print(f"✅ llm_model_configs seeded with {len(_MODELS)} models")

        # Migration 11: Widen organization_invitations.token from varchar(36) to varchar(64)
        # secrets.token_urlsafe(32) produces 44-char tokens, which exceed varchar(36)
        result = await conn.execute(
            text(
                "SELECT character_maximum_length FROM information_schema.columns "
                "WHERE table_name = 'organization_invitations' AND column_name = 'token'"
            )
        )
        row = result.fetchone()
        if row and row[0] and row[0] < 64:
            await conn.execute(
                text("ALTER TABLE organization_invitations ALTER COLUMN token TYPE VARCHAR(64)")
            )

        # Migration 7: Add unique constraint and FK to workflow_secrets
        result = await conn.execute(
            text(
                "SELECT constraint_name FROM information_schema.table_constraints "
                "WHERE table_name = 'workflow_secrets' AND constraint_name = 'uq_secret_name_scope'"
            )
        )
        if not result.fetchone():
            # Add unique constraint (name, scope, scope_id)
            await conn.execute(
                text(
                    "ALTER TABLE workflow_secrets "
                    "ADD CONSTRAINT uq_secret_name_scope UNIQUE (name, scope, scope_id)"
                )
            )
            # Add FK from created_by → users.id (if column exists but has no FK)
            try:
                await conn.execute(
                    text(
                        "ALTER TABLE workflow_secrets "
                        "ADD CONSTRAINT fk_workflow_secrets_created_by "
                        "FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL"
                    )
                )
            except Exception:
                pass  # FK may already exist or users table may not exist yet

        # Migration 12: Add 'version' column to sessions for optimistic concurrency
        #
        # `update_state` 가 state_json 을 통째로 덮으므로, 겹친 read-modify-write 를
        # 조건부 UPDATE 로 걸러낸다 (issue #292). create_all 은 기존 테이블에 컬럼을
        # 추가하지 않으므로 여기에도 있어야 한다 — 없으면 이미 떠 있던 배포에서
        # SELECT 가 UndefinedColumn 으로 죽는다. 빈 DB 에서는 create_all 이 이미
        # 만들어 두므로 `IF NOT EXISTS` 가 필수다 (그것을 빼면
        # `test_init_db_schema_convergence` 가 즉시 실패한다).
        await conn.execute(
            text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1")
        )

        # Migration 13: 모델에 선언됐는데 기존 테이블에 없는 컬럼을 채운다 (추가 전용)
        #
        # `create_all()` 은 **기존 테이블을 건드리지 않는다.** 그래서 새 컬럼은 위와 같은
        # 수작업 블록으로만 따라잡혀 왔고, 빠뜨리면 이미 떠 있던 배포에서 ORM 질의가
        # UndefinedColumn 으로 죽는다. 실제로 11 개가 그 상태였다 — 삭제한 alembic
        # 마이그레이션이 유일한 경로였고 그것을 부르는 자동화는 없었다 (issue #310).
        #
        # 케이스를 하나씩 늘리는 대신 **부류를 닫는다**: 메타데이터와 information_schema 를
        # 대조해 없는 컬럼만 추가한다. DDL 은 `CreateColumn` 으로 렌더하므로 `create_all()`
        # 이 새 DB 에 쓰는 것과 같은 문장이 된다.
        #
        # 인덱스도 같이 맞춘다 — 컬럼만 채우면 수렴을 주장하면서 질의 성능이 빠진다
        # (`audit_logs.project_id` 는 컬럼과 인덱스 2 개가 한 변경이었다).
        #
        # 하지 않는 것: DROP·타입 변경. 파괴적이거나 되돌리기 어려운 연산은 사람이
        # 판단할 일이고, 여기는 기동마다 무인으로 도는 자리다.
        from sqlalchemy.dialects import postgresql
        from sqlalchemy.schema import CreateColumn, CreateIndex

        rows = await conn.execute(
            text(
                "SELECT table_name, column_name FROM information_schema.columns "
                "WHERE table_schema = current_schema()"
            )
        )
        present: dict[str, set[str]] = {}
        for table_name, column_name in rows:
            present.setdefault(table_name, set()).add(column_name)

        pg_dialect = postgresql.dialect()
        for table in Base.metadata.sorted_tables:
            existing_columns = present.get(table.name)
            if existing_columns is None:
                continue  # 테이블 자체가 없으면 create_all 이 만든다
            for column in table.columns:
                if column.name in existing_columns:
                    continue
                if not column.nullable and column.server_default is None:
                    # 기존 행을 채울 값이 없다. 조용히 NULL 허용으로 바꾸면 모델과
                    # 어긋나므로 손대지 않고 알린다.
                    print(
                        f"⚠️  {table.name}.{column.name} 누락 — NOT NULL 인데 기본값이 없어 "
                        "자동 추가하지 않는다 (수동 백필 필요)"
                    )
                    continue
                ddl = CreateColumn(column).compile(dialect=pg_dialect)
                await conn.execute(text(f"ALTER TABLE {table.name} ADD COLUMN IF NOT EXISTS {ddl}"))
                existing_columns.add(column.name)
                print(f"✅ {table.name}.{column.name} 컬럼 추가")

        # 인덱스: 존재하는 테이블에 대해 메타데이터가 선언한 것 중 없는 것만 만든다.
        # `IF NOT EXISTS` 라 멱등하다. 큰 테이블에서는 이 생성이 기동을 잠시 붙잡을 수
        # 있으나, 인덱스가 없는 채로 도는 것보다 낫다 (한 번만 일어난다).
        index_rows = await conn.execute(
            text("SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()")
        )
        existing_indexes = {row[0] for row in index_rows}
        for table in Base.metadata.sorted_tables:
            if table.name not in present:
                continue
            for index in table.indexes:
                if index.name in existing_indexes:
                    continue
                # 위에서 건너뛴 컬럼(NOT NULL + 기본값 없음)을 참조하는 인덱스는
                # 만들 수 없다. 시도하면 UndefinedColumn 으로 init_db() 자체가 죽어,
                # 경고만 남기고 기동하려던 설계가 무너진다.
                index_columns = {c.name for c in index.columns}
                if not index_columns <= present[table.name]:
                    print(
                        f"⚠️  {index.name} 인덱스 건너뜀 — 참조 컬럼 "
                        f"{sorted(index_columns - present[table.name])} 이 아직 없다"
                    )
                    continue
                await conn.execute(
                    text(str(CreateIndex(index, if_not_exists=True).compile(dialect=pg_dialect)))
                )
                print(f"✅ {index.name} 인덱스 생성")


async def close_db() -> None:
    """Close database connection pool."""
    await engine.dispose()
