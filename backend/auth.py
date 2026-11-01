from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import unicodedata
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("TAPLEARN_DB_PATH", str(BASE_DIR / "taplearn.db")))
router = APIRouter(prefix="/api/auth", tags=["authentication"])
TOKEN_DAYS = 30
PBKDF2_ROUNDS = 240_000
LESSONS = (
    ("binary-trees-intro", "Binary Trees"),
    ("tree-traversals", "Tree Traversals"),
    ("binary-search-trees", "Binary Search Trees"),
    ("tree-applications", "Tree Applications"),
)


@contextmanager
def database() -> Iterator[sqlite3.Connection]:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=20)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("PRAGMA busy_timeout = 20000")
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def normalize_display_name(value: str) -> tuple[str, str]:
    """Return a whitespace-normalized display name and its unique lookup key."""
    name = " ".join(unicodedata.normalize("NFKC", value or "").split())
    if not 2 <= len(name) <= 60:
        raise HTTPException(
            status_code=400,
            detail="Your name must be between 2 and 60 characters.",
        )
    return name, name.casefold()


def initialise_auth_tables() -> None:
    with database() as db:
        # Also create the base table if this router is installed before the main
        # app's startup hook. The schema matches main.py.
        db.execute(
            """CREATE TABLE IF NOT EXISTS passports (
                passport_id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                level TEXT NOT NULL DEFAULT 'Curious beginner',
                streak_days INTEGER NOT NULL DEFAULT 1,
                lessons_total INTEGER NOT NULL DEFAULT 4,
                current_lesson TEXT NOT NULL DEFAULT 'Binary Trees'
            )"""
        )
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS auth_users (
                email TEXT PRIMARY KEY,
                passport_id TEXT NOT NULL UNIQUE,
                password_salt TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(passport_id) REFERENCES passports(passport_id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS auth_sessions (
                token_hash TEXT PRIMARY KEY,
                passport_id TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(passport_id) REFERENCES passports(passport_id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);
            CREATE TABLE IF NOT EXISTS auth_username_claims (
                username_key TEXT PRIMARY KEY,
                passport_id TEXT NOT NULL UNIQUE,
                FOREIGN KEY(passport_id) REFERENCES auth_users(passport_id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS community_profiles (
                passport_id TEXT PRIMARY KEY,
                role TEXT NOT NULL DEFAULT 'student'
                    CHECK(role IN ('student', 'teacher')),
                bio TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(passport_id) REFERENCES passports(passport_id) ON DELETE CASCADE
            );
            """
        )

        # Backfill claims for accounts created before names became unique.
        existing_accounts = db.execute(
            """SELECT u.passport_id, p.display_name
               FROM auth_users u
               JOIN passports p ON p.passport_id = u.passport_id
               ORDER BY u.created_at, u.email"""
        ).fetchall()
        for account in existing_accounts:
            _, username_key = normalize_display_name(account["display_name"])
            db.execute(
                """INSERT OR IGNORE INTO auth_username_claims(username_key, passport_id)
                   VALUES (?, ?)""",
                (username_key, account["passport_id"]),
            )
            db.execute(
                """INSERT OR IGNORE INTO community_profiles(passport_id, role, bio)
                   VALUES (?, 'student', '')""",
                (account["passport_id"],),
            )


@router.on_event("startup")
def _startup() -> None:
    initialise_auth_tables()


class RegisterPayload(BaseModel):
    display_name: str = Field(min_length=2, max_length=60)
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=8, max_length=128)


class LoginPayload(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=1, max_length=128)


def clean_email(value: str) -> str:
    email = value.strip().lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    return email


def password_digest(password: str, salt_hex: str) -> str:
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), PBKDF2_ROUNDS
    )
    return digest.hex()


def passport_payload(db: sqlite3.Connection, passport_id: str) -> dict[str, Any]:
    row = db.execute("SELECT * FROM passports WHERE passport_id = ?", (passport_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Learner passport was not found.")
    saved_rows = db.execute(
        "SELECT lesson_id, score, completed FROM lesson_progress WHERE passport_id = ?",
        (passport_id,),
    ).fetchall() if db.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='lesson_progress'"
    ).fetchone() else []
    saved = {item["lesson_id"]: item for item in saved_rows}
    lessons = []
    total_score = 0
    completed_count = 0
    for lesson_id, title in LESSONS:
        record = saved.get(lesson_id)
        score = int(record["score"]) if record else None
        completed = bool(record["completed"]) if record else False
        lessons.append({"lesson_id": lesson_id, "title": title, "completed": completed, "score": score})
        total_score += score or 0
        completed_count += int(completed)
    return {
        "passport_id": row["passport_id"],
        "display_name": row["display_name"],
        "level": row["level"],
        "streak_days": int(row["streak_days"]),
        "lessons_completed": completed_count,
        "lessons_total": len(LESSONS),
        "current_lesson": row["current_lesson"],
        "progress_percent": round(total_score / len(LESSONS)) if LESSONS else 0,
        "lessons": lessons,
    }


def issue_session(db: sqlite3.Connection, passport_id: str, email: str) -> dict[str, Any]:
    token = secrets.token_urlsafe(40)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    expires = (datetime.now(timezone.utc) + timedelta(days=TOKEN_DAYS)).isoformat()
    db.execute("DELETE FROM auth_sessions WHERE expires_at < ?", (datetime.now(timezone.utc).isoformat(),))
    db.execute(
        "INSERT INTO auth_sessions(token_hash, passport_id, expires_at) VALUES (?, ?, ?)",
        (token_hash, passport_id, expires),
    )
    return {"token": token, "email": email, "passport": passport_payload(db, passport_id)}


def current_user(authorization: str | None) -> tuple[str, str]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Please sign in to continue.")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Your session has expired. Please sign in again.")
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    with database() as db:
        row = db.execute(
            """SELECT s.passport_id, u.email, s.expires_at
               FROM auth_sessions s JOIN auth_users u ON u.passport_id=s.passport_id
               WHERE s.token_hash=?""",
            (token_hash,),
        ).fetchone()
        if row is None or row["expires_at"] < datetime.now(timezone.utc).isoformat():
            raise HTTPException(status_code=401, detail="Your session has expired. Please sign in again.")
        return str(row["passport_id"]), str(row["email"])


@router.post("/register")
def register(payload: RegisterPayload) -> dict[str, Any]:
    email = clean_email(payload.email)
    name, username_key = normalize_display_name(payload.display_name)
    salt = secrets.token_hex(16)
    encoded = password_digest(payload.password, salt)
    passport_id = "tl_" + secrets.token_hex(12)

    with database() as db:
        if db.execute("SELECT 1 FROM auth_users WHERE email=?", (email,)).fetchone():
            raise HTTPException(
                status_code=409,
                detail="An account with this email already exists. Sign in instead.",
            )

        if db.execute(
            "SELECT 1 FROM auth_username_claims WHERE username_key=?",
            (username_key,),
        ).fetchone():
            raise HTTPException(
                status_code=409,
                detail="That name is already taken. Please choose another name.",
            )

        try:
            db.execute(
                """INSERT INTO passports
                   (passport_id, display_name, level, streak_days, lessons_total, current_lesson)
                   VALUES (?, ?, 'Curious beginner', 0, 4, 'Binary Trees')""",
                (passport_id, name),
            )
            db.execute(
                "INSERT INTO auth_users(email, passport_id, password_salt, password_hash) VALUES (?, ?, ?, ?)",
                (email, passport_id, salt, encoded),
            )
            # The primary key prevents simultaneous signups claiming one name.
            db.execute(
                "INSERT INTO auth_username_claims(username_key, passport_id) VALUES (?, ?)",
                (username_key, passport_id),
            )
            # New accounts are immediately discoverable in Community.
            db.execute(
                """INSERT OR IGNORE INTO community_profiles(passport_id, role, bio)
                   VALUES (?, 'student', '')""",
                (passport_id,),
            )
        except sqlite3.IntegrityError as exc:
            raise HTTPException(
                status_code=409,
                detail="That name or email is already in use. Please sign in or choose another.",
            ) from exc

        return issue_session(db, passport_id, email)


@router.post("/login")
def login(payload: LoginPayload) -> dict[str, Any]:
    identifier = payload.email.strip()
    if "@" in identifier:
        try:
            email_lookup = clean_email(identifier)
        except HTTPException:
            raise HTTPException(status_code=401, detail="Email/username or password is incorrect.") from None
        username_lookup = ""
    else:
        try:
            _, username_lookup = normalize_display_name(identifier)
        except HTTPException:
            raise HTTPException(status_code=401, detail="Email/username or password is incorrect.") from None
        email_lookup = ""

    with database() as db:
        row = db.execute(
            """SELECT u.passport_id, u.email, u.password_salt, u.password_hash
               FROM auth_users u
               LEFT JOIN auth_username_claims n ON n.passport_id = u.passport_id
               WHERE u.email = ? OR n.username_key = ?""",
            (email_lookup, username_lookup),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=401, detail="Email/username or password is incorrect.")

        candidate = password_digest(payload.password, row["password_salt"])
        if not hmac.compare_digest(candidate, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Email/username or password is incorrect.")

        return issue_session(db, str(row["passport_id"]), str(row["email"]))


@router.get("/me")
def me(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    passport_id, email = current_user(authorization)
    with database() as db:
        return {"email": email, "passport": passport_payload(db, passport_id)}


@router.post("/logout")
def logout(authorization: str | None = Header(default=None)) -> dict[str, bool]:
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        with database() as db:
            db.execute("DELETE FROM auth_sessions WHERE token_hash=?", (token_hash,))
    return {"logged_out": True}
