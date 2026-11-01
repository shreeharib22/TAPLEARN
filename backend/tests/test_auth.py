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


if __name__ == "__main__":
    unittest.main()
