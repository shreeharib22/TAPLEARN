from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

import auth  # noqa: E402


class AuthenticationFlowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.previous_db_path = auth.DB_PATH
        auth.DB_PATH = Path(self.temp_dir.name) / "taplearn-test.db"
        auth.initialise_auth_tables()

    def tearDown(self) -> None:
        auth.DB_PATH = self.previous_db_path
        self.temp_dir.cleanup()

    def register(self, name: str = "Shree Hari", email: str = "shree@example.com"):
        return auth.register(
            auth.RegisterPayload(
                display_name=name,
                email=email,
                password="test-password-123",
            )
        )

    def test_account_can_sign_in_again_with_email(self) -> None:
        created = self.register()
        signed_in = auth.login(
            auth.LoginPayload(email="SHREE@example.com", password="test-password-123")
        )
        self.assertEqual(signed_in["passport"]["passport_id"], created["passport"]["passport_id"])

    def test_account_can_sign_in_with_name_case_insensitively(self) -> None:
        created = self.register()
        signed_in = auth.login(
            auth.LoginPayload(email="  SHREE HARI  ", password="test-password-123")
        )
        self.assertEqual(signed_in["passport"]["passport_id"], created["passport"]["passport_id"])

    def test_name_is_unique_ignoring_case_and_extra_spaces(self) -> None:
        self.register(name="Shree   Hari")
        with self.assertRaises(auth.HTTPException) as raised:
            self.register(
                name="  shree hari ",
                email="another@example.com",
            )
        self.assertEqual(raised.exception.status_code, 409)
        self.assertIn("name is already taken", raised.exception.detail.lower())

    def test_new_account_has_a_community_profile(self) -> None:
        created = self.register()
        with auth.database() as db:
            row = db.execute(
                "SELECT role, bio FROM community_profiles WHERE passport_id=?",
                (created["passport"]["passport_id"],),
            ).fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row["role"], "student")
        self.assertEqual(row["bio"], "")



class PostgreSQLSqlCompatibilityTests(unittest.TestCase):
    def test_table_info_pragma_is_translated(self) -> None:
        from db import PostgresConnection

        statement, params = PostgresConnection._rewrite_sql(
            "PRAGMA table_info(study_rooms)"
        )
        self.assertIn("information_schema.columns", statement)
        self.assertEqual(params, ("study_rooms",))

    def test_sqlite_insert_ignore_and_lastrowid_are_translated(self) -> None:
        from db import PostgresConnection

        statement, params = PostgresConnection._rewrite_sql(
            "INSERT OR IGNORE INTO community_resources (title) VALUES (?)",
            ("notes",),
        )
        self.assertIn("INSERT INTO community_resources", statement)
        self.assertIn("ON CONFLICT DO NOTHING", statement)
        self.assertIn("RETURNING id", statement)
        self.assertIn("%s", statement)
        self.assertEqual(params, ("notes",))

    def test_sqlite_timestamp_expressions_are_translated(self) -> None:
        from db import PostgresConnection

        statement, _ = PostgresConnection._rewrite_sql(
            "SELECT * FROM study_rooms WHERE expires_at > CURRENT_TIMESTAMP "
            "AND last_seen >= datetime('now', '-90 seconds')"
        )
        self.assertIn("expires_at::timestamptz > CURRENT_TIMESTAMP", statement)
        self.assertIn("last_seen::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '90 seconds'", statement)
        self.assertNotIn("datetime(", statement)

    def test_like_queries_keep_sqlite_case_insensitive_behavior(self) -> None:
        from db import PostgresConnection

        statement, params = PostgresConnection._rewrite_sql(
            "SELECT * FROM passports WHERE display_name LIKE ?",
            ("%shree%",),
        )
        self.assertIn("display_name ILIKE %s", statement)
        self.assertEqual(params, ("%shree%",))

    def test_autoincrement_schema_is_translated(self) -> None:
        from db import PostgresConnection

        statement, _ = PostgresConnection._rewrite_sql(
            "CREATE TABLE IF NOT EXISTS example (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL)"
        )
        self.assertIn("BIGSERIAL PRIMARY KEY", statement)

    def test_room_expiry_string_is_compared_as_timestamp(self) -> None:
        from db import PostgresConnection

        statement, params = PostgresConnection._rewrite_sql(
            "SELECT ? > CURRENT_TIMESTAMP AS valid",
            ("2026-11-01 22:00:00",),
        )
        self.assertIn("%s::timestamptz > CURRENT_TIMESTAMP", statement)
        self.assertEqual(params, ("2026-11-01 22:00:00",))
    def test_study_room_expiry_and_member_activity_use_timestamp_casts(self) -> None:
        from db import PostgresConnection

        statement, _ = PostgresConnection._rewrite_sql(
            "SELECT * FROM study_rooms "
            "WHERE expires_at > CURRENT_TIMESTAMP "
            "AND last_seen >= datetime('now', '-90 seconds')"
        )
        self.assertIn("expires_at::timestamptz > CURRENT_TIMESTAMP", statement)
        self.assertIn("last_seen::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '90 seconds'", statement)


if __name__ == "__main__":
    unittest.main()
