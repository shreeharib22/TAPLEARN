from __future__ import annotations

import json
import os
import secrets
import sqlite3
import string
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import urlparse

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Request
from auth import current_user as taplearn_current_user
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
DB_PATH = Path(os.getenv("TAPLEARN_DB_PATH", str(BASE_DIR / "taplearn.db")))
router = APIRouter(prefix="/api/collab", tags=["room collaboration"])
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
ROOM_MINUTES = 120
MAX_MEMBERS = 30
ACTIVE_SECONDS = 120


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def timestamp() -> str:
    return utc_now().isoformat(timespec="seconds")


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA busy_timeout = 15000")
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def initialise_collaboration_tables() -> None:
    with connection() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS collab_rooms (
                room_code TEXT PRIMARY KEY,
                host_name TEXT NOT NULL,
                host_passport_id TEXT,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS collab_room_members (
                room_code TEXT NOT NULL,
                member_name TEXT NOT NULL,
                passport_id TEXT,
                joined_at TEXT NOT NULL,
                last_seen TEXT NOT NULL,
                PRIMARY KEY (room_code, member_name)
            );
            CREATE TABLE IF NOT EXISTS collab_notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_code TEXT NOT NULL,
                author TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS collab_resources (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_code TEXT NOT NULL,
                author TEXT NOT NULL,
                title TEXT NOT NULL,
                url TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS collab_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_code TEXT NOT NULL,
                author TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS collab_quizzes (
                room_code TEXT PRIMARY KEY,
                quiz_id TEXT NOT NULL,
                title TEXT NOT NULL,
                questions_json TEXT NOT NULL,
                created_by TEXT NOT NULL,
                current_index INTEGER NOT NULL DEFAULT 0,
                revealed INTEGER NOT NULL DEFAULT 0,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS collab_quiz_answers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_code TEXT NOT NULL,
                quiz_id TEXT NOT NULL,
                question_index INTEGER NOT NULL,
                member_name TEXT NOT NULL,
                answer_index INTEGER NOT NULL,
                is_correct INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(room_code, quiz_id, question_index, member_name)
            );
            CREATE TABLE IF NOT EXISTS collab_whiteboard_strokes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_code TEXT NOT NULL,
                author TEXT NOT NULL,
                colour TEXT NOT NULL,
                points_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_collab_notes_room ON collab_notes(room_code, id DESC);
            CREATE INDEX IF NOT EXISTS idx_collab_resources_room ON collab_resources(room_code, id DESC);
            CREATE INDEX IF NOT EXISTS idx_collab_messages_room ON collab_messages(room_code, id DESC);
            CREATE INDEX IF NOT EXISTS idx_collab_strokes_room ON collab_whiteboard_strokes(room_code, id);
            """
        )
        room_columns = {
            row["name"] for row in db.execute("PRAGMA table_info(collab_rooms)").fetchall()
        }
        if "host_passport_id" not in room_columns:
            db.execute("ALTER TABLE collab_rooms ADD COLUMN host_passport_id TEXT")
        member_columns = {
            row["name"] for row in db.execute("PRAGMA table_info(collab_room_members)").fetchall()
        }
        if "passport_id" not in member_columns:
            db.execute("ALTER TABLE collab_room_members ADD COLUMN passport_id TEXT")
        db.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_collab_room_member_account "
            "ON collab_room_members(room_code, passport_id) WHERE passport_id IS NOT NULL"
        )


initialise_collaboration_tables()


def clean_name(name: str) -> str:
    return " ".join(name.strip().split())[:40]


def mirror_legacy_room(db: sqlite3.Connection, code: str) -> sqlite3.Row | None:
    """Attach the collaboration tools to a room created by TAPLEARN's existing room API."""
    room = db.execute("SELECT * FROM collab_rooms WHERE room_code = ?", (code,)).fetchone()
    if room is not None:
        return room

    table_exists = db.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'study_rooms'"
    ).fetchone()
    if table_exists is None:
        return None

    columns = {row["name"] for row in db.execute("PRAGMA table_info(study_rooms)").fetchall()}
    code_column = next((name for name in ("room_code", "code", "room_id") if name in columns), None)
    if code_column is None:
        return None

    legacy = db.execute(
        f"SELECT * FROM study_rooms WHERE UPPER({code_column}) = ?", (code,)
    ).fetchone()
    if legacy is None:
        return None

    if "status" in columns and str(legacy["status"]).lower() in {"closed", "expired", "deleted"}:
        return None

    host = next((str(legacy[name]).strip() for name in ("host_name", "owner_name", "created_by_name", "host", "created_by")
                 if name in columns and legacy[name] and str(legacy[name]).strip()), "Room host")
    host_passport_id = (
        str(legacy["host_passport_id"])
        if "host_passport_id" in columns and legacy["host_passport_id"]
        else None
    )
    created = str(legacy["created_at"]) if "created_at" in columns and legacy["created_at"] else timestamp()
    expires = str(legacy["expires_at"]) if "expires_at" in columns and legacy["expires_at"] else (utc_now() + timedelta(minutes=ROOM_MINUTES)).isoformat(timespec="seconds")
    db.execute(
        "INSERT OR IGNORE INTO collab_rooms "
        "(room_code, host_name, host_passport_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
        (code, host, host_passport_id, created, expires),
    )
    return db.execute("SELECT * FROM collab_rooms WHERE room_code = ?", (code,)).fetchone()


def require_room(db: sqlite3.Connection, room_code: str) -> sqlite3.Row:
    code = room_code.strip().upper()
    room = mirror_legacy_room(db, code)
    if room is None:
        raise HTTPException(status_code=404, detail="This study room does not exist or has expired.")
    try:
        expiry = datetime.fromisoformat(str(room["expires_at"]))
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
    except ValueError:
        expiry = utc_now() - timedelta(seconds=1)
    if expiry <= utc_now():
        raise HTTPException(status_code=410, detail="This study room has expired. Create a new room to continue.")
    return room


def require_member(db: sqlite3.Connection, room_code: str, request: Request) -> str:
    """Verify room membership by the signed-in account, never by a display name."""
    passport_id, _ = taplearn_current_user(request.headers.get("authorization"))
    row = db.execute(
        "SELECT member_name FROM collab_room_members WHERE room_code = ? AND passport_id = ?",
        (room_code, passport_id),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=403, detail="Join this room before using its workspace.")
    db.execute(
        "UPDATE collab_room_members SET last_seen = ? WHERE room_code = ? AND passport_id = ?",
        (timestamp(), room_code, passport_id),
    )
    return str(row["member_name"])


class NameRequest(BaseModel):
    member_name: str = Field(min_length=1, max_length=40)


class NoteRequest(NameRequest):
    title: str = Field(min_length=1, max_length=100)
    content: str = Field(min_length=1, max_length=8000)


class ResourceRequest(NameRequest):
    title: str = Field(min_length=1, max_length=120)
    url: str = Field(min_length=8, max_length=1000)
    description: str = Field(default="", max_length=500)


class MessageRequest(NameRequest):
    message: str = Field(min_length=1, max_length=1200)


class QuizQuestion(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    options: list[str] = Field(min_length=2, max_length=4)
    correct_index: int = Field(ge=0, le=3)
    explanation: str = Field(default="", max_length=700)


class QuizStartRequest(NameRequest):
    title: str = Field(min_length=1, max_length=100)
    questions: list[QuizQuestion] = Field(min_length=1, max_length=10)


class QuizAnswerRequest(NameRequest):
    answer_index: int = Field(ge=0, le=3)


class Point(BaseModel):
    x: float = Field(ge=0, le=900)
    y: float = Field(ge=0, le=420)


class StrokeRequest(NameRequest):
    colour: str = Field(default="#365c43", pattern=r"^#[0-9a-fA-F]{6}$")
    points: list[Point] = Field(min_length=2, max_length=400)


@router.post("/rooms")
def create_room(payload: NameRequest, request: Request) -> dict[str, Any]:
    host_passport_id, _ = taplearn_current_user(request.headers.get("authorization"))
    with connection() as profile_db:
        profile = profile_db.execute(
            "SELECT display_name FROM passports WHERE passport_id = ?", (host_passport_id,)
        ).fetchone()
    if profile is None:
        raise HTTPException(status_code=401, detail="Signed-in learner profile not found.")
    host = clean_name(str(profile["display_name"]))
    expires = utc_now() + timedelta(minutes=ROOM_MINUTES)
    with connection() as db:
        for _ in range(20):
            code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
            exists = db.execute("SELECT 1 FROM collab_rooms WHERE room_code = ?", (code,)).fetchone()
            if not exists:
                break
        else:
            raise HTTPException(status_code=503, detail="Could not generate a room code. Please try again.")
        db.execute(
            "INSERT INTO collab_rooms "
            "(room_code, host_name, host_passport_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
            (code, host, host_passport_id, timestamp(), expires.isoformat(timespec="seconds")),
        )
        db.execute(
            "INSERT INTO collab_room_members "
            "(room_code, member_name, passport_id, joined_at, last_seen) VALUES (?, ?, ?, ?, ?)",
            (code, host, host_passport_id, timestamp(), timestamp()),
        )
    return {"room_code": code, "host_name": host, "expires_at": expires.isoformat(timespec="seconds"), "member_name": host}


@router.post("/rooms/{room_code}/join")
def join_room(room_code: str, payload: NameRequest, request: Request) -> dict[str, Any]:
    code = room_code.strip().upper()
    passport_id, _ = taplearn_current_user(request.headers.get("authorization"))
    with connection() as profile_db:
        profile = profile_db.execute(
            "SELECT display_name FROM passports WHERE passport_id = ?", (passport_id,)
        ).fetchone()
    if profile is None:
        raise HTTPException(status_code=401, detail="Signed-in learner profile not found.")
    name = clean_name(str(profile["display_name"]))
    with connection() as db:
        require_room(db, code)
        active_since = (utc_now() - timedelta(seconds=ACTIVE_SECONDS)).isoformat(timespec="seconds")
        active_count = db.execute(
            "SELECT COUNT(*) AS total FROM collab_room_members WHERE room_code = ? AND last_seen >= ?",
            (code, active_since),
        ).fetchone()["total"]
        existing = db.execute(
            "SELECT member_name FROM collab_room_members WHERE room_code = ? AND passport_id = ?",
            (code, passport_id),
        ).fetchone()
        if not existing and int(active_count) >= MAX_MEMBERS:
            raise HTTPException(status_code=409, detail=f"This room has reached its {MAX_MEMBERS}-member limit.")

        # The legacy table has a room/name primary key. Disambiguate identical
        # display names without allowing one account to impersonate another.
        member_name = str(existing["member_name"]) if existing else name
        if not existing:
            name_conflict = db.execute(
                "SELECT 1 FROM collab_room_members WHERE room_code = ? AND member_name = ?",
                (code, member_name),
            ).fetchone()
            if name_conflict:
                member_name = f"{name[:30]} ({passport_id[-6:]})"
            db.execute(
                "INSERT INTO collab_room_members "
                "(room_code, member_name, passport_id, joined_at, last_seen) VALUES (?, ?, ?, ?, ?)",
                (code, member_name, passport_id, timestamp(), timestamp()),
            )
        else:
            # Preserve any suffix added to distinguish two accounts with the
            # same display name in this legacy name-keyed table.
            member_name = str(existing["member_name"])
            db.execute(
                "UPDATE collab_room_members SET last_seen = ? "
                "WHERE room_code = ? AND passport_id = ?",
                (timestamp(), code, passport_id),
            )
        return {"joined": True, "room_code": code, "member_name": member_name, "expires_at": require_room(db, code)["expires_at"]}


@router.get("/rooms/{room_code}/workspace")
def get_workspace(room_code: str, request: Request) -> dict[str, Any]:
    code = room_code.strip().upper()
    with connection() as db:
        room = require_room(db, code)
        member = require_member(db, code, request)
        active_since = (utc_now() - timedelta(seconds=ACTIVE_SECONDS)).isoformat(timespec="seconds")
        members = [dict(row) for row in db.execute(
            "SELECT member_name, joined_at FROM collab_room_members WHERE room_code = ? AND last_seen >= ? ORDER BY joined_at",
            (code, active_since),
        ).fetchall()]
        notes = [dict(row) for row in db.execute(
            "SELECT id, author, title, content, created_at FROM collab_notes WHERE room_code = ? ORDER BY id DESC LIMIT 100",
            (code,),
        ).fetchall()]
        resources = [dict(row) for row in db.execute(
            "SELECT id, author, title, url, description, created_at FROM collab_resources WHERE room_code = ? ORDER BY id DESC LIMIT 100",
            (code,),
        ).fetchall()]
        messages = [dict(row) for row in db.execute(
            "SELECT id, author, message, created_at FROM collab_messages WHERE room_code = ? ORDER BY id DESC LIMIT 100",
            (code,),
        ).fetchall()]
        strokes = [dict(row) for row in db.execute(
            "SELECT id, author, colour, points_json, created_at FROM collab_whiteboard_strokes WHERE room_code = ? ORDER BY id ASC LIMIT 500",
            (code,),
        ).fetchall()]
        for stroke in strokes:
            stroke["points"] = json.loads(stroke.pop("points_json"))

        quiz_row = db.execute("SELECT * FROM collab_quizzes WHERE room_code = ?", (code,)).fetchone()
        quiz: dict[str, Any] | None = None
        if quiz_row is not None:
            question_list = json.loads(quiz_row["questions_json"])
            quiz_active = bool(quiz_row["is_active"])
            current_index = int(quiz_row["current_index"])
            revealed = bool(quiz_row["revealed"])
            question = question_list[current_index] if 0 <= current_index < len(question_list) else None
            answer_row = None
            answer_count = 0
            if question is not None:
                answer_row = db.execute(
                    """SELECT answer_index FROM collab_quiz_answers
                       WHERE room_code = ? AND quiz_id = ? AND question_index = ? AND member_name = ?""",
                    (code, quiz_row["quiz_id"], current_index, member),
                ).fetchone()
                answer_count = int(db.execute(
                    """SELECT COUNT(*) AS total FROM collab_quiz_answers
                       WHERE room_code = ? AND quiz_id = ? AND question_index = ?""",
                    (code, quiz_row["quiz_id"], current_index),
                ).fetchone()["total"])
            safe_question = None
            if question is not None:
                safe_question = {"question": question["question"], "options": question["options"]}
                if revealed:
                    safe_question["correct_index"] = question["correct_index"]
                    safe_question["explanation"] = question.get("explanation", "")
            scores = []
            if revealed or not quiz_active:
                scores = [dict(row) for row in db.execute(
                    """SELECT member_name, SUM(is_correct) AS score, COUNT(*) AS answered
                       FROM collab_quiz_answers WHERE room_code = ? AND quiz_id = ?
                       GROUP BY member_name ORDER BY score DESC, member_name ASC""",
                    (code, quiz_row["quiz_id"]),
                ).fetchall()]
            quiz = {
                "quiz_id": quiz_row["quiz_id"],
                "title": quiz_row["title"],
                "created_by": quiz_row["created_by"],
                "is_active": quiz_active,
                "current_index": current_index,
                "total_questions": len(question_list),
                "revealed": revealed,
                "question": safe_question,
                "your_answer_index": int(answer_row["answer_index"]) if answer_row else None,
                "answer_count": answer_count,
                "scores": scores,
            }

        return {
            "room": {"room_code": code, "host_name": room["host_name"], "expires_at": room["expires_at"]},
            "member_name": member,
            "members": members,
            "notes": notes,
            "resources": resources,
            "messages": messages,
            "quiz": quiz,
            "whiteboard": {"strokes": strokes},
            "updated_at": timestamp(),
        }


@router.post("/rooms/{room_code}/notes")
def add_note(room_code: str, payload: NoteRequest, request: Request) -> dict[str, Any]:
    code = room_code.strip().upper()
    with connection() as db:
        require_room(db, code)
        author = require_member(db, code, request)
        cursor = db.execute(
            "INSERT INTO collab_notes (room_code, author, title, content, created_at) VALUES (?, ?, ?, ?, ?)",
            (code, author, payload.title.strip(), payload.content.strip(), timestamp()),
        )
        row = db.execute("SELECT id, author, title, content, created_at FROM collab_notes WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(row)


@router.post("/rooms/{room_code}/resources")
def add_resource(room_code: str, payload: ResourceRequest, request: Request) -> dict[str, Any]:
    code = room_code.strip().upper()
    parsed = urlparse(payload.url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=400, detail="Use a valid http or https resource link.")
    with connection() as db:
        require_room(db, code)
        author = require_member(db, code, request)
        cursor = db.execute(
            "INSERT INTO collab_resources (room_code, author, title, url, description, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (code, author, payload.title.strip(), payload.url.strip(), payload.description.strip(), timestamp()),
        )
        row = db.execute("SELECT id, author, title, url, description, created_at FROM collab_resources WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(row)


@router.post("/rooms/{room_code}/messages")
def add_message(room_code: str, payload: MessageRequest, request: Request) -> dict[str, Any]:
    code = room_code.strip().upper()
    with connection() as db:
        require_room(db, code)
        author = require_member(db, code, request)
        cursor = db.execute(
            "INSERT INTO collab_messages (room_code, author, message, created_at) VALUES (?, ?, ?, ?)",
            (code, author, payload.message.strip(), timestamp()),
        )
        db.execute(
            "DELETE FROM collab_messages WHERE room_code = ? AND id NOT IN (SELECT id FROM collab_messages WHERE room_code = ? ORDER BY id DESC LIMIT 100)",
            (code, code),
        )
        row = db.execute("SELECT id, author, message, created_at FROM collab_messages WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(row)


@router.post("/rooms/{room_code}/quiz/start")
def start_room_quiz(room_code: str, payload: QuizStartRequest, request: Request) -> dict[str, Any]:
    code = room_code.strip().upper()
    questions = [item.model_dump() for item in payload.questions]
    for item in questions:
        if item["correct_index"] >= len(item["options"]):
            raise HTTPException(status_code=400, detail="A quiz answer index is outside its option list.")
        item["options"] = [str(option).strip()[:180] for option in item["options"]]
    with connection() as db:
        require_room(db, code)
        creator = require_member(db, code, request)
        active_quiz = db.execute(
            "SELECT is_active FROM collab_quizzes WHERE room_code = ?", (code,)
        ).fetchone()
        if active_quiz is not None and bool(active_quiz["is_active"]):
            raise HTTPException(status_code=409, detail="A group quiz is already in progress.")
        quiz_id = secrets.token_hex(8)
        db.execute(
            """INSERT INTO collab_quizzes (room_code, quiz_id, title, questions_json, created_by, current_index, revealed, is_active, created_at)
               VALUES (?, ?, ?, ?, ?, 0, 0, 1, ?)
               ON CONFLICT(room_code) DO UPDATE SET quiz_id=excluded.quiz_id, title=excluded.title,
               questions_json=excluded.questions_json, created_by=excluded.created_by, current_index=0,
               revealed=0, is_active=1, created_at=excluded.created_at""",
            (code, quiz_id, payload.title.strip(), json.dumps(questions, ensure_ascii=False), creator, timestamp()),
        )
        return {"started": True, "quiz_id": quiz_id, "title": payload.title.strip(), "questions": len(questions)}


@router.post("/rooms/{room_code}/quiz/answer")
def answer_room_quiz(room_code: str, payload: QuizAnswerRequest, request: Request) -> dict[str, Any]:
    code = room_code.strip().upper()
    with connection() as db:
        require_room(db, code)
        member = require_member(db, code, request)
        quiz = db.execute("SELECT * FROM collab_quizzes WHERE room_code = ? AND is_active = 1", (code,)).fetchone()
        if quiz is None:
            raise HTTPException(status_code=404, detail="There is no active group quiz.")
        questions = json.loads(quiz["questions_json"])
        index = int(quiz["current_index"])
        question = questions[index]
        if bool(quiz["revealed"]):
            raise HTTPException(status_code=409, detail="The answer has already been revealed. Move to the next question.")
        if payload.answer_index >= len(question["options"]):
            raise HTTPException(status_code=400, detail="Choose one of the available answers.")
        correct = int(payload.answer_index == int(question["correct_index"]))
        db.execute(
            """INSERT INTO collab_quiz_answers (room_code, quiz_id, question_index, member_name, answer_index, is_correct, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(room_code, quiz_id, question_index, member_name) DO UPDATE SET
               answer_index=excluded.answer_index, is_correct=excluded.is_correct, created_at=excluded.created_at""",
            (code, quiz["quiz_id"], index, member, payload.answer_index, correct, timestamp()),
        )
        return {"accepted": True, "question_index": index}


@router.post("/rooms/{room_code}/quiz/reveal")
def reveal_room_quiz(room_code: str, payload: NameRequest, request: Request) -> dict[str, Any]:
    code = room_code.strip().upper()
    with connection() as db:
        require_room(db, code)
        member = require_member(db, code, request)
        quiz = db.execute("SELECT created_by FROM collab_quizzes WHERE room_code = ? AND is_active = 1", (code,)).fetchone()
        if quiz is None:
            raise HTTPException(status_code=404, detail="There is no active group quiz.")
        if quiz["created_by"] != member:
            raise HTTPException(status_code=403, detail="Only the quiz creator can reveal the answer.")
        db.execute("UPDATE collab_quizzes SET revealed = 1 WHERE room_code = ? AND is_active = 1", (code,))
        return {"revealed": True}


@router.post("/rooms/{room_code}/quiz/next")
def next_room_question(room_code: str, payload: NameRequest, request: Request) -> dict[str, Any]:
    code = room_code.strip().upper()
    with connection() as db:
        require_room(db, code)
        member = require_member(db, code, request)
        quiz = db.execute("SELECT * FROM collab_quizzes WHERE room_code = ? AND is_active = 1", (code,)).fetchone()
        if quiz is None:
            raise HTTPException(status_code=404, detail="There is no active group quiz.")
        if quiz["created_by"] != member:
            raise HTTPException(status_code=403, detail="Only the quiz creator can move to the next question.")
        if not bool(quiz["revealed"]):
            raise HTTPException(status_code=409, detail="Reveal the current answer before moving on.")
        questions = json.loads(quiz["questions_json"])
        next_index = int(quiz["current_index"]) + 1
        if next_index >= len(questions):
            db.execute("UPDATE collab_quizzes SET is_active = 0, revealed = 1 WHERE room_code = ?", (code,))
            return {"completed": True}
        db.execute("UPDATE collab_quizzes SET current_index = ?, revealed = 0 WHERE room_code = ?", (next_index, code))
        return {"completed": False, "current_index": next_index}


@router.post("/rooms/{room_code}/whiteboard/strokes")
def add_whiteboard_stroke(room_code: str, payload: StrokeRequest, request: Request) -> dict[str, Any]:
    code = room_code.strip().upper()
    points = [point.model_dump() for point in payload.points]
    with connection() as db:
        require_room(db, code)
        author = require_member(db, code, request)
        cursor = db.execute(
            "INSERT INTO collab_whiteboard_strokes (room_code, author, colour, points_json, created_at) VALUES (?, ?, ?, ?, ?)",
            (code, author, payload.colour, json.dumps(points), timestamp()),
        )
        db.execute(
            "DELETE FROM collab_whiteboard_strokes WHERE room_code = ? AND id NOT IN (SELECT id FROM collab_whiteboard_strokes WHERE room_code = ? ORDER BY id DESC LIMIT 500)",
            (code, code),
        )
        return {"saved": True, "stroke_id": int(cursor.lastrowid)}


@router.post("/rooms/{room_code}/whiteboard/clear")
def clear_whiteboard(room_code: str, payload: NameRequest, request: Request) -> dict[str, bool]:
    code = room_code.strip().upper()
    with connection() as db:
        require_room(db, code)
        require_member(db, code, request)
        db.execute("DELETE FROM collab_whiteboard_strokes WHERE room_code = ?", (code,))
    return {"cleared": True}
