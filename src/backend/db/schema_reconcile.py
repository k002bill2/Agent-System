"""모델 메타데이터와 실제 스키마를 대조해 **없는 것만** 채우는 리콘실러.

`init_db()` 의 `create_all()` 은 기존 테이블을 건드리지 않으므로, 이미 떠 있던
배포를 모델 선언에 수렴시키는 일은 전부 여기서 한다 (issue #310 · PR #327).

세 패스로 나뉜다 — 컬럼 → 인덱스 → 외래키. 뒤 패스는 앞 패스가 무엇을 건너뛰었는지
알아야 하므로 `present`(테이블 → 실제 컬럼 집합)를 함께 넘긴다.

**호출자의 커넥션을 그대로 받는다.** 자체 트랜잭션을 열면 레거시 마이그레이션과
커밋 경계가 갈려, 리콘실러가 실패했을 때의 동작이 조용히 달라진다.

하지 않는 것: DROP·타입 변경·unique/check 제약. 파괴적이거나 되돌리기 어려운
연산은 사람이 판단할 일이고, 여기는 기동마다 무인으로 도는 자리다.
"""

from sqlalchemy import MetaData, text
from sqlalchemy.engine.interfaces import Dialect
from sqlalchemy.ext.asyncio import AsyncConnection
from sqlalchemy.schema import ForeignKeyConstraint, Table

# 이미 붙어 있는 FK 를 `(테이블, 컬럼, 참조 테이블)` 로 읽는다.
#
# `pg_constraint` 를 쓰는 이유는 `conkey` 순서를 그대로 얻어 복합 제약을 한 단위로
# 다룰 수 있기 때문이다. **이름으로 맞추면 안 된다** — 모델의 FK 24 건은 전부
# `name=None` 이라 PG 가 자동 명명하므로, 이름 기준 대조는 전부 "없음" 으로 오판한다.
# `ADD FOREIGN KEY` 에는 `IF NOT EXISTS` 가 없으니 그 오판은 곧 **기동마다 제약이
# 하나씩 쌓이는 사고**가 된다 (issue #330).
_EXISTING_FK_QUERY = """
SELECT rel.relname AS table_name,
       frel.relname AS referenced_table,
       ARRAY(
           SELECT att.attname
           FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
           JOIN pg_attribute att
             ON att.attrelid = con.conrelid AND att.attnum = k.attnum
           ORDER BY k.ord
       ) AS columns
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_class frel ON frel.oid = con.confrelid
JOIN pg_namespace ns ON ns.oid = rel.relnamespace
WHERE con.contype = 'f' AND ns.nspname = current_schema()
"""


async def reconcile_schema(conn: AsyncConnection, metadata: MetaData) -> None:
    """모델에 있으나 DB 에 없는 컬럼·인덱스·외래키를 채운다 (추가 전용)."""
    from sqlalchemy.dialects import postgresql

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
    await _add_missing_columns(conn, metadata, present, pg_dialect)
    await _create_missing_indexes(conn, metadata, present, pg_dialect)
    await _attach_missing_foreign_keys(conn, metadata, present, pg_dialect)


async def _add_missing_columns(
    conn: AsyncConnection, metadata: MetaData, present: dict[str, set[str]], pg_dialect: Dialect
) -> None:
    """모델에 선언됐는데 기존 테이블에 없는 컬럼을 채운다.

    `create_all()` 은 **기존 테이블을 건드리지 않는다.** 그래서 새 컬럼은 수작업
    마이그레이션으로만 따라잡혀 왔고, 빠뜨리면 이미 떠 있던 배포에서 ORM 질의가
    UndefinedColumn 으로 죽는다. 실제로 11 개가 그 상태였다 — 삭제한 alembic
    마이그레이션이 유일한 경로였고 그것을 부르는 자동화는 없었다 (issue #310).

    케이스를 하나씩 늘리는 대신 **부류를 닫는다**: DDL 은 `CreateColumn` 으로
    렌더하므로 `create_all()` 이 새 DB 에 쓰는 것과 같은 문장이 된다.
    """
    from sqlalchemy.schema import CreateColumn

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


