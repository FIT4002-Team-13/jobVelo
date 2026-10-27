# FIT4002 - Jobvelo

**Jobvelo: Real-Time Interview Intelligence System** is an AI-powered interview assistance platform designed to help recruiters and interviewers conduct more structured, consistent, and effective interviews. Developed for Well Crafted Apps, jobVelo streamlines the recruitment process by combining candidate analysis, real-time interview assistance, and AI-driven evaluation in one platform.

Recruiters add jobs and candidates, an AI analyses each CV against the role, and interviewers run live interviews with real-time transcription, suggested follow-up questions, timed interview sections and bias warnings. After interviews, it offers structured candidate evaluations, performance summaries, and comparison tools to support fairer, evidence-based hiring decisions.

By reducing interviewer workload and cognitive overload, jobVelo aims to improve the quality and consistency of hiring while keeping human judgement at the centre of recruitment.

## Contents
- [Stack](#stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Running day to day](#running-day-to-day)
- [Testing and linting](#testing-and-linting)
- [Key concepts](#key-concepts)
- [Where to start coding](#where-to-start-coding)
- [Troubleshooting](#troubleshooting)

More detail lives next to the code:
- [backend/README.md](backend/README.md) - API layout, data model, services, auth and tenancy
- [frontend/README.md](frontend/README.md) - pages, routing, hooks, the interview flow and design tokens

## Stack
| Layer | Tech |
| --- | --- |
| Frontend | React 18, Vite 5, Tailwind CSS 3, React Router 6 |
| Backend | Python 3.12, FastAPI, Motor (async MongoDB driver), Pydantic 2 |
| Database | MongoDB (uploaded files are stored in GridFS) |
| Auth | JWT bearer tokens, bcrypt password hashing |
| Live transcription | Deepgram (streamed over a WebSocket) |
| LLMs | OpenAI (interview plans, live question suggestions, bias checks, reports, scoring) and Gemini (CV analysis, interviewer feedback, behavioural suggestions) |
| Testing | pytest and Ruff (backend); Vitest, ESLint and Playwright (frontend) |

## Project structure
```
.
├── .github/
│   ├── workflows/ci.yml       # audit + lint + tests + build on every push / PR
│   ├── workflows/e2e.yml      # Playwright end-to-end tests (weekly + manual)
│   └── pull_request_template.md
├── .pre-commit-config.yaml    # Ruff (backend) + ESLint (frontend) hooks
│
├── backend/                   # FastAPI + MongoDB  →  see backend/README.md
│   ├── main.py                # app entrypoint, router registration
│   ├── config.py              # settings, read from env / .env
│   ├── database.py            # Mongo connection + index creation
│   ├── dependencies.py        # auth dependencies (current user, role gates)
│   ├── security.py            # password hashing, JWTs, password rules
│   ├── routes/                # one module per API area
│   ├── models/                # Pydantic request / response models
│   ├── services/              # Deepgram / OpenAI / Gemini / GridFS / PDF wrappers
│   ├── scripts/               # one-off maintenance and seed scripts
│   ├── tests/                 # pytest suite (unit + mongomock integration)
│   ├── .env.example           # copy to .env
│   ├── requirements.txt       # runtime deps
│   └── requirements-dev.txt   # pytest, ruff, mongomock
│
└── frontend/                  # React + Vite + Tailwind  →  see frontend/README.md
    ├── src/
    │   ├── App.jsx            # all routes
    │   ├── pages/             # one component per route
    │   ├── components/        # grouped by feature (interview/, candidate/, ...)
    │   ├── hooks/             # data + live-interview logic (transcript, audio, sections)
    │   ├── lib/               # API client, auth context / token store, validators
    │   ├── utils/             # small pure helpers (formatting, time, avatars)
    │   ├── styles/            # design tokens + shared class strings
    │   ├── content/           # userGuide.json, the text of the in-app User Guide
    │   └── test/              # Vitest unit tests
    ├── e2e/                   # Playwright end-to-end tests
    ├── public/                # static assets
    └── vite.config.js         # dev server, /api proxy, Vitest config
```

## Getting started

### Prerequisites
- **Node.js 20+** and npm (CI uses Node 22)
- **Python 3.12**
- **MongoDB with TLS**: the backend always connects with `tls=True` (see `backend/database.py`), so use a **MongoDB Atlas** cluster (the free tier is fine) or a local server configured for TLS. A plain local `mongod` will not connect.
- API keys for **Deepgram**, **OpenAI** and **Gemini**. You can log in and browse without them, but transcription and AI features will fail when used.

### 1. Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # macOS / Linux
# .venv\Scripts\activate           # Windows
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env               # Windows: copy .env.example .env
# edit .env - set MONGODB_URI (your Atlas connection string) and the API keys
uvicorn main:app --reload
```
The API runs at http://localhost:8000, with interactive docs at http://localhost:8000/docs. Check http://localhost:8000/api/health to confirm it's up.

### 2. Frontend
In a second terminal:
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173. The Vite dev server proxies every `/api` request, including the transcription WebSocket, to the backend on port 8000, so you don't need any frontend env config.

### 3. Create your first account
The database starts empty, with no demo data.
1. Click **Register your company** on the landing page (or go to `/create-company`). This creates the company and its first **admin** user.
2. As the admin, open **Invitations** in the sidebar and generate invitation codes (`INV-XXXX-XXXX`), one per teammate, choosing each teammate's role. **Company Profile** (also in the sidebar) lets the admin edit the company's details and logo.
3. Teammates sign up with their code and are placed in your company with that role.

Every user can open **User Guide** in the sidebar for a walkthrough of each screen.

To test every screen on your own, invite yourself with different emails, one per role.

## Environment variables
All settings are read in [backend/config.py](backend/config.py) from environment variables or `backend/.env`. See [backend/.env.example](backend/.env.example) for a commented template.

| Variable | Required? | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | Yes | Mongo connection string. Must support TLS, e.g. an Atlas `mongodb+srv://...` URI |
| `MONGODB_DB` | No (defaults to `jobvelo`) | Database name |
| `CORS_ORIGINS` | No (defaults to `http://localhost:5173`) | Comma-separated allowed frontend origins |
| `JWT_SECRET` | For any deployment | If unset, a random key is generated on every start, which logs everyone out on restart |
| `DEEPGRAM_API_KEY` | For interviews | Live transcription |
| `OPENAI_API_KEY` | For interviews | Interview plans, question suggestions, bias checks, reports, scoring |
| `GEMINI_API_KEY` | For CV analysis and profile feedback | CV / cover-letter analysis, interviewer feedback, behavioural suggestions |

Model names (`OPENAI_QUESTION_MODEL`, `OPENAI_ANALYSIS_MODEL`, `OPENAI_BIAS_MODEL`, `GEMINI_CV_MODEL`, `DEEPGRAM_MODEL`), `DEEPGRAM_ENDPOINTING_MS`, `JWT_ALGORITHM`, `JWT_EXPIRE_MINUTES` (default 7 days) and `UPLOADS_DIR` can also be overridden. Defaults are in `config.py` and shown in `.env.example`.

The app starts without API keys. Each service raises a clear error only when it's called.

## Running day to day
```bash
# terminal 1
cd backend && source .venv/bin/activate && uvicorn main:app --reload
# terminal 2
cd frontend && npm run dev
```

## Testing and linting
| What | Command | Run from |
| --- | --- | --- |
| Backend tests | `python -m pytest -m "not db_integration"` | `backend/` (venv active) |
| Backend real-DB tests | `TEST_MONGODB_URI="mongodb+srv://..." python -m pytest -m db_integration` | `backend/` |
| Backend lint | `ruff check .` (add `--fix` to auto-fix) | `backend/` |
| Frontend unit tests | `npm test` | `frontend/` |
| Frontend lint | `npm run lint` | `frontend/` |
| Frontend build check | `npm run build` | `frontend/` |
| End-to-end tests | `npx playwright install` (once), then `npx playwright test` | `frontend/` |

Most backend tests don't need a real database. They patch the Mongo connection, and the `*_integration.py` tests use `mongomock-motor`, which is installed from `requirements-dev.txt`. The tests marked `db_integration` (`tests/test_db_real_integration.py`) run against a real MongoDB. They skip themselves when `TEST_MONGODB_URI` isn't set, and they use a throwaway `jv_real_integration_tests` database that is dropped afterwards, so your real data is never touched. A plain `python -m pytest` therefore also works; the real-DB tests just show as skipped.

The Playwright tests mock the API with `page.route`, so they don't need the backend. Playwright starts the Vite dev server itself, or reuses one already running on port 5173.

**CI** ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs on every push and pull request, in three jobs:
- **backend:** `pip-audit` dependency scan, Ruff, then the mocked test suite (`-m "not db_integration"`).
- **backend-db-integration:** the `db_integration` tests against Atlas, using the `MONGODB_URI` repository secret.
- **frontend:** `npm ci`, `npm audit --audit-level=high --omit=dev`, ESLint, Vitest and a production build.

The Playwright suite ([.github/workflows/e2e.yml](.github/workflows/e2e.yml)) runs weekly (Mondays) and can be started by hand from the Actions tab.

**Pre-commit hooks** run Ruff and ESLint before each commit:
```bash
pip install pre-commit   # once
pre-commit install       # once, from the repo root
```

## Key concepts
- **Company (tenant).** Every user belongs to one company, and all data is scoped to it. The company ID comes from the user's JWT on the server, never from the request.
- **Roles:**
  - `admin` creates the company, manages invitations and edits the company profile. Admins don't manage jobs.
  - `recruiter` manages jobs and candidates, and schedules interviews and assigns interviewers.
  - `interviewer` runs interviews; only the assigned interviewer can start or resume one.
  - `hiring_manager` sees cross-interviewer analytics, such as the interview consistency page.
- **Data model:** jobs and candidates are many-to-many, linked through a **job-candidate** record (one per application). Each link holds its CV analysis and interview plan, and each application has an **interview**.
- **Interview lifecycle:** `not_scheduled` → `scheduled` → `in_progress` → `completed` (or `cancelled`). The app treats this as one-way: once started, an interview doesn't go back to scheduled.
  - **Before:** the candidate page shows a **Prep** tab. A scheduled interview can only be started from **10 minutes before** its scheduled time; an interview with no time set isn't restricted.
  - **During:** the live workspace runs at `/interview/:id/live`. Re-entering an in-progress interview lands on a **Resume** tab first.
  - **After:** the candidate page shows the transcript and reports. Completing an interview also detects interviewer **interruptions** (the interviewer starting to speak while the candidate is still talking) and, when they're frequent, adds an improvement point about them to the interviewer report.

## Where to start coding
- **New API endpoint:** add `backend/routes/your_feature.py` with an `APIRouter(prefix="/api/your-feature")`, then `app.include_router(your_feature.router)` in `backend/main.py`. Put request and response models in `backend/models/`.
- **New page:** add `frontend/src/pages/YourPage.jsx`, then a `<Route>` in `frontend/src/App.jsx`. Wrap it in `<RequireAuth>`, plus `<RequireRole>` if needed.
- **Calling Deepgram / OpenAI / Gemini:** go through `backend/services/`. Don't call the SDKs directly from routes.
- **Calling the API from the frontend:** use `api` / `authedFetch` from `frontend/src/lib/api.js`, which attach the auth token.
- **Styling:** use Tailwind classes driven by the design tokens. Don't hard-code hex or px values. See [frontend/README.md](frontend/README.md#design-tokens).

## Troubleshooting
- **Backend hangs ~30s on startup, then fails with a server-selection timeout:** it can't reach MongoDB. Check `MONGODB_URI`, that your IP is on the Atlas network access list, and that you're not pointing at a non-TLS local `mongod`.
- **Logged out after restarting the backend:** set `JWT_SECRET` in `.env`.
- **Every request returns 401:** your token expired or belongs to a different `JWT_SECRET`. Log in again.
- **No live transcript:** check `DEEPGRAM_API_KEY`, allow microphone access in the browser, and press **Ready** in the Recording Setup dialog.
- **Can't start an interview:** it's scheduled more than 10 minutes from now. The start dialog shows when it becomes available and unlocks on its own, without a refresh.
- **"Report generation already in progress" (409) when completing:** another request is already generating the reports. If that attempt crashed, the lock expires after 10 minutes and you can try again.
- **`ModuleNotFoundError: mongomock_motor` when running tests:** install the dev requirements: `pip install -r requirements-dev.txt`.
