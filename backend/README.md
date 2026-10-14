# Jobvelo backend

FastAPI + MongoDB (Motor). Setup, environment variables and test commands are in the [root README](../README.md). This file explains how the backend is organised.

## Layout
| Path | What lives there |
| --- | --- |
| `main.py` | Builds the FastAPI app, CORS, startup/shutdown (Mongo connect + `ensure_indexes`), registers every router, `/api/health` |
| `config.py` | `Settings` (pydantic-settings). Every env var and its default |
| `database.py` | Mongo client lifecycle, `get_db()`, index definitions in `ensure_indexes()` |
| `dependencies.py` | FastAPI dependencies: `get_current_user`, `get_current_comp_id`, `require_role(...)` |
| `security.py` | bcrypt hashing, JWT create/decode, password strength rules |
| `routes/` | One module per API area (see below) |
| `routes/_scoping.py` | Shared tenant guards, e.g. "does this interview belong to the caller's company?" |
| `models/` | Pydantic request/response models, one module per collection |
| `services/` | Wrappers around external services and heavier logic |
| `scripts/` | One-off maintenance and seed scripts |
| `tests/` | pytest suite |

## Auth and tenancy
- **Login** returns a JWT. The frontend sends it as `Authorization: Bearer <token>` on every request.
- **`get_current_user`** decodes the token and loads the user. **`get_current_comp_id`** gives the caller's company.
- **Scope every query to `comp_id` from the token, never from the request body or query string.** This is what stops one company seeing another's data. If a collection doesn't store `comp_id` directly (e.g. interviews), use the guards in `routes/_scoping.py`.
- **Role gates:** `Depends(require_role("admin"))` returns 403 for anyone else. Roles are `admin`, `recruiter`, `interviewer` and `hiring_manager` (`models/user.py`).
- **Signup paths:**
  - `POST /api/auth/signup-company` creates a company and its admin.
  - Invited teammates sign up with an invitation code. The company and role come from the invitation, not the form.

## API areas
All routes are under `/api`. The live, exact list is at http://localhost:8000/docs.

| Prefix | Module | Purpose |
| --- | --- | --- |
| `/api/auth` | `auth.py` | Signup (company / invited), login, current user |
| `/api/invitations` | `invitations.py` | Admin: generate, list and delete invitation codes |
| `/api/companies` | `companies.py` | Company details and logo |
| `/api/users` | `users.py` | Look up teammates (e.g. the interviewer picker) |
| `/api/jobs` | `jobs.py`, `jobs_candidates.py` | Job posts, and candidates nested under a job |
| `/api/candidates` | `cand.py` | Candidate records and their documents |
| `/api/job-candidates` | `job_cand.py` | The job ↔ candidate link: CV analysis, sub-scores, interview plan |
| `/api/applications` | `applications.py` | The cross-job applications list |
| `/api/cv-analysis` | `cv_analysis.py` | Gemini CV / cover-letter analysis, one per job-candidate link |
| `/api/interviews` | `interview.py` | Interview CRUD, status changes, AI interview plan, completion (reports + scores), report/transcript PDFs |
| `/api/interview-users` | `user_interview.py` | Who is assigned to which interview |
| `/api/interview-questions` | `interview_question.py` | AI-generated interview questions |
| `/api/realtime/transcribe` | `realtime.py` | **WebSocket**: streams audio to Deepgram and pushes transcript and bias events back |
| `/api/dashboard` | `dashboard.py` | Today / upcoming / completed counters |
| `/api/analytics` | `analytics.py` | Hiring-manager interview consistency stats |
| `/api/interviewer-stats` | `interviewer_stats.py` | Interviewer profile: totals, average score, trend |
| `/api/interviewer-feedback` | `interviewer_feedback.py` | AI feedback on how an interviewer conducts interviews |
| `/api/behavioural-suggestions` | `behavioural_suggestions.py` | Behavioural-question improvement suggestions |
| `/api/files` | `files.py` | Streams uploaded files back from GridFS (public) |