async def _create_missing_indexes(
    conn: AsyncConnection, metadata: MetaData, present: dict[str, set[str]], pg_dialect: Dialect
) -> None:
    """존재하는 테이블에 대해 메타데이터가 선언한 인덱스 중 없는 것만 만든다.

    컬럼만 채우면 수렴을 주장하면서 질의 성능이 빠진다 (`audit_logs.project_id` 는
    컬럼과 인덱스 2 개가 한 변경이었다). `IF NOT EXISTS` 라 멱등하다. 큰 테이블에서는
    이 생성이 기동을 잠시 붙잡을 수 있으나, 인덱스가 없는 채로 도는 것보다 낫다.
    """
    from sqlalchemy.schema import CreateIndex

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
            # 앞 패스가 건너뛴 컬럼(NOT NULL + 기본값 없음)을 참조하는 인덱스는
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


async def _attach_missing_foreign_keys(
    conn: AsyncConnection, metadata: MetaData, present: dict[str, set[str]], pg_dialect: Dialect
) -> None:
    """빠진 FK 제약을 **고아 행이 0 일 때만** 붙인다.

    `CreateColumn` 은 컬럼 정의만 렌더하므로, 앞 패스가 채운 컬럼에 FK 가 선언돼
    있었다면 제약은 빠진 채로 남는다 (issue #330).

    무조건 `ADD CONSTRAINT` 는 안 된다 — 고아 행이 하나라도 있으면 검증에 실패해
    기동이 통째로 죽는다. `NOT VALID` 도 안 된다 — 더러운 배포의 쓰기 경로가 예고
    없이 런타임 에러로 바뀐다. 그래서 **먼저 세고, 0 일 때만 붙인다.** 리콘실러가
    방금 채운 컬럼은 전부 NULL 이라 고아가 정의상 0 이다. 즉 이 규칙은 리콘실러가
    만드는 케이스를 전량 수렴시키면서 기존 더러운 데이터에는 손대지 않는다.
    """
    rows = await conn.execute(text(_EXISTING_FK_QUERY))
    existing = {(table, tuple(sorted(columns)), referenced) for table, referenced, columns in rows}

    for table in metadata.sorted_tables:
        if table.name not in present:
            continue
        # `foreign_key_constraints` 는 집합이라 순회 순서가 실행마다 다르다.
        # 로그가 흔들리지 않도록 정렬한다. 테이블 수준으로 도는 것은 복합 FK 를
        # 한 단위로 다루기 위해서다 (컬럼 단위로 돌면 복합이 조각난다).
        constraints = sorted(
            table.foreign_key_constraints,
            key=lambda c: tuple(sorted(col.name for col in c.columns)),
        )
        for constraint in constraints:
            await _attach_one_foreign_key(conn, table, constraint, present, existing, pg_dialect)


