"""모델 메타데이터와 실제 스키마를 대조해 **없는 것만** 채우는 리콘실러.

`init_db()` 의 `create_all()` 은 기존 테이블을 건드리지 않으므로, 이미 떠 있던
배포를 모델 선언에 수렴시키는 일은 전부 여기서 한다 (issue #310 · PR #327).

`_run_migrations()` 안에 있던 것을 그대로 옮겼다 — 그 함수가 468 줄이라
이 로직의 diff 를 읽을 수 없었기 때문이다 (issue #330).

**호출자의 커넥션을 그대로 받는다.** 자체 트랜잭션을 열면 레거시 마이그레이션과
커밋 경계가 갈려, 리콘실러가 실패했을 때의 동작이 조용히 달라진다.
"""

from sqlalchemy import MetaData, text
from sqlalchemy.ext.asyncio import AsyncConnection


async def reconcile_schema(conn: AsyncConnection, metadata: MetaData) -> None:
    """모델에 있으나 DB 에 없는 컬럼·인덱스를 채우고, 붙이지 못한 FK 를 보고한다."""
    # Migration 13: 모델에 선언됐는데 기존 테이블에 없는 컬럼을 채운다 (추가 전용)
    #
    # `create_all()` 은 **기존 테이블을 건드리지 않는다.** 그래서 새 컬럼은 `_run_migrations()`
    # 의 수작업 블록으로만 따라잡혀 왔고, 빠뜨리면 이미 떠 있던 배포에서 ORM 질의가
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
    for table in metadata.sorted_tables:
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
    for table in metadata.sorted_tables:
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

    # 참조 무결성은 **보고만 한다.**
    #
    # `CreateColumn` 은 컬럼 정의만 렌더하므로, 위에서 채운 컬럼에 FK 가 선언돼
    # 있었다면 제약은 빠진 채로 남는다 (대상 10 개). 그렇다고 여기서
    # `ADD CONSTRAINT` 를 하면 안 된다 — 기존 데이터에 고아 행이 하나라도 있으면
    # 검증에 실패해 기동이 통째로 죽는다. 바로 위 인덱스 가드와 같은 함정이다.
    # 고아를 정리한 뒤 붙이는 것은 사람이 판단할 일이라, 빠진 것만 알린다.
    fk_rows = await conn.execute(
        text(
            "SELECT tc.table_name, kcu.column_name "
            "FROM information_schema.table_constraints tc "
            "JOIN information_schema.key_column_usage kcu "
            "  ON tc.constraint_name = kcu.constraint_name "
            " AND tc.table_schema = kcu.table_schema "
            "WHERE tc.constraint_type = 'FOREIGN KEY' "
            "  AND tc.table_schema = current_schema()"
        )
    )
    existing_fks = {(row[0], row[1]) for row in fk_rows}
    for table in metadata.sorted_tables:
        if table.name not in present:
            continue
        for column in table.columns:
            if not column.foreign_keys or column.name not in present[table.name]:
                continue
            if (table.name, column.name) in existing_fks:
                continue
            targets = ", ".join(sorted(fk.target_fullname for fk in column.foreign_keys))
            print(
                f"⚠️  {table.name}.{column.name} 의 외래키 제약({targets})이 없다 — "
                "고아 행 정리 후 수동으로 붙일 것 (자동 생성은 검증 실패 시 기동을 막는다)"
            )
