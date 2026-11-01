from __future__ import annotations

import os
import re
import sqlite3
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row


_AUTO_ID_TABLES = {
    "collab_notes",
    "collab_resources",
    "collab_messages",
    "collab_whiteboard_strokes",
    "community_resources",
}


def postgres_url() -> str:
    value = (os.getenv("DATABASE_URL") or os.getenv("NEON_DATABASE_URL") or "").strip()
    if value.startswith("postgres://"):
        value = "postgresql://" + value[len("postgres://"):]
    return value


def is_postgres_enabled() -> bool:
    return bool(postgres_url())


class HybridRow(dict):
    """Dictionary row that also supports SQLite-style integer indexing."""

    def __getitem__(self, key: Any) -> Any:
        if isinstance(key, int):
            try:
                return tuple(self.values())[key]
            except IndexError:
                raise IndexError(key) from None
        return super().__getitem__(key)


class PostgresCursor:
    def __init__(self, cursor: psycopg.Cursor[Any]) -> None:
        self._cursor = cursor
        self._lastrowid_read = False
        self._lastrowid: int | None = None

    def _row(self, row: dict[str, Any] | None) -> HybridRow | None:
        return HybridRow(row) if row is not None else None

    def fetchone(self) -> HybridRow | None:
        return self._row(self._cursor.fetchone())

    def fetchall(self) -> list[HybridRow]:
        return [HybridRow(row) for row in self._cursor.fetchall()]

    @property
    def rowcount(self) -> int:
        return self._cursor.rowcount

    @property
    def lastrowid(self) -> int | None:
        # INSERT statements which need SQLite's lastrowid receive RETURNING id.
        if not self._lastrowid_read:
            self._lastrowid_read = True
            row = self.fetchone()
            if row is not None:
                self._lastrowid = int(row["id"])
        return self._lastrowid

    def __iter__(self):
        for row in self._cursor:
            yield HybridRow(row)


