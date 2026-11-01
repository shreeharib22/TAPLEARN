
from __future__ import annotations

import secrets
import json
import os
import sqlite3
import urllib.error
import urllib.request
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


# =============================================================================
# CONFIGURATION
# =============================================================================

BASE_DIR = Path(__file__).resolve().parent

# Load private settings from backend/.env.
# Never commit this file or expose its contents to the frontend.
load_dotenv(BASE_DIR / ".env")

DB_PATH = Path(
    os.getenv("TAPLEARN_DB_PATH", str(BASE_DIR / "taplearn.db"))
)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()

GROQ_MODEL = os.getenv(
    "GROQ_MODEL",
    "openai/gpt-oss-120b"
).strip()

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"

COMPLETION_THRESHOLD = 67

LESSON_CATALOG: tuple[tuple[str, str], ...] = (
    ("binary-trees-intro", "Binary Trees"),
    ("tree-traversals", "Tree Traversals"),
    ("binary-search-trees", "Binary Search Trees"),
    ("tree-applications", "Tree Applications"),
)

VALID_LESSON_IDS = {
    lesson_id for lesson_id, _ in LESSON_CATALOG
}


# =============================================================================
# FASTAPI APPLICATION
# =============================================================================

app = FastAPI(
    title="TAPLEARN API",
    description=(
        "Learner passport, lesson progress, diagnostics, "
        "NFC Tap-In and Groq AI tutor API."
    ),
    version="0.3.0",
)


allowed_origins = [
    value.strip()
    for value in os.getenv(
        "TAPLEARN_ALLOWED_ORIGINS",
        (
            "http://localhost:5173,"
            "http://127.0.0.1:5173,"
            "http://localhost:5174,"
            "http://127.0.0.1:5174"
        ),
    ).split(",")
    if value.strip()
]


app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=(
        r"https?://(localhost|127\.0\.0\.1|"
        r"10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?"
    ),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


# =============================================================================
# REQUEST MODELS
# =============================================================================

class ProgressUpdate(BaseModel):
    lesson_id: str = Field(min_length=1, max_length=80)
    score: int = Field(ge=0, le=100)


class DiagnosticUpdate(BaseModel):
    lesson_id: str = Field(min_length=1, max_length=80)
    score: int = Field(ge=0, le=100)


