"""#310 회귀: 스키마 생성 경로는 `init_db()` 하나뿐이므로 그것을 검증한다.

Alembic 을 제거하면서(이슈 #310) 스키마의 진실의 출처가 `init_db()` 로 일원화됐다:

    init_db()
      ├─ Base.metadata.create_all()   # 빈 DB → 모델의 테이블 전부
      └─ _run_migrations()            # 이미 떠 있던 DB 따라잡기 (raw DDL)

이 경로는 지금까지 **아무 테스트도 타지 않았다.** DB 모드 테스트들은 자기
`Base.metadata.create_all()` 을 직접 부르므로 `_run_migrations()` 를 건너뛴다.
그래서 기동 시에만 실행되는 raw DDL 이 깨져도 CI 는 초록이었다 — alembic 이
"검증되는 마이그레이션 경로" 를 준다고 문서가 주장하는 동안 실제로는 그 어느
쪽도 검증되지 않았다.

여기서 고정하는 계약은 둘이다.

1. **수렴** — 빈 스키마에 `init_db()` 를 돌리면 결과가 `Base.metadata` 와 일치한다.
2. **멱등** — 두 번 돌려도 실패하지 않고 스키마가 같다 (기동마다 실행되므로).

전용 스키마에서 돌리고 그것만 제거한다. `Base.metadata.drop_all()` 로 정리하면
변수가 실수로 개발 DB 를 가리켰을 때 애플리케이션 테이블을 전부 지운다 —
`test_session_sweep_db.py` 와 같은 이유로 같은 방식을 쓴다.
"""

import os
import uuid

import pytest
import pytest_asyncio
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

import db.database as db_mod
import db.models  # noqa: F401  — Base.metadata 에 모델을 등록한다
from db.database import Base

TEST_DATABASE_URL = os.getenv("AOS_TEST_DATABASE_URL")

pytestmark = [
    pytest.mark.skipif(
        not TEST_DATABASE_URL,
        reason="AOS_TEST_DATABASE_URL 미설정 — init_db 수렴 테스트를 건너뛴다",
    ),
    pytest.mark.asyncio,
]


def _expected_schema() -> dict[str, set[str]]:
    """모델이 선언하는 (테이블 → 컬럼 집합)."""
    return {name: {c.name for c in table.columns} for name, table in Base.metadata.tables.items()}


async def _actual_schema(engine, schema: str) -> dict[str, set[str]]:
    """DB 에 실제로 만들어진 (테이블 → 컬럼 집합)."""

    def read(sync_conn) -> dict[str, set[str]]:
        inspector = inspect(sync_conn)
        return {
            table: {col["name"] for col in inspector.get_columns(table, schema=schema)}
            for table in inspector.get_table_names(schema=schema)
        }

    async with engine.connect() as conn:
        return await conn.run_sync(read)


async def _actual_indexes(engine, schema: str) -> set[str]:
    """DB 에 실제로 있는 인덱스 이름."""
    async with engine.connect() as conn:
        rows = await conn.execute(
            text("SELECT indexname FROM pg_indexes WHERE schemaname = :schema"),
            {"schema": schema},
        )
        return {row[0] for row in rows}


@pytest_asyncio.fixture
async def probe(monkeypatch):
    """빈 전용 스키마 + 그것을 보도록 갈아끼운 `db.database.engine`.

    `init_db()` 와 `_run_migrations()` 는 모듈 전역 `engine` 을 호출 시점에 읽으므로
    모듈 속성을 바꾸는 것으로 충분하다.
    """
    schema = f"aos_initdb_probe_{uuid.uuid4().hex[:12]}"
    admin = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    async with admin.begin() as conn:
        await conn.execute(text(f'CREATE SCHEMA "{schema}"'))

    engine = create_async_engine(
        TEST_DATABASE_URL,
        poolclass=NullPool,
        connect_args={
            "server_settings": {"search_path": schema},
            "statement_cache_size": 0,
        },
    )
    monkeypatch.setattr(db_mod, "engine", engine)
    try:
        yield schema, engine
    finally:
        await engine.dispose()
        async with admin.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        await admin.dispose()


async def test_init_db_builds_the_declared_schema(probe):
    """빈 DB 에 `init_db()` 를 돌리면 모델이 선언한 테이블·컬럼이 전부 생긴다."""
    schema, engine = probe

    await db_mod.init_db()

    expected = _expected_schema()
    actual = await _actual_schema(engine, schema)

    assert expected, "Base.metadata 가 비었다 — 모델 등록이 안 된 상태로 단언하면 공허하다"

    missing_tables = sorted(set(expected) - set(actual))
    assert not missing_tables, f"init_db() 가 만들지 않은 테이블: {missing_tables}"

    missing_columns = {
        table: sorted(expected[table] - actual[table])
        for table in expected
        if expected[table] - actual[table]
    }
    assert not missing_columns, f"선언됐는데 생기지 않은 컬럼: {missing_columns}"


async def test_init_db_is_idempotent(probe):
    """기동마다 실행되므로 두 번째 실행이 실패하거나 스키마를 바꾸면 안 된다."""
    schema, engine = probe

    await db_mod.init_db()
    first = await _actual_schema(engine, schema)

    await db_mod.init_db()  # 재기동
    second = await _actual_schema(engine, schema)

    assert first == second, "두 번째 init_db() 가 스키마를 바꿨다 — 가드가 멱등하지 않다"


