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