class MissedQuestion(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    chosen_answer: str = Field(min_length=1, max_length=300)
    correct_answer: str = Field(min_length=1, max_length=300)
    explanation: str = Field(min_length=1, max_length=700)


class TutorRequest(BaseModel):
    lesson_id: str = Field(min_length=1, max_length=80)
    lesson_title: str = Field(min_length=1, max_length=120)
    lesson_text: str = Field(min_length=1, max_length=3000)

    concepts: list[str] = Field(
        default_factory=list,
        max_length=12
    )

    score: int = Field(ge=0, le=100)
    total: int = Field(ge=1, le=20)

    missed_questions: list[MissedQuestion] = Field(
        default_factory=list,
        max_length=20
    )

    language: str = Field(
        default="English",
        min_length=2,
        max_length=40
    )


# =============================================================================
# DATABASE HELPERS
# =============================================================================

@contextmanager
def database() -> Iterator[sqlite3.Connection]:
    """Open a SQLite connection and close it safely."""

    DB_PATH.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    connection = sqlite3.connect(
        DB_PATH,
        timeout=15
    )

    connection.row_factory = sqlite3.Row

    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 15000")

    try:
        yield connection
        connection.commit()

    except Exception:
        connection.rollback()
        raise

    finally:
        connection.close()


def initialise_database() -> None:
    """Create TAPLEARN tables and the demo learner if needed."""

    with database() as db:

        db.execute(
            """
            CREATE TABLE IF NOT EXISTS passports (
                passport_id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                level TEXT NOT NULL DEFAULT 'Curious beginner',
                streak_days INTEGER NOT NULL DEFAULT 1,
                lessons_total INTEGER NOT NULL DEFAULT 4,
                current_lesson TEXT NOT NULL DEFAULT 'Binary Trees'
            )
            """
        )

        db.execute(
            """
            CREATE TABLE IF NOT EXISTS lesson_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                passport_id TEXT NOT NULL,
                lesson_id TEXT NOT NULL,
                score INTEGER NOT NULL DEFAULT 0,
                completed INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

                UNIQUE(passport_id, lesson_id),

                FOREIGN KEY(passport_id)
                    REFERENCES passports(passport_id)
            )
            """
        )

        db.execute(
            """
            CREATE TABLE IF NOT EXISTS diagnostic_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                passport_id TEXT NOT NULL,
                lesson_id TEXT NOT NULL,
                score INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY(passport_id)
                    REFERENCES passports(passport_id)
            )
            """
        )

        db.execute(
            """
            CREATE TABLE IF NOT EXISTS nfc_tap_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                passport_id TEXT NOT NULL,
                tapped_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY(passport_id)
                    REFERENCES passports(passport_id)
            )
            """
        )

        # Create one demo learner if it does not already exist.
        db.execute(
            """
            INSERT OR IGNORE INTO passports
            (
                passport_id,
                display_name,
                level,
                streak_days,
                lessons_total,
                current_lesson
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                "demo-passport-01",
                "Demo Learner",
                "Curious beginner",
                3,
                len(LESSON_CATALOG),
                "Binary Trees",
            ),
        )


def passport_payload(
    db: sqlite3.Connection,
    passport_id: str
) -> dict[str, Any] | None:

    passport = db.execute(
        """
        SELECT *
        FROM passports
        WHERE passport_id = ?
        """,
        (passport_id,),
    ).fetchone()

    if passport is None:
        return None

    records = db.execute(
        """
        SELECT lesson_id, score, completed
        FROM lesson_progress
        WHERE passport_id = ?
        """,
        (passport_id,),
    ).fetchall()

    progress_by_lesson = {
        row["lesson_id"]: {
            "score": int(row["score"]),
            "completed": bool(row["completed"]),
        }
        for row in records
    }

    lesson_rows = []

    score_total = 0
    completed_count = 0

    for lesson_id, title in LESSON_CATALOG:

        saved = progress_by_lesson.get(lesson_id)

        score = (
            saved["score"]
            if saved is not None
            else None
        )

        completed = (
            bool(saved["completed"])
            if saved is not None
            else False
        )

        lesson_rows.append(
            {
                "lesson_id": lesson_id,
                "title": title,
                "completed": completed,
                "score": score,
            }
        )

        if score is not None:
            score_total += score

        if completed:
            completed_count += 1

    total_lessons = len(LESSON_CATALOG)

    overall_progress = (
        round(score_total / total_lessons)
        if total_lessons
        else 0
    )

    return {
        "passport_id": passport["passport_id"],
        "display_name": passport["display_name"],
        "level": passport["level"],
        "streak_days": int(passport["streak_days"]),
        "lessons_completed": completed_count,
        "lessons_total": total_lessons,
        "current_lesson": passport["current_lesson"],
        "progress_percent": overall_progress,
        "lessons": lesson_rows,
    }


@app.on_event("startup")
def on_startup() -> None:
    initialise_database()


# =============================================================================
# HEALTH ENDPOINT
# =============================================================================

@app.get("/api/health")
def health() -> dict[str, str]:

    return {
        "status": "ok",
        "app": "TAPLEARN API",
        "ai_provider": "Groq",
        "ai_model": GROQ_MODEL,
    }


# =============================================================================
# LEARNER PASSPORT
# =============================================================================

@app.get("/api/passport/{passport_id}")
def get_passport(
    passport_id: str
) -> dict[str, Any]:

    with database() as db:
        result = passport_payload(
            db,
            passport_id
        )

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="This learning passport was not found.",
        )

    return result


# =============================================================================
# NFC TAP-IN SESSION
# =============================================================================

@app.post("/api/nfc/tap/{passport_id}")
def register_nfc_tap(
    passport_id: str
) -> dict[str, Any]:

    """Record an NFC tap and restore the learner's passport."""

    with database() as db:

        exists = db.execute(
            """
            SELECT 1
            FROM passports
            WHERE passport_id = ?
            """,
            (passport_id,),
        ).fetchone()

        if exists is None:
            raise HTTPException(
                status_code=404,
                detail="This learning passport was not found.",
            )

        db.execute(
            """
            INSERT INTO nfc_tap_events (passport_id)
            VALUES (?)
            """,
            (passport_id,),
        )

        tap_row = db.execute(
            """
            SELECT COUNT(*) AS total
            FROM nfc_tap_events
            WHERE passport_id = ?
            """,
            (passport_id,),
        ).fetchone()

        learner = passport_payload(
            db,
            passport_id
        )

    if learner is None:
        raise HTTPException(
            status_code=500,
            detail="Could not restore this learning passport.",
        )

    return {
        "session_started": True,
        "tap_count": int(tap_row["total"]),
        "passport": learner,
    }


# =============================================================================
# LESSON PROGRESS
# =============================================================================

@app.post("/api/progress/{passport_id}")
def update_progress(
    passport_id: str,
    update: ProgressUpdate
) -> dict[str, Any]:

    if update.lesson_id not in VALID_LESSON_IDS:
        raise HTTPException(
            status_code=400,
            detail=(
                "This lesson is not part of the "
                "TAPLEARN course catalog."
            ),
        )

    title_by_id = dict(LESSON_CATALOG)

    completion_state = (
        1
        if update.score >= COMPLETION_THRESHOLD
        else 0
    )

    with database() as db:

        passport_exists = db.execute(
            """
            SELECT 1
            FROM passports
            WHERE passport_id = ?
            """,
            (passport_id,),
        ).fetchone()

        if passport_exists is None:
            raise HTTPException(
                status_code=404,
                detail="This learning passport was not found.",
            )

        # Preserve the learner's best score on retakes.
        db.execute(
            """
            INSERT INTO lesson_progress
            (
                passport_id,
                lesson_id,
                score,
                completed
            )
            VALUES (?, ?, ?, ?)

            ON CONFLICT(passport_id, lesson_id)
            DO UPDATE SET

                score = MAX(
                    lesson_progress.score,
                    excluded.score
                ),

                completed = MAX(
                    lesson_progress.completed,
                    excluded.completed
                ),

                updated_at = CURRENT_TIMESTAMP
            """,
            (
                passport_id,
                update.lesson_id,
                update.score,
                completion_state,
            ),
        )

        db.execute(
            """
            UPDATE passports
            SET current_lesson = ?
            WHERE passport_id = ?
            """,
            (
                title_by_id[update.lesson_id],
                passport_id,
            ),
        )

        result = passport_payload(
            db,
            passport_id
        )

    if result is None:
        raise HTTPException(
            status_code=500,
            detail="Could not load the updated learning passport.",
        )

    return result


# =============================================================================
# MINDSCAN DIAGNOSTIC HISTORY
# =============================================================================

@app.post("/api/diagnostic/{passport_id}")
def save_diagnostic(
    passport_id: str,
    update: DiagnosticUpdate
) -> dict[str, Any]:

    if update.lesson_id not in VALID_LESSON_IDS:
        raise HTTPException(
            status_code=400,
            detail="This diagnostic module is not available.",
        )

    with database() as db:

        passport_exists = db.execute(
            """
            SELECT 1
            FROM passports
            WHERE passport_id = ?
            """,
            (passport_id,),
        ).fetchone()

        if passport_exists is None:
            raise HTTPException(
                status_code=404,
                detail="This learning passport was not found.",
            )

        db.execute(
            """
            INSERT INTO diagnostic_runs
            (
                passport_id,
                lesson_id,
                score
            )
            VALUES (?, ?, ?)
            """,
            (
                passport_id,
                update.lesson_id,
                update.score,
            ),
        )

        attempt_row = db.execute(
            """
            SELECT COUNT(*) AS total
            FROM diagnostic_runs
            WHERE passport_id = ?
            AND lesson_id = ?
            """,
            (
                passport_id,
                update.lesson_id,
            ),
        ).fetchone()

    return {
        "passport_id": passport_id,
        "lesson_id": update.lesson_id,
        "score": update.score,
        "attempt": int(attempt_row["total"]),
        "saved": True,
    }


# =============================================================================
# GROQ AI TUTOR
# =============================================================================

@app.post("/api/tutor/explain")
def tutor_explain(
    payload: TutorRequest
) -> dict[str, Any]:

    """
    Generate a beginner-friendly, source-grounded explanation using Groq.

    The API key is read from backend/.env.
    It is never sent to the frontend.
    """

    if payload.lesson_id not in VALID_LESSON_IDS:
        raise HTTPException(
            status_code=400,
            detail=(
                "This lesson is not part of the "
                "TAPLEARN course catalog."
            ),
        )

    if not GROQ_API_KEY:
        return {
            "available": False,
            "model": GROQ_MODEL,
            "explanation": (
                "The Groq AI tutor is not configured yet. "
                "Add GROQ_API_KEY to backend/.env and restart "
                "the backend. Your lesson and quiz content "
                "are still available."
            ),
            "detail": (
                "GROQ_API_KEY is missing from the "
                "backend environment."
            ),
        }

    missed_questions = [
        {
            "question": item.question,
            "learner_answer": item.chosen_answer,
            "correct_answer": item.correct_answer,
            "verified_explanation": item.explanation,
        }
        for item in payload.missed_questions
    ]

    system_prompt = f"""
You are TAPLEARN, a patient and highly accurate beginner-friendly
computing tutor.

Your entire response MUST be written in {payload.language}.

Do not switch to English unless the requested language is English.

Use simple words and short sentences.

Use only the verified lesson information and answer explanations
supplied by the application.

Never invent definitions, facts, traversal orders or examples.

If the source does not contain an answer, say that the supplied
lesson does not cover it.

Do not shame the learner.

Keep the complete response under 180 words.

Use exactly these three headings, translated naturally into
{payload.language}:

1. WHAT TO FIX
2. SIMPLE EXPLANATION
3. TRY THIS NEXT

In the final section, give one short practice question based only
on the supplied lesson.

Do not reveal its answer.
"""

    user_prompt = f"""
Lesson title: {payload.lesson_title}

Verified lesson text:
{payload.lesson_text}

Verified key concepts:
{json.dumps(payload.concepts, ensure_ascii=False)}

Assessment result:
{payload.score}% ({payload.total} questions)

Learner's missed answers:
{json.dumps(missed_questions, ensure_ascii=False)}

Explain the specific misunderstanding revealed by the missed answers.

If there are no missed answers, reinforce one key idea and offer
a slightly harder practice question.

The requested response language is {payload.language}.
"""

    request_body = json.dumps(
        {
            "model": GROQ_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": system_prompt,
                },
                {
                    "role": "user",
                    "content": user_prompt,
                },
            ],
            "temperature": 0.2,
            "max_completion_tokens": 450,
            "stream": False,
        },
        ensure_ascii=False,
    ).encode("utf-8")

    request = urllib.request.Request(
    GROQ_CHAT_URL,
    data=request_body,
    headers={
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "TAPLEARN-Backend/0.3 (Groq API client)",
    },
    method="POST",
)
    try:

        with urllib.request.urlopen(
            request,
            timeout=45
        ) as response:

            model_result = json.loads(
                response.read().decode("utf-8")
            )

        choices = model_result.get("choices") or []

        explanation = ""

        if choices:
            message = choices[0].get("message") or {}
            explanation = str(
                message.get("content") or ""
            ).strip()

        if not explanation:
            raise ValueError(
                "Groq returned an empty tutor response."
            )

        return {
            "available": True,
            "model": GROQ_MODEL,
            "explanation": explanation,
        }

    except urllib.error.HTTPError as exc:

        # Read Groq's actual response body.
        # This helps diagnose 401, 403, 404 and other errors.
        response_body = exc.read().decode(
            "utf-8",
            errors="replace"
        )

        error_message = response_body
        error_type = None
        error_code = None

        try:

            error_data = json.loads(response_body)

            error_info = error_data.get(
                "error",
                error_data
            )

            if isinstance(error_info, dict):

                error_message = (
                    error_info.get("message")
                    or str(error_info)
                )

                error_type = error_info.get("type")
                error_code = error_info.get("code")

            else:
                error_message = str(error_info)

        except (json.JSONDecodeError, TypeError):

            if not response_body:
                error_message = (
                    f"Groq returned HTTP {exc.code} "
                    "without an error message."
                )

        # Add helpful context without hiding Groq's original message.
        if exc.code == 401:
            prefix = "Authentication failed. Check the Groq API key. "

        elif exc.code == 403:
            prefix = (
                "Groq denied this request. Check API key permissions, "
                "account/project access and model availability. "
            )

        elif exc.code == 404:
            prefix = (
                "The requested Groq model or API endpoint was not found. "
            )

        elif exc.code == 429:
            prefix = (
                "Groq rate limit or usage quota reached. "
                "Wait and try again. "
            )

        else:
            prefix = f"Groq returned HTTP {exc.code}. "

        detail = prefix + str(error_message)

        return {
            "available": False,
            "model": GROQ_MODEL,
            "http_status": exc.code,
            "error_type": error_type,
            "error_code": error_code,
            "explanation": (
                "The Groq tutor could not complete this request. "
                "Your curated lesson and quiz results are still available."
            ),
            "detail": detail[:1000],
        }

    except (
        urllib.error.URLError,
        TimeoutError,
        OSError,
        ValueError,
        json.JSONDecodeError,
    ) as exc:

        return {
            "available": False,
            "model": GROQ_MODEL,
            "explanation": (
                "The Groq tutor is temporarily unreachable. "
                "Your curated lesson and quiz results are still available. "
                "Check the backend internet connection and try again."
            ),
            "detail": str(exc)[:500],
        }