## Data model
MongoDB collections. Each document's fields are defined in the matching module under `models/`.

```
companies ─1──N─ users
    │
    ├─1──N─ jobs ─┐
    │             ├─ job_candidates  (one per application: CV analysis, scores, plan)
    └─1──N─ candidates ─┘        │
                                 └─ interviews  (status, transcript, sections, reports)
                                        └─ interview_users  (assigned interviewer)

cv_analyses              - Gemini output, keyed by job-candidate link
invitations              - admin-issued signup codes
interviewer_feedback     - append-only AI feedback snapshots per interviewer
behavioural_suggestions  - suggested improvements to behavioural questions
```

**Interview status:** `not_scheduled` → `scheduled` → `in_progress` → `completed` (or `cancelled`).
- The UI treats this as one-way, but `PATCH /api/interviews/{id}` doesn't enforce the order. It only checks that the caller is the assigned interviewer when setting `in_progress`.
- Completed interviews are protected: `tests/test_state_machine.py` covers this, along with the hardened `/complete` endpoint.
- While in progress, the frontend autosaves `intv_transcript`, `intv_duration_seconds` and `intv_sections` (including section timer progress), so a session can be left and resumed.
- `POST /api/interviews/{id}/complete` produces the candidate and interviewer reports and scores.

**Uploaded files** (CVs, cover letters, logos) are stored in **GridFS** by `services/file_storage.py`. Documents store a relative path string, which is used as the GridFS filename. The `uploads/` folder and the `UPLOADS_DIR` setting are left over from the old disk-based storage.

## Services
| Module | Use it for |
| --- | --- |
| `deepgram_service.py` | `DeepgramSession`: open a live STT stream, push 16 kHz mono PCM, receive transcript events |
| `openai_service.py` | Live next-question suggestions, bias checks on interviewer questions, interview summaries, scoring |
| `gemini_service.py` | CV / cover-letter analysis. Takes PDF bytes directly |
| `file_storage.py` | Save, read and delete files in GridFS |
| `report_pdf.py` | Render a report as a PDF (fpdf2) |
| `transcript.py` | Render a transcript as a PDF |

Routes should call these, not the SDKs directly. Missing API keys only raise an error when a service is actually used.

## Adding an endpoint
1. Create `routes/my_feature.py`:
   ```python
   from fastapi import APIRouter, Depends
   from database import get_db
   from dependencies import get_current_comp_id, require_role

   router = APIRouter(prefix="/api/my-feature", tags=["my_feature"])

   @router.get("")
   async def list_things(comp_id=Depends(get_current_comp_id)):
       return await get_db().things.find({"comp_id": comp_id}).to_list(None)
   ```
2. Add request and response models in `models/my_feature.py`.
3. Import the module in `main.py` and call `app.include_router(my_feature.router)`.
4. If you query on new fields, add indexes in `database.ensure_indexes()`.
5. Add tests in `tests/`.

## Tests
```bash
python -m pytest                 # whole suite
python -m pytest tests/test_auth.py -k login
```
- The `client` fixture in `tests/conftest.py` patches the Mongo connection, so plain route tests need no database.
- `*_integration.py` tests run against `mongomock-motor`, an in-memory fake MongoDB.
- Install the dev requirements first: `pip install -r requirements-dev.txt`.

Lint with `ruff check .` (config in `ruff.toml`). CI runs both on every push.

## Scripts
Run these from `backend/` with the venv active. Both use the database in your `.env`.
- `python -m scripts.dummy_feedback` seeds a completed interview with feedback for a test account. Edit `MY_EMAIL` in the script first.
- `python -m scripts.delete_bad_candidates` deletes candidate documents missing an email or company ID.

## Known gaps
- The realtime WebSocket (`/api/realtime/transcribe`) is **not authenticated** (noted in `routes/realtime.py`).
- `connect_to_mongo()` always uses `tls=True`, so a non-TLS local MongoDB won't connect.