async def _attach_one_foreign_key(
    conn: AsyncConnection,
    table: Table,
    constraint: ForeignKeyConstraint,
    present: dict[str, set[str]],
    existing: set[tuple[str, tuple[str, ...], str]],
    pg_dialect: Dialect,
) -> None:
    """FK 하나를 붙이거나, 붙이지 못한 이유를 보고한다. **예외를 밖으로 내지 않는다.**"""
    from sqlalchemy.exc import SQLAlchemyError
    from sqlalchemy.schema import AddConstraint

    pairs = [(element.parent.name, element.column.name) for element in constraint.elements]
    source_columns = [source for source, _ in pairs]
    referenced_columns = [referenced for _, referenced in pairs]
    referenced_tables = {element.column.table.name for element in constraint.elements}
    label = f"{table.name}({', '.join(source_columns)})"

    if len(referenced_tables) != 1:
        print(f"⚠️  {label} 외래키 건너뜀 — 참조 테이블이 여럿이다 {sorted(referenced_tables)}")
        return
    target = referenced_tables.pop()

    key = (table.name, tuple(sorted(source_columns)), target)
    if key in existing:
        return

    skipped = _blocking_columns(table.name, source_columns, target, referenced_columns, present)
    if skipped:
        print(f"⚠️  {label} → {target} 외래키 건너뜀 — {skipped}")
        return

    orphans = await _count_orphans(conn, table.name, source_columns, target, referenced_columns)
    if orphans is None:
        print(f"⚠️  {label} → {target} 외래키 건너뜀 — 고아 행을 세지 못했다")
        return
    if orphans > 0:
        print(
            f"⚠️  {label} → {target} 외래키를 붙이지 않았다 — 참조가 깨진 행 {orphans} 건. "
            "정리 방침(NULL 로 끊기 / 행 삭제)은 컬럼마다 달라 사람이 정할 일이다"
        )
        return

    ddl = str(AddConstraint(constraint).compile(dialect=pg_dialect))
    try:
        # SAVEPOINT. 여기서 실패해도 바깥 트랜잭션은 살아 있어야 한다 — 실패가
        # 기동을 죽이면 "보고하고 계속 뜬다" 는 설계 전체가 무너진다.
        async with conn.begin_nested():
            await conn.execute(text(ddl))
    except SQLAlchemyError as exc:
        print(f"⚠️  {label} → {target} 외래키를 붙이지 못했다 (기동은 계속한다): {exc}")
        return

    existing.add(key)
    print(f"✅ {label} → {target} 외래키 제약 추가")


def _blocking_columns(
    table: str,
    source_columns: list[str],
    target: str,
    referenced_columns: list[str],
    present: dict[str, set[str]],
) -> str:
    """FK 를 붙일 수 없게 하는 누락 컬럼을 사람이 읽을 문장으로. 없으면 빈 문자열."""
    missing_source = sorted(set(source_columns) - present[table])
    if missing_source:
        return f"컬럼 {missing_source} 이 아직 없다"
    if target not in present:
        return f"참조 테이블 {target} 이 아직 없다"
    missing_referenced = sorted(set(referenced_columns) - present[target])
    if missing_referenced:
        return f"참조 컬럼 {target}.{missing_referenced} 이 아직 없다"
    return ""


async def _count_orphans(
    conn: AsyncConnection,
    table: str,
    source_columns: list[str],
    target: str,
    referenced_columns: list[str],
) -> int | None:
    """참조가 깨진 행 수. 셀 수 없으면 `None`.

    **`IS NOT NULL` 이 핵심이다.** FK 는 NULL 인 행을 검사하지 않으므로(MATCH SIMPLE),
    그것을 빠뜨리면 NULL 행이 전부 고아로 세어져 제약이 영원히 안 붙는 **조용한
    무동작**이 된다. 빈 테이블 프로브로는 이 버그가 잡히지 않는다 (issue #330).

    별칭 `s`/`t` 는 자기참조 FK(`cost_centers.parent_id`) 때문에 필수다.
    """
    from sqlalchemy.exc import SQLAlchemyError

    joined = " AND ".join(
        f't."{referenced}" = s."{source}"'
        for source, referenced in zip(source_columns, referenced_columns, strict=True)
    )
    non_null = " AND ".join(f's."{source}" IS NOT NULL' for source in source_columns)
    query = (
        f'SELECT count(*) FROM "{table}" AS s '
        f'LEFT JOIN "{target}" AS t ON {joined} '
        f'WHERE {non_null} AND t."{referenced_columns[0]}" IS NULL'
    )
    try:
        # 세는 것과 붙이는 것은 같은 커넥션·같은 트랜잭션에서 일어난다.
        async with conn.begin_nested():
            result = await conn.execute(text(query))
            return int(result.scalar_one())
    except SQLAlchemyError as exc:
        print(f"⚠️  {table} 고아 행 집계 실패: {exc}")
        return None