# =============================================================================
# TAPLEARN STUDY ROOMS
# =============================================================================

class RoomCreateRequest(BaseModel):
    host_name: str = Field(min_length=1, max_length=60)
    lesson_id: str = Field(min_length=1, max_length=80)
    title: str = Field(default="TAPLEARN Study Room", min_length=1, max_length=80)


class RoomJoinRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=60)


class RoomMemberRequest(BaseModel):
    member_token: str = Field(min_length=20, max_length=100)


ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
ROOM_CAPACITY = 30


def initialise_room_tables():
    with database() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS study_rooms (
                room_code TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                lesson_id TEXT NOT NULL,
                host_name TEXT NOT NULL,
                host_passport_id TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                expires_at TEXT NOT NULL,
                max_members INTEGER NOT NULL DEFAULT 30,
                is_closed INTEGER NOT NULL DEFAULT 0
            )
        """)

        db.execute("""
            CREATE TABLE IF NOT EXISTS study_room_members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_code TEXT NOT NULL,
                member_token TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                passport_id TEXT,
                role TEXT NOT NULL DEFAULT 'member',
                joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(room_code)
                    REFERENCES study_rooms(room_code)
            )
        """)

        room_columns = {
            row["name"] for row in db.execute("PRAGMA table_info(study_rooms)").fetchall()
        }
        if "host_passport_id" not in room_columns:
            db.execute("ALTER TABLE study_rooms ADD COLUMN host_passport_id TEXT")

        member_columns = {
            row["name"] for row in db.execute("PRAGMA table_info(study_room_members)").fetchall()
        }
        if "passport_id" not in member_columns:
            db.execute("ALTER TABLE study_room_members ADD COLUMN passport_id TEXT")

        db.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_room_member_account
            ON study_room_members(room_code, passport_id)
            WHERE passport_id IS NOT NULL
        """)
        db.execute("""
            CREATE INDEX IF NOT EXISTS idx_room_members_code_seen
            ON study_room_members(room_code, last_seen)
        """)