# 삭제한 alembic 마이그레이션이 **유일한 추가 경로**였던 컬럼들 (issue #310).
# `sessions.version` 은 제외한다 — 그것만 `_run_migrations()` 에 이미 블록이 있었다.
ONLY_ALEMBIC_ADDED_COLUMNS: dict[str, list[str]] = {
    "audit_logs": ["project_id"],
    "feedbacks": ["project_name", "effort_level"],
    "playground_sessions": [
        "rag_k",
        "rag_hybrid_override",
        "rag_rerank_override",
        "rag_include_shared",
        "rules_mode",
        "memory_mode",
        "selected_rule_ids",
        "selected_memory_ids",
        "context_budget_tokens",
    ],
}


async def test_init_db_backfills_columns_an_older_deployment_lacks(probe):
    """이미 떠 있던 배포에 모델의 새 컬럼이 없으면 기동이 채워야 한다.

    `create_all()` 은 **기존 테이블을 건드리지 않는다.** 그래서 새 컬럼은 지금까지
    `_run_migrations()` 의 수작업 블록으로만 따라잡혔고, 빠뜨린 11 개는 삭제한 alembic
    마이그레이션이 유일한 경로였다. 그 경로를 지우면서 같은 일을 하는 리콘실러를
    넣었으므로, 여기서 "오래된 배포" 를 흉내 내 실제로 복구되는지 본다.
    """
    schema, engine = probe

    await db_mod.init_db()

    async with engine.begin() as conn:
        for table, columns in ONLY_ALEMBIC_ADDED_COLUMNS.items():
            for column in columns:
                await conn.execute(text(f'ALTER TABLE "{table}" DROP COLUMN "{column}"'))

    stale = await _actual_schema(engine, schema)
    still_there = {
        table: sorted(set(columns) & stale[table])
        for table, columns in ONLY_ALEMBIC_ADDED_COLUMNS.items()
        if set(columns) & stale[table]
    }
    assert not still_there, f"프로브가 컬럼을 지우지 못했다 — 단언이 공허해진다: {still_there}"

    await db_mod.init_db()  # 재기동

    after = await _actual_schema(engine, schema)
    not_restored = {
        table: sorted(set(columns) - after[table])
        for table, columns in ONLY_ALEMBIC_ADDED_COLUMNS.items()
        if set(columns) - after[table]
    }
    assert not not_restored, f"오래된 배포에서 복구되지 않은 컬럼: {not_restored}"


async def test_init_db_restores_indexes_dropped_with_their_column(probe):
    """컬럼만 채우고 인덱스를 빠뜨리면 수렴이 반쪽이다.

    `audit_logs.project_id` 는 컬럼과 인덱스 2 개(`ix_audit_logs_project_id`,
    `ix_audit_project_action`)가 한 변경이었다. Postgres 는 컬럼을 지울 때 그것에
    의존하는 인덱스를 함께 지우므로, 오래된 배포 흉내가 그대로 인덱스 프로브가 된다.
    """
    schema, engine = probe

    await db_mod.init_db()

    async with engine.begin() as conn:
        await conn.execute(text('ALTER TABLE "audit_logs" DROP COLUMN "project_id"'))

    stale = await _actual_indexes(engine, schema)
    assert not {"ix_audit_logs_project_id", "ix_audit_project_action"} & stale, (
        "컬럼과 함께 인덱스가 지워지지 않았다 — 프로브가 성립하지 않는다"
    )

    await db_mod.init_db()  # 재기동

    restored = await _actual_indexes(engine, schema)
    missing = {"ix_audit_logs_project_id", "ix_audit_project_action"} - restored
    assert not missing, f"복구되지 않은 인덱스: {sorted(missing)}"


async def test_init_db_survives_a_column_it_cannot_backfill(probe):
    """자동 추가할 수 없는 컬럼이 있어도 기동이 죽지 않아야 한다.

    `llm_model_update_logs.provider` 는 NOT NULL 인데 server_default 가 없다.
    기존 행을 채울 값이 없어 리콘실러는 **의도적으로 건너뛰고 경고만** 남긴다.
    그런데 그 컬럼에 인덱스(`ix_llm_model_update_logs_provider`)가 걸려 있어,
    인덱스 패스가 테이블 존재만 보고 만들려 들면 UndefinedColumn 으로
    `init_db()` 전체가 죽는다 — 경고만 남기고 기동하려던 설계가 무너진다.
    """
    schema, engine = probe

    await db_mod.init_db()

    async with engine.begin() as conn:
        await conn.execute(text('ALTER TABLE "llm_model_update_logs" DROP COLUMN "provider"'))

    stale = await _actual_schema(engine, schema)
    assert "provider" not in stale["llm_model_update_logs"], "프로브가 컬럼을 지우지 못했다"

    await db_mod.init_db()  # 죽지 않아야 한다

    after = await _actual_schema(engine, schema)
    assert "provider" not in after["llm_model_update_logs"], (
        "NOT NULL + 기본값 없음 컬럼을 자동 추가했다 — 기존 행을 채울 값이 없다"
    )
    assert "ix_llm_model_update_logs_provider" not in await _actual_indexes(engine, schema)
