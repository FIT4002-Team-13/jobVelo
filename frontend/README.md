# Jobvelo frontend

React 18 + Vite + Tailwind CSS + React Router 6. Setup and commands are in the [root README](../README.md). This file explains how the frontend is organised.

## Layout
| Path | What lives there |
| --- | --- |
| `src/main.jsx` | Mounts `<App />` |
| `src/App.jsx` | **Every route**, the auth/role guards, and the toast and error-boundary providers |
| `src/pages/` | One component per route |
| `src/components/` | Reusable UI, grouped by feature (below) |
| `src/hooks/` | Data loading and live-interview logic |
| `src/lib/` | API client, auth, validators |
| `src/utils/` | Small pure helpers: formatting, time, status labels, avatar and speaker colours |
| `src/styles/` | Design tokens and shared class strings |
| `src/test/` | Vitest unit tests (`setup.js` configures jsdom + jest-dom) |
| `e2e/` | Playwright end-to-end tests |

## Routes
Defined in `src/App.jsx`. Everything except the public pages is wrapped in `<RequireAuth>`.

| Path | Page | Notes |
| --- | --- | --- |
| `/` | `LandingPage` | Public |
| `/login`, `/signup` | `LoginPage`, `SignupPage` | Signup requires an invitation code |
| `/create-company` | `CreateCompanyPage` | Creates a company and its admin |
| `/dashboard` | `DashboardPage` | Interview counters (today / upcoming / completed) and job overview |
| `/schedules` | `SchedulesPage` | Week calendar of scheduled interviews |
| `/jobs`, `/jobs/:id` | `JobsPage`, `JobDetailPage` | Job posts and each job's candidates |
| `/candidates` | `ApplicationsPage` | All applications across jobs |
| `/candidates/:candId/:jobId` | `CandidateDetailPage` | Redirects to the interview page once an interview exists |
| `/interview/:id` | `CandidatePage` | The candidate's interview hub: Prep, Resume or Debrief (below) |
| `/interview/:id/live` | `InterviewPage` | Live recording workspace |
| `/cv-analysis/:jobcandId` | `CvAnalysisPage` | Full CV analysis report |
| `/profile` | `ProfilePage` | The user's profile, interviewer stats and feedback |
| `/interview-consistency` | `InterviewConsistencyPage` | `hiring_manager` only |
| `/admin/dashboard` | `AdminDashboardPage` | `admin` only: invitation codes |
| `*` | `ErrorPage` | 404 |

## The interview flow
`CandidatePage` (`/interview/:id`) picks a **phase** from the interview's status and shows different tabs:

| Status | Phase | Tabs | Main action |
| --- | --- | --- | --- |
| `not_scheduled` / `scheduled` | **prep** | CV · Cover Letter · Prep | *Begin Interview* sets the status to `in_progress` and opens the live page |
| `in_progress` | **resume** | Resume · CV · Cover Letter | *Resume Interview* asks for confirmation, then opens the live page |
| `completed` | **debrief** | Transcript · CV · Cover Letter | Reports, scores, bias incidents, PDF downloads |

Every "start" or "resume" button in the app (jobs table, candidate detail, profile card) leads to this page. Nothing jumps straight to `/live` for an existing interview.

`InterviewPage` (`/interview/:id/live`) only runs while the interview is `in_progress`. For any other status it redirects back to `/interview/:id`. The live page is built from these hooks:

| Hook | Responsibility |
| --- | --- |
| `useInterviewData` | Loads the interview, candidate, job, job-candidate link and CV analysis |
| `useAudioCapture` | Mic and screen-share capture, the Deepgram WebSocket, pause, and the **main interview timer** (resumes from `intv_duration_seconds`) |
| `useTranscript` | Transcript state, speaker assignment, notes, localStorage backup, and a 30-second autosave to the server |
| `useInterviewSections` | Timed plan sections. They advance off the main timer, so pausing pauses them. Progress is saved into `intv_sections` so it survives leaving and resuming |
| `useInterviewQuestions` | Live AI follow-up question suggestions |
| `useBias` | Bias warnings raised from the interviewer's questions |
| `useAssignedInterviewer` | Who is assigned to the interview (only they can start or resume it) |

Other hooks: `useAsync` (load data with loading/error state) and `useTableControls` (search, sort and pagination for tables).

## Components
| Folder | Contents |
| --- | --- |
| `common/` | Sidebar, Avatar, StatusBadge, Pagination, EmptyState, CommandPalette, toasts (`ToastContext`) |
| `auth/` | `RequireAuth`, `RequireRole`, auth form layout and fields |
| `job-candidate/` | Jobs and candidates tables, job/candidate modals, `StartInterviewModal` |
| `candidate/` | Candidate info card, add/edit forms, score panels, document viewers, interview plan card |
| `candidate/tabs/` | The `CandidatePage` tabs (`InterviewPrepTab`, `InterviewResumeTab`, `TranscriptAnalysisTab`, `CvTab`, `CoverLetterTab`) plus `ProfileTab`, which is used by `ProfilePage` |
| `interview/` | Live-page pieces: transcript panel, question deck, section timers, recording setup, report modal |
| `analytics/` | Interview consistency charts |
| `profile/` | Interviewer feedback and behavioural suggestion panels |
| `admin/` | Invitation code generation |
| `landing/` | Public landing page sections |

## Talking to the backend
- **Use `api.*` or `authedFetch` from `src/lib/api.js`.** Both attach the JWT. A plain `fetch` to a data endpoint will get a 401.
- Use relative URLs (`/api/...`). In development, Vite proxies `/api`, including WebSockets, to `http://localhost:8000` (`vite.config.js`).
- **Auth:** `lib/AuthContext.jsx` provides `useAuth()`, which returns `{ user, login, logout, ... }`. The token and user are cached in localStorage under one key (`lib/authStore.js`).
- `user.role` is one of `admin`, `recruiter`, `interviewer` or `hiring_manager`. Gate routes with `<RequireRole allow={[...]}>`. The backend enforces the same rules, so the frontend checks are only for UX.

## Design tokens
Tokens are centralised in `src/styles/` and fed into `tailwind.config.js`, so every utility class comes from one source:
- `colors.js`: brand palette (`primary`, `sky`, `mint`, `coral`, `neutral`) plus semantic colours
- `typography.js`: font families, sizes, weights and text roles
- `spacing.js`: spacing scale, radii and shadows
- `layout.js`: shared class strings (`flex.row`, `card.base`, `button.primary`, `modal.overlay`, `page.shell`, ...) so common patterns look identical everywhere

**Change a token and every consumer updates. Don't hard-code hex or px values in components.** Tailwind's default palette (e.g. `amber`, `violet`) is also available for status colours.

**Speaker colours:** `buildSpeakerColors()` in `utils/avatar.js` gives each transcript speaker a distinct colour, with the interviewer blue and the candidate green. The live and saved transcripts both use it, so the colours match.

## Adding a page
1. Create `src/pages/MyPage.jsx`. Use `<Sidebar />` and `page.shell` from `styles/layout.js` to match the existing pages.
2. Add a `<Route>` in `src/App.jsx`, wrapped in `<RequireAuth>` (and `<RequireRole>` if needed).
3. If it should appear in navigation, add it to the items list in `components/common/Sidebar.jsx`.

## Tests
```bash
npm test               # Vitest unit tests (src/test)
npm run lint           # ESLint
npx playwright test    # e2e (e2e/), needs the app running on :5173
```