@app.on_event("startup")
def on_startup_rooms():
    initialise_room_tables()


def room_snapshot(db, room_code):
    room = db.execute(
        "SELECT * FROM study_rooms WHERE room_code = ?",
        (room_code,),
    ).fetchone()

    if room is None:
        return None

    active_members = db.execute("""
        SELECT display_name, role, joined_at
        FROM study_room_members
        WHERE room_code = ?
          AND last_seen >= datetime('now', '-90 seconds')
        ORDER BY CASE role WHEN 'host' THEN 0 ELSE 1 END, joined_at
    """, (room_code,)).fetchall()

    expiry_check = db.execute(
        "SELECT ? > CURRENT_TIMESTAMP AS valid",
        (room["expires_at"],),
    ).fetchone()

    active = bool(
        not room["is_closed"] and expiry_check["valid"]
    )

    return {
        "room_code": room["room_code"],
        "title": room["title"],
        "lesson_id": room["lesson_id"],
        "host_name": room["host_name"],
        "created_at": room["created_at"],
        "expires_at": room["expires_at"],
        "max_members": int(room["max_members"]),
        "is_active": active,
        "member_count": len(active_members),
        "members": [
            {
                "display_name": member["display_name"],
                "role": member["role"],
                "joined_at": member["joined_at"],
            }
            for member in active_members
        ],
    }