class PostgresConnection:
    def __init__(self, url: str) -> None:
        self._connection = psycopg.connect(
            url,
            row_factory=dict_row,
            connect_timeout=15,
        )
        self._row_factory: Any = None

    @property
    def row_factory(self) -> Any:
        return self._row_factory

    @row_factory.setter
    def row_factory(self, value: Any) -> None:
        # Kept for compatibility with code which sets sqlite3.Row.
        self._row_factory = value

    @staticmethod
    def _rewrite_sql(sql: str, params: Any = ()) -> tuple[str, Any]:
        statement = sql.strip()
        if not statement:
            return statement, params

        # SQLite's schema-inspection statements become PostgreSQL metadata queries.
        table_info = re.fullmatch(
            r"PRAGMA\s+table_info\((?:['\"])?([a-zA-Z_][a-zA-Z0-9_]*)(?:['\"])?\)",
            statement,
            flags=re.IGNORECASE,
        )
        if table_info:
            return (
                "SELECT column_name AS name "
                "FROM information_schema.columns "
                "WHERE table_schema = current_schema() AND table_name = %s "
                "ORDER BY ordinal_position",
                (table_info.group(1).lower(),),
            )

        if re.match(r"PRAGMA\b", statement, flags=re.IGNORECASE):
            return "SELECT 1", ()

        if "sqlite_master" in statement.lower():
            name_match = re.search(
                r"name\s*=\s*'([^']+)'",
                statement,
                flags=re.IGNORECASE,
            )
            if name_match:
                return (
                    "SELECT 1 AS present FROM information_schema.tables "
                    "WHERE table_schema = current_schema() AND table_name = %s LIMIT 1",
                    (name_match.group(1).lower(),),
                )

        # SQLite auto-increment primary keys map to PostgreSQL sequences.
        statement = re.sub(
            r"INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT",
            "BIGSERIAL PRIMARY KEY",
            statement,
            flags=re.IGNORECASE,
        )

        # Store date fields as consistently formatted text for compatibility
        # with the existing API payloads and comparison logic.
        statement = re.sub(
            r"TEXT(\s+NOT\s+NULL)?\s+DEFAULT\s+CURRENT_TIMESTAMP",
            lambda match: f"TEXT{match.group(1) or ''} DEFAULT (TO_CHAR(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'))",
            statement,
            flags=re.IGNORECASE,
        )
        statement = re.sub(
            r"datetime\(\s*'now'\s*,\s*'([+-]\d+)\s+(seconds?|minutes?|hours?|days?)'\s*\)",
            lambda match: (
                "TO_CHAR(CURRENT_TIMESTAMP "
                f"+ INTERVAL '{match.group(1)} {match.group(2)}', "
                "'YYYY-MM-DD HH24:MI:SS')"
            ),
            statement,
            flags=re.IGNORECASE,
        )
        # Existing TEXT timestamp columns compare lexically in this same format.
        statement = re.sub(
            r"(?<!TO_CHAR\()CURRENT_TIMESTAMP",
            "TO_CHAR(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')",
            statement,
            flags=re.IGNORECASE,
        )

        # Room expiry and active-member fields are TEXT in the legacy schema.
        # Cast them for real timestamp comparisons because some rows use ISO-8601
        # while SQLite defaults use a space-separated timestamp.
        statement = statement.replace(
            "expires_at > TO_CHAR(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')",
            "expires_at::timestamptz > CURRENT_TIMESTAMP",
        )
        statement = statement.replace(
            "last_seen >= TO_CHAR(CURRENT_TIMESTAMP - INTERVAL '-90 seconds', 'YYYY-MM-DD HH24:MI:SS')",
            "last_seen::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '90 seconds'",
        )
        statement = statement.replace(
            "last_seen >= TO_CHAR(CURRENT_TIMESTAMP + INTERVAL '-90 seconds', 'YYYY-MM-DD HH24:MI:SS')",
            "last_seen::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '90 seconds'",
        )

        # The expiry-check query compares a parameter to the current time.
        statement = statement.replace(
            "? > TO_CHAR(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')",
            "?::timestamptz > CURRENT_TIMESTAMP",
        )

        # Replace SQLite's INSERT OR IGNORE with PostgreSQL's conflict syntax.
        ignore_insert = bool(
            re.match(r"INSERT\s+OR\s+IGNORE\s+INTO\b", statement, flags=re.IGNORECASE)
        )
        if ignore_insert:
            statement = re.sub(
                r"INSERT\s+OR\s+IGNORE\s+INTO",
                "INSERT INTO",
                statement,
                count=1,
                flags=re.IGNORECASE,
            )
            if not re.search(r"ON\s+CONFLICT", statement, flags=re.IGNORECASE):
                statement = statement.rstrip().rstrip(";") + " ON CONFLICT DO NOTHING"

        # A few endpoints read cursor.lastrowid after inserts. Use RETURNING id.
        insert_match = re.match(
            r"INSERT\s+INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)",
            statement,
            flags=re.IGNORECASE,
        )
        if insert_match and insert_match.group(1).lower() in _AUTO_ID_TABLES:
            if not re.search(r"RETURNING\s+", statement, flags=re.IGNORECASE):
                statement = statement.rstrip().rstrip(";") + " RETURNING id"

        # All current SQL uses positional SQLite placeholders.
        statement = statement.replace("?", "%s")
        return statement, params

    def execute(self, sql: str, params: Any = ()) -> PostgresCursor:
        statement, values = self._rewrite_sql(sql, params)
        try:
            cursor = self._connection.execute(statement, values or ())
        except psycopg.IntegrityError as exc:
            # Preserve existing API-level handling of unique/foreign-key conflicts.
            raise sqlite3.IntegrityError(str(exc)) from exc
        return PostgresCursor(cursor)

    def executescript(self, script: str) -> None:
        for statement in script.split(";"):
            if statement.strip():
                self.execute(statement)

    def commit(self) -> None:
        self._connection.commit()

    def rollback(self) -> None:
        self._connection.rollback()

    def close(self) -> None:
        self._connection.close()


def connect_database(db_path: Path, timeout: int = 15):
    """Connect to DATABASE_URL when configured, otherwise use local SQLite."""
    url = postgres_url()
    if url:
        return PostgresConnection(url)

    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path, timeout=timeout)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute(f"PRAGMA busy_timeout = {int(timeout * 1000)}")
    return connection
