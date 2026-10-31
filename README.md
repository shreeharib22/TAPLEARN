# TAPLEARN

**An NFC-powered learning passport with adaptive concept checks.** TAPLEARN helps learners carry a reusable learning identity between shared classroom devices, continue from their next checkpoint, practise core computing concepts, and keep progress on a persistent passport.

## What this build includes

- **Grove home:** original animated learning-grove scene with TAPLEARN navigation and a learner summary.
- **Four learning modules:** Binary Trees, Tree Traversals, Binary Search Trees, and Tree Applications.
- **Lesson flow:** read a short lesson, inspect the visual, answer three questions, and save the result.
- **MindScan:** a separate diagnostic; diagnostic attempts are stored separately and do not mark a lesson complete.
- **Concept Rescue:** a short, topic-specific explanation after the assessment.
- **Tap-In NFC session:** opening `/tap/{passport_id}` records a tap event on the backend, restores the learner passport, and displays the next learning checkpoint before the learner continues.
- **Learning passport:** learner progress is retrieved from the backend and can be resumed from another shared device using the card URL.
- **SQLite persistence:** lesson scores, diagnostic attempts and NFC tap events persist across local restarts.
- **Groq-powered tutor:** the assessment result can request a misconception-focused explanation in the selected language through Groq's hosted chat-completions API. The API key stays on the backend.

A lesson is marked complete at **67% or above**. Lower scores are saved as review results; the learner can try again without losing their best recorded score.

## Demo flow

1. Start the backend and frontend.
2. Open `http://localhost:5173/tap/demo-passport-01` (use the exact port Vite prints).
3. The Tap-In page records the NFC-style session and restores the learner's progress.
4. Start the suggested checkpoint or open MindScan.
5. Complete a lesson; the backend saves the result to the passport.
6. Open Passport to copy the route that can be written to an NFC card after public HTTPS deployment.

## Requirements

- Node.js 20 or newer
- Python 3.10 or newer
- A Groq API key for live AI tutoring (the rest of the learning app works without it)

## Run locally

### 1. Configure the backend

From `backend/`, create a private `.env` file by copying the example:

Windows PowerShell:

```powershell
Copy-Item .env.example .env
notepad .env
```

macOS/Linux:

```bash
cp .env.example .env
```

Add your own Groq key and model in `backend/.env`:

```dotenv
GROQ_API_KEY=your_private_groq_key_here
GROQ_MODEL=openai/gpt-oss-120b
```

Get a key from <https://console.groq.com/keys>. Never put the real key in `frontend/`, React code, screenshots, source control or a public repository. `backend/.env` is ignored by Git. Keep `.env.example` as a placeholder only.

Windows PowerShell:

```powershell
cd backend
py -m venv .venv
.venv\Scripts\Activate.ps1
py -m pip install -r requirements.txt
py -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

macOS/Linux:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend health check: <http://localhost:8000/api/health>  
API documentation: <http://localhost:8000/docs>

### 2. Start the frontend in a second terminal

From `frontend/`:

```bash
npm install
npm run dev
```

Open the exact URL printed by Vite, normally <http://localhost:5173/tap/demo-passport-01>. If port 5173 is busy, Vite may use 5174.

## NFC Tap-In setup

After deploying the frontend and backend to a public HTTPS domain, write this URL as an NDEF URI record to a compatible NFC card:

```text
https://YOUR-DOMAIN/tap/demo-passport-01
```

Use an NDEF-compatible NFC writing app. Do not write `localhost`; another device cannot access your computer's localhost. When the NFC URL is opened (by tapping the card or opening the link), the frontend calls `POST /api/nfc/tap/{passport_id}`. The backend records the tap and returns the learner's saved passport; the app then displays the next incomplete lesson as the next checkpoint.

**Important limitation:** this demo card is a portable learner identifier, not secure authentication. A standard static NFC URL can be copied, and the demo passport ID is visible in the URL. Do not use real student records or sensitive data with this demo implementation. A production version needs per-learner random revocable tokens, account or guardian/teacher verification as appropriate, access controls, consent, and a privacy-reviewed database.

## Groq AI tutor

The backend calls Groq's Chat Completions endpoint using `GROQ_API_KEY` and `GROQ_MODEL`. The default model in this build is `openai/gpt-oss-120b`. The frontend calls only TAPLEARN's `/api/tutor/explain` endpoint; it never receives the Groq key. If the key is absent or Groq is unavailable, the app keeps the authored lesson and concept explanation available and reports that AI is unavailable.

To change the model, update `GROQ_MODEL` in `backend/.env` to an active model ID from the Groq model catalogue. Verify model availability before deployment because model availability and lifecycle can change.

## API endpoints

- `GET /api/health` — API status
- `GET /api/passport/{passport_id}` — retrieve learner passport and lesson progress
- `POST /api/nfc/tap/{passport_id}` — record a card tap and restore learner session data
- `POST /api/progress/{passport_id}` — save a lesson score; 67% or higher completes the lesson
- `POST /api/diagnostic/{passport_id}` — save a MindScan attempt separately
- `POST /api/tutor/explain` — generate a misconception-focused explanation with Groq

## Open-source and AI disclosure

- TAPLEARN application code: MIT License.
- AI assistance during development: OpenAI ChatGPT.
- Runtime AI inference: Groq API, using the model configured by `GROQ_MODEL`.
- TAPLEARN's grove scene is original project code built with Three.js; see `THIRD_PARTY_NOTICES.md`.
- The bundled Three.js runtime is MIT licensed. See its embedded copyright and SPDX header and `THIRD_PARTY_NOTICES.md`.
- Lexend is under the SIL Open Font License 1.1; the app references the hosted font asset rather than bundling a font binary.

## Current limitations

- This is a hackathon demo, not a production student identity or records system.
- The seeded demo passport is not secure authentication. The NFC URL is a bearer-style identifier and can be copied.
- NFC uses a standard NDEF URL and does not require Web NFC access in the browser.
- MindScan uses authored diagnostic question sets; Groq personalises the post-assessment explanation but does not generate or validate the quiz questions.
- The frontend and backend must both be deployed. The backend needs a persistent database volume and the Groq key must be configured as a private backend environment variable in hosting.