def make_room_code(db):
    for _ in range(20):
        code = "".join(
            secrets.choice(ROOM_ALPHABET)
            for _ in range(6)
        )

        exists = db.execute(
            "SELECT 1 FROM study_rooms WHERE room_code = ?",
            (code,),
        ).fetchone()

        if exists is None:
            return code

    raise HTTPException(
        status_code=503,
        detail="Could not create a room code. Please try again.",
    )


@app.post("/api/rooms")
def create_study_room(payload: RoomCreateRequest, request: Request):
    if payload.lesson_id not in VALID_LESSON_IDS:
        raise HTTPException(
            status_code=400,
            detail="Choose a valid TAPLEARN lesson.",
        )

    host_passport_id, host_name = authenticated_passport(request)
    title = payload.title.strip() or "TAPLEARN Study Room"

    with database() as db:
        room_code = make_room_code(db)
        member_token = secrets.token_urlsafe(32)

        db.execute("""
            INSERT INTO study_rooms
                (room_code, title, lesson_id, host_name,
                 host_passport_id, expires_at, max_members)
            VALUES (?, ?, ?, ?, ?, datetime('now', '+2 hours'), ?)
        """, (
            room_code,
            title,
            payload.lesson_id,
            host_name,
            host_passport_id,
            ROOM_CAPACITY,
        ))

        db.execute("""
            INSERT INTO study_room_members
                (room_code, member_token, display_name, passport_id, role)
            VALUES (?, ?, ?, ?, 'host')
        """, (
            room_code,
            member_token,
            host_name,
            host_passport_id,
        ))

        snapshot = room_snapshot(db, room_code)

    return {
        "room": snapshot,
        "member_token": member_token,
        "invite_path": f"/?room={room_code}",
    }


