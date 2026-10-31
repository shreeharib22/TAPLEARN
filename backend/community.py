from __future__ import annotations

import os
import secrets
import sqlite3
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Literal

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("TAPLEARN_DB_PATH", str(BASE_DIR / "taplearn.db")))
UPLOAD_DIR = Path(os.getenv("TAPLEARN_UPLOAD_DIR", str(BASE_DIR / "uploads")))
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
ALLOWED_TYPES = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}

router = APIRouter(prefix="/api/community", tags=["community"])


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


def initialise_community_tables() -> None:
    with database() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS community_profiles (
                passport_id TEXT PRIMARY KEY,
                role TEXT NOT NULL DEFAULT 'student'
                    CHECK(role IN ('student', 'teacher')),
                bio TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(passport_id) REFERENCES passports(passport_id)
                    ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS community_follows (
                follower_id TEXT NOT NULL,
                followed_id TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(follower_id, followed_id),
                CHECK(follower_id <> followed_id),
                FOREIGN KEY(follower_id) REFERENCES passports(passport_id)
                    ON DELETE CASCADE,
                FOREIGN KEY(followed_id) REFERENCES passports(passport_id)
                    ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_community_followed
                ON community_follows(followed_id);

            CREATE TABLE IF NOT EXISTS community_resources (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uploader_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                subject TEXT NOT NULL DEFAULT 'General',
                original_name TEXT NOT NULL,
                stored_name TEXT NOT NULL UNIQUE,
                mime_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                licence TEXT NOT NULL DEFAULT 'CC BY 4.0',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(uploader_id) REFERENCES passports(passport_id)
                    ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_community_resources_created
                ON community_resources(created_at DESC);
            """
        )


@router.on_event("startup")
def _startup() -> None:
    initialise_community_tables()


class RegisterRequest(BaseModel):
    display_name: str = Field(min_length=2, max_length=60)
    role: Literal["student", "teacher"] = "student"
    bio: str = Field(default="", max_length=240)


class ProfileUpdate(BaseModel):
    role: Literal["student", "teacher"] = "student"
    bio: str = Field(default="", max_length=240)


class FollowRequest(BaseModel):
    target_id: str = Field(min_length=4, max_length=100)
    action: Literal["follow", "unfollow"] = "follow"


def clean_name(value: str) -> str:
    return " ".join(value.strip().split())[:60]


def require_passport(db: sqlite3.Connection, passport_id: str) -> sqlite3.Row:
    passport = db.execute(
        "SELECT passport_id, display_name FROM passports WHERE passport_id = ?",
        (passport_id,),
    ).fetchone()
    if passport is None:
        raise HTTPException(status_code=404, detail="Learning passport not found.")
    db.execute(
        "INSERT OR IGNORE INTO community_profiles(passport_id, role, bio) VALUES (?, 'student', '')",
        (passport_id,),
    )
    return passport


def profile_payload(db: sqlite3.Connection, passport_id: str) -> dict[str, Any]:
    row = db.execute(
        """
        SELECT p.passport_id, p.display_name, cp.role, cp.bio,
          (SELECT COUNT(*) FROM community_follows f WHERE f.followed_id=p.passport_id) AS followers,
          (SELECT COUNT(*) FROM community_follows f WHERE f.follower_id=p.passport_id) AS following
        FROM passports p JOIN community_profiles cp ON cp.passport_id=p.passport_id
        WHERE p.passport_id=?
        """,
        (passport_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Community profile not found.")
    return dict(row)


def person_payload(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "passport_id": row["passport_id"],
        "display_name": row["display_name"],
        "role": row["role"],
        "bio": row["bio"],
        "followers": int(row["followers"]),
        "following": int(row["following"]),
        "is_following": bool(row["is_following"]),
    }


@router.post("/register")
def register_passport(payload: RegisterRequest) -> dict[str, Any]:
    name = clean_name(payload.display_name)
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Enter a name with at least two characters.")

    passport_id = "tl_" + secrets.token_hex(12)
    with database() as db:
        db.execute(
            """INSERT INTO passports
               (passport_id, display_name, level, streak_days, lessons_total, current_lesson)
               VALUES (?, ?, 'Curious beginner', 0, 4, 'Binary Trees')""",
            (passport_id, name),
        )
        db.execute(
            "INSERT INTO community_profiles(passport_id, role, bio) VALUES (?, ?, ?)",
            (passport_id, payload.role, payload.bio.strip()),
        )
        profile = profile_payload(db, passport_id)

    return {
        "profile": profile,
        "passport_url_path": f"/tap/{passport_id}",
        "note": "This demo passport URL is a shareable identifier, not a secure login credential.",
    }


@router.get("/profile/{passport_id}")
def get_profile(passport_id: str) -> dict[str, Any]:
    with database() as db:
        require_passport(db, passport_id)
        return profile_payload(db, passport_id)


@router.post("/profile/{passport_id}/update")
def update_profile(passport_id: str, payload: ProfileUpdate) -> dict[str, Any]:
    with database() as db:
        require_passport(db, passport_id)
        db.execute(
            "UPDATE community_profiles SET role=?, bio=? WHERE passport_id=?",
            (payload.role, payload.bio.strip(), passport_id),
        )
        return profile_payload(db, passport_id)


@router.get("/search")
def search_people(
    q: str = "",
    role: Literal["all", "student", "teacher"] = "all",
    current_id: str = "",
    limit: int = Query(default=40, ge=1, le=80),
) -> dict[str, Any]:
    search = f"%{q.strip()[:80]}%"
    with database() as db:
        if current_id:
            require_passport(db, current_id)
        rows = db.execute(
            """
            SELECT p.passport_id, p.display_name, cp.role, cp.bio,
              (SELECT COUNT(*) FROM community_follows a WHERE a.followed_id=p.passport_id) AS followers,
              (SELECT COUNT(*) FROM community_follows b WHERE b.follower_id=p.passport_id) AS following,
              EXISTS(SELECT 1 FROM community_follows c
                     WHERE c.follower_id=? AND c.followed_id=p.passport_id) AS is_following
            FROM passports p JOIN community_profiles cp ON cp.passport_id=p.passport_id
            WHERE (p.display_name LIKE ? OR cp.bio LIKE ?)
              AND (?='all' OR cp.role=?)
              AND p.passport_id <> ?
            ORDER BY followers DESC, p.display_name COLLATE NOCASE
            LIMIT ?
            """,
            (current_id, search, search, role, role, current_id, limit),
        ).fetchall()
        return {"people": [person_payload(row) for row in rows]}


@router.post("/profile/{passport_id}/follow")
def change_follow(passport_id: str, payload: FollowRequest) -> dict[str, Any]:
    with database() as db:
        require_passport(db, passport_id)
        require_passport(db, payload.target_id)
        if passport_id == payload.target_id:
            raise HTTPException(status_code=400, detail="You cannot follow your own profile.")
        if payload.action == "follow":
            db.execute(
                "INSERT OR IGNORE INTO community_follows(follower_id, followed_id) VALUES (?, ?)",
                (passport_id, payload.target_id),
            )
        else:
            db.execute(
                "DELETE FROM community_follows WHERE follower_id=? AND followed_id=?",
                (passport_id, payload.target_id),
            )
        return {
            "following": payload.action == "follow",
            "profile": profile_payload(db, passport_id),
        }


def relationship_rows(db: sqlite3.Connection, passport_id: str, direction: str) -> list[dict[str, Any]]:
    if direction == "followers":
        id_column = "f.follower_id"
        where_column = "f.followed_id"
    else:
        id_column = "f.followed_id"
        where_column = "f.follower_id"
    rows = db.execute(
        f"""
        SELECT p.passport_id, p.display_name, cp.role, cp.bio,
          (SELECT COUNT(*) FROM community_follows a WHERE a.followed_id=p.passport_id) AS followers,
          (SELECT COUNT(*) FROM community_follows b WHERE b.follower_id=p.passport_id) AS following,
          CASE WHEN ? = 'following' THEN 1 ELSE 0 END AS is_following
        FROM community_follows f
        JOIN passports p ON p.passport_id={id_column}
        JOIN community_profiles cp ON cp.passport_id=p.passport_id
        WHERE {where_column}=?
        ORDER BY f.created_at DESC
        """,
        (direction, passport_id),
    ).fetchall()
    return [person_payload(row) for row in rows]


@router.get("/profile/{passport_id}/followers")
def get_followers(passport_id: str) -> dict[str, Any]:
    with database() as db:
        require_passport(db, passport_id)
        return {"people": relationship_rows(db, passport_id, "followers")}


@router.get("/profile/{passport_id}/following")
def get_following(passport_id: str) -> dict[str, Any]:
    with database() as db:
        require_passport(db, passport_id)
        return {"people": relationship_rows(db, passport_id, "following")}


def validate_file(content: bytes, suffix: str, mime_type: str) -> None:
    expected = ALLOWED_TYPES.get(suffix)
    if not expected or mime_type != expected:
        raise HTTPException(status_code=415, detail="Upload a PDF, PNG, JPG or WEBP file.")
    valid = False
    if suffix == ".pdf":
        valid = content.startswith(b"%PDF-")
    elif suffix == ".png":
        valid = content.startswith(b"\x89PNG\r\n\x1a\n")
    elif suffix in {".jpg", ".jpeg"}:
        valid = content.startswith(b"\xff\xd8\xff")
    elif suffix == ".webp":
        valid = content.startswith(b"RIFF") and content[8:12] == b"WEBP"
    if not valid:
        raise HTTPException(status_code=400, detail="The file contents do not match the selected file type.")


@router.post("/resources/{passport_id}")
async def upload_resource(
    passport_id: str,
    request: Request,
    title: str = Query(min_length=1, max_length=120),
    description: str = Query(default="", max_length=500),
    subject: str = Query(default="General", max_length=60),
    licence: str = Query(default="CC BY 4.0", max_length=60),
    filename: str = Query(default="resource", max_length=180),
) -> dict[str, Any]:
    suffix = Path(filename).suffix.lower()
    mime_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    content = await request.body()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Maximum upload size is 15 MB.")
    validate_file(content, suffix, mime_type)
    safe_original_name = Path(filename).name[:180]
    stored_name = f"{uuid.uuid4().hex}{suffix}"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    destination = UPLOAD_DIR / stored_name
    destination.write_bytes(content)

    try:
        with database() as db:
            require_passport(db, passport_id)
            cursor = db.execute(
                """INSERT INTO community_resources
                   (uploader_id,title,description,subject,original_name,stored_name,mime_type,size_bytes,licence)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (passport_id, title.strip(), description.strip(), subject.strip() or "General",
                 safe_original_name, stored_name, mime_type, len(content), licence.strip() or "CC BY 4.0"),
            )
            resource_id = int(cursor.lastrowid)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    return {"id": resource_id, "title": title.strip(), "file_url": f"/api/community/resources/{resource_id}/file"}


@router.get("/resources")
def list_resources(
    q: str = "",
    subject: str = "",
    limit: int = Query(default=60, ge=1, le=100),
) -> dict[str, Any]:
    search = f"%{q.strip()[:80]}%"
    subject_search = f"%{subject.strip()[:60]}%" if subject else "%"
    with database() as db:
        rows = db.execute(
            """
            SELECT r.*, p.display_name AS uploader_name
            FROM community_resources r
            JOIN passports p ON p.passport_id=r.uploader_id
            WHERE (r.title LIKE ? OR r.description LIKE ? OR r.original_name LIKE ?)
              AND r.subject LIKE ?
            ORDER BY r.id DESC LIMIT ?
            """,
            (search, search, search, subject_search, limit),
        ).fetchall()
        return {
            "resources": [
                {
                    "id": int(row["id"]),
                    "uploader_id": row["uploader_id"],
                    "uploader_name": row["uploader_name"],
                    "title": row["title"],
                    "description": row["description"],
                    "subject": row["subject"],
                    "original_name": row["original_name"],
                    "mime_type": row["mime_type"],
                    "size_bytes": int(row["size_bytes"]),
                    "licence": row["licence"],
                    "created_at": row["created_at"],
                    "file_url": f"/api/community/resources/{int(row['id'])}/file",
                }
                for row in rows
            ]
        }


@router.get("/resources/{resource_id}/file")
def get_resource_file(resource_id: int) -> FileResponse:
    with database() as db:
        row = db.execute(
            "SELECT original_name, stored_name, mime_type FROM community_resources WHERE id=?",
            (resource_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Resource not found.")
    path = UPLOAD_DIR / row["stored_name"]
    if not path.is_file():
        raise HTTPException(status_code=404, detail="The resource file is not on this server.")
    return FileResponse(path, media_type=row["mime_type"], filename=row["original_name"])
