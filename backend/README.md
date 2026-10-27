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
- **Role gates:** `Depends(require_role("admin"))` returns 403 for anyone else. Roles are `admin`, `recruiter`, `interviewer` and `hiring_manager` (`models/user.py`). The main gates:

  | Action | Allowed roles |
  | --- | --- |
  | Invitations, editing the company and its logo | `admin` |
  | Creating, editing and deleting jobs; adding candidates to a job; editing applications; creating interviews; assigning interviewers | `recruiter` |
  | Updating an interview (`PATCH`) and completing it | `interviewer`, `hiring_manager`, and only the assigned interviewer can set `in_progress` |
  | Interview consistency analytics | `hiring_manager` |

  Admins can no longer manage jobs; that is recruiter-only.
- **Signup paths:**
  - `POST /api/auth/signup-company` creates a company and its admin.
  - Invited teammates sign up with an invitation code. The company and role come from the invitation, not the form.

## API areas
All routes are under `/api`. The live, exact list is at http://localhost:8000/docs.

| Prefix | Module | Purpose |
| --- | --- | --- |
| `/api/auth` | `auth.py` | Signup (company / invited), login, current user |
| `/api/invitations` | `invitations.py` | Admin: generate, list and delete invitation codes |
| `/api/companies` | `companies.py` | Read company details; admins can update details (`PUT`) and the logo (`PATCH /{comp_id}/logo`) |
| `/api/users` | `users.py` | Look up teammates (e.g. the interviewer picker) |
| `/api/jobs` | `jobs.py`, `jobs_candidates.py` | Job posts, and candidates nested under a job |
| `/api/candidates` | `cand.py` | Candidate records and their documents |
| `/api/job-candidates` | `job_cand.py` | The job ↔ candidate link: CV analysis, sub-scores, interview plan |
| `/api/applications` | `applications.py` | The cross-job applications list |
| `/api/cv-analysis` | `cv_analysis.py` | Gemini CV / cover-letter analysis, one per job-candidate link |
| `/api/interviews` | `interview.py` | Interview CRUD, status changes, AI interview plan (10 to 240 minutes), completion (reports, scores, interruption analysis), report/transcript PDFs |
| `/api/interview-users` | `user_interview.py` | Who is assigned to which interview |
| `/api/interview-questions` | `interview_question.py` | AI-generated interview questions per job, plus `/{job_id}/reactive` (follow-ups to what was just said) and `/{job_id}/similar` (swap a question for a similar one) |
| `/api/realtime/transcribe` | `realtime.py` | **WebSocket**: streams audio to Deepgram and pushes transcript, diarised transcript and bias events back. Pass `?role=interviewer` on the interviewer's mic stream to enable bias checks |
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
- `POST /api/interviews/{id}/complete` produces the candidate and interviewer reports and scores. It works like this:
  - It takes a lock by setting `intv_report_state` to `generating` (with `intv_report_started_at`). A second call gets a 409. A lock older than 10 minutes counts as stale and can be taken over, so a crashed attempt doesn't block the interview forever.
  - If report generation throws, `intv_report_state` is set to `failed` and the lock is released.
  - Before calling the LLM it runs `_detect_interruptions()`: an interviewer (`source="mic"`) entry that starts while a candidate (`source="screen"`) entry is still running counts as an interruption, except for short acknowledgements ("yeah", "okay", "mm-hmm"...). At 0.3 or more per minute the interviewer report gets an improvement point about it.

**Transcript entries** (`TranscriptEntry` in `models/interview.py`) have `id`, `timestamp`, `speaker`, `text` and an optional `comment` (the interviewer's note). They can also carry `source` (`mic` or `screen`), `stream_id`, `speaker_id`, `speaker_role`, and `start` / `end` in seconds from Deepgram. Interruption detection needs `source`, `start` and `end`.

**Uploaded files** (CVs, cover letters, logos) are stored in **GridFS** by `services/file_storage.py`. Documents store a relative path string, which is used as the GridFS filename. The `uploads/` folder and the `UPLOADS_DIR` setting are left over from the old disk-based storage.

## Services
| Module | Use it for |
| --- | --- |
| `deepgram_service.py` | `DeepgramSession`: open a live STT stream, push 16 kHz mono PCM, receive transcript and diarisation events (speaker groups with `start` / `end` times). The optional `on_sentence` callback fires once per finished sentence |
| `openai_service.py` | Interview plans (sized to the requested length), suggested, reactive and similar questions, bias checks, interview reports, summaries, scoring and skill ratings |
| `gemini_service.py` | CV / cover-letter analysis (takes PDF bytes directly), interviewer feedback and behavioural-question suggestions |
| `file_storage.py` | Save, read and delete files in GridFS |
| `report_pdf.py` | Render a report as a PDF (fpdf2) |
| `transcript.py` | Render a transcript as a PDF |

Routes should call these, not the SDKs directly. Missing API keys only raise an error when a service is actually used.

**Live bias checks** run per sentence, not per utterance. `realtime.py` passes `on_sentence` to `DeepgramSession` only for the `interviewer` stream, and each finished sentence is checked as soon as Deepgram finalises it. An interviewer who never pauses still gets prompt, sentence-sized warnings instead of one late warning quoting everything.

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
python -m pytest -m "not db_integration"     # everything except the real-DB tests (what CI's backend job runs)
python -m pytest tests/test_auth.py -k login
TEST_MONGODB_URI="mongodb+srv://..." python -m pytest -m db_integration   # real MongoDB
```
- The `client` fixture in `tests/conftest.py` patches the Mongo connection, so plain route tests need no database.
- `*_integration.py` tests run against `mongomock-motor`, an in-memory fake MongoDB.
- `test_db_real_integration.py` is marked `db_integration` (the marker is registered in `pytest.ini`). It connects to `TEST_MONGODB_URI`, works in a separate `jv_real_integration_tests` database and drops it afterwards. Without the variable it skips itself.
- Other suites to know about: `test_security_owasp.py` (OWASP-style checks), `test_post_interview.py` (completion and reports), `test_invitations.py`, `test_company.py` and `test_deepgram_assembly.py` (sentence and diarisation assembly).
- Install the dev requirements first: `pip install -r requirements-dev.txt`.

Lint with `ruff check .` (config in `ruff.toml`; Ruff is pinned to `0.17.0` in `requirements-dev.txt` so local and CI results match). On every push, CI also runs `pip-audit` against `requirements.txt`. A few Starlette advisories are ignored in `.github/workflows/ci.yml` because fixing them needs a FastAPI major upgrade. If you add or bump a dependency and the audit fails, upgrade the package rather than adding another ignore where you can.

## Scripts
Run these from `backend/` with the venv active. Both use the database in your `.env`.
- `python -m scripts.dummy_feedback` seeds a completed interview with feedback for a test account. Edit `MY_EMAIL` in the script first.
- `python -m scripts.delete_bad_candidates` deletes candidate documents missing an email or company ID.

## Known gaps
- The realtime WebSocket (`/api/realtime/transcribe`) is **not authenticated** (noted in `routes/realtime.py`).
- The Starlette CVEs ignored by `pip-audit` in CI stay open until FastAPI is upgraded past `0.115`.
- `connect_to_mongo()` always uses `tls=True`, so a non-TLS local MongoDB won't connect.