@app.post("/api/rooms/{room_code}/join")
def join_study_room(
    room_code: str,
    payload: RoomJoinRequest,
    request: Request,
):
    code = room_code.strip().upper()
    passport_id, display_name = authenticated_passport(request)

    with database() as db:
        room = db.execute("""
            SELECT *
            FROM study_rooms
            WHERE room_code = ?
              AND is_closed = 0
              AND expires_at > CURRENT_TIMESTAMP
        """, (code,)).fetchone()

        if room is None:
            raise HTTPException(
                status_code=404,
                detail="This room does not exist or has expired.",
            )

        existing_member = db.execute(
            "SELECT id, role FROM study_room_members WHERE room_code = ? AND passport_id = ?",
            (code, passport_id),
        ).fetchone()

        active_count = db.execute("""
            SELECT COUNT(*) AS total
            FROM study_room_members
            WHERE room_code = ?
              AND last_seen >= datetime('now', '-90 seconds')
        """, (code,)).fetchone()["total"]

        if existing_member is None and int(active_count) >= int(room["max_members"]):
            raise HTTPException(
                status_code=409,
                detail="This room is full.",
            )

        member_token = secrets.token_urlsafe(32)

        if existing_member is None:
            db.execute("""
                INSERT INTO study_room_members
                    (room_code, member_token, display_name, passport_id, role)
                VALUES (?, ?, ?, ?, 'member')
            """, (
                code,
                member_token,
                display_name,
                passport_id,
            ))
        else:
            db.execute("""
                UPDATE study_room_members
                SET member_token = ?, display_name = ?, last_seen = CURRENT_TIMESTAMP
                WHERE room_code = ? AND passport_id = ?
            """, (
                member_token,
                display_name,
                code,
                passport_id,
            ))

        snapshot = room_snapshot(db, code)

    return {
        "room": snapshot,
        "member_token": member_token,
        "invite_path": f"/?room={code}",
    }


@app.get("/api/rooms/{room_code}")
def get_study_room(room_code: str):
    code = room_code.strip().upper()

    with database() as db:
        snapshot = room_snapshot(db, code)

    if snapshot is None:
        raise HTTPException(status_code=404, detail="Room not found.")

    if not snapshot["is_active"]:
        raise HTTPException(
            status_code=410,
            detail="This room has expired or been closed.",
        )

    return snapshot


@app.post("/api/rooms/{room_code}/heartbeat")
def heartbeat_study_room(
    room_code: str,
    payload: RoomMemberRequest,
    request: Request,
):
    code = room_code.strip().upper()
    passport_id, _ = authenticated_passport(request)

    with database() as db:
        updated = db.execute("""
            UPDATE study_room_members
            SET last_seen = CURRENT_TIMESTAMP
            WHERE room_code = ? AND member_token = ? AND passport_id = ?
        """, (
            code,
            payload.member_token,
            passport_id,
        ))

        if updated.rowcount == 0:
            raise HTTPException(
                status_code=403,
                detail="Room membership is no longer active. Join again.",
            )

        snapshot = room_snapshot(db, code)

    if snapshot is None or not snapshot["is_active"]:
        raise HTTPException(
            status_code=410,
            detail="This room has expired or been closed.",
        )

    return snapshot


@app.post("/api/rooms/{room_code}/leave")
def leave_study_room(
    room_code: str,
    payload: RoomMemberRequest,
    request: Request,
):
    code = room_code.strip().upper()
    passport_id, _ = authenticated_passport(request)

    with database() as db:
        db.execute("""
            UPDATE study_room_members
            SET last_seen = '1970-01-01 00:00:00'
            WHERE room_code = ? AND member_token = ? AND passport_id = ?
        """, (
            code,
            payload.member_token,
            passport_id,
        ))

    return {"left": True}
from collaboration import router as collaboration_router
app.include_router(collaboration_router)
from community import router as community_router
app.include_router(community_router)

# TAPLEARN account authentication
from fastapi.responses import JSONResponse
from auth import router as auth_router, current_user as taplearn_current_user
app.include_router(auth_router)


def authenticated_passport(request: Request) -> tuple[str, str]:
    """Return the verified account passport ID and its canonical display name."""
    passport_id, _ = taplearn_current_user(request.headers.get("authorization"))
    with database() as db:
        row = db.execute(
            "SELECT display_name FROM passports WHERE passport_id = ?",
            (passport_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail="The signed-in learner profile was not found.")
    return passport_id, str(row["display_name"])


@app.middleware("http")
async def require_account_for_rooms(request, call_next):
    path = request.url.path
    if request.method != "OPTIONS" and (path.startswith(("/api/rooms", "/api/collab", "/api/community")) and not path.endswith("/file")):
        try:
            taplearn_current_user(request.headers.get("authorization"))
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    return await call_next(request)
