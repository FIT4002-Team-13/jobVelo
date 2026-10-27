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
| `src/lib/` | API client, auth, validators, the interview start window (`interviewWindow.js`) |
| `src/utils/` | Small pure helpers: formatting, time, status labels, avatar and speaker colours, shared enums (`constants.js`), transcript display cleanup (`transcript.js`) |
| `src/content/` | `userGuide.json`: the text behind the User Guide page |
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
| `/admin/company` | `CompanyProfilePage` | `admin` only: edit company details and logo |
| `/user-guide` | `UserGuidePage` | In-app help for every role, built from `src/content/userGuide.json` |
| `*` | `ErrorPage` | 404 |

## The interview flow
`CandidatePage` (`/interview/:id`) picks a **phase** from the interview's status and shows different tabs:

| Status | Phase | Tabs | Main action |
| --- | --- | --- | --- |
| `not_scheduled` / `scheduled` | **prep** | Prep · CV · Cover Letter | *Begin Interview* (a footer shown on every prep tab) opens `StartInterviewModal`; confirming sets the status to `in_progress` and opens the live page |
| `in_progress` | **resume** | Resume · CV · Cover Letter | *Resume Interview* asks for confirmation, then opens the live page |
| `completed` | **debrief** | Transcript · CV · Cover Letter | Reports, scores, bias incidents, PDF downloads |

Every "start" or "resume" button in the app (jobs table, candidate detail, profile card) leads to this page. Nothing jumps straight to `/live` for an existing interview.

**Start window.** A scheduled interview can only be started from `EARLY_START_MINUTES` (10) before its scheduled time, with no upper limit. Unscheduled interviews aren't restricted. The rule lives in `lib/interviewWindow.js` (`canStartInterview`, `startAvailableLabel`), and `useCanStartInterview` re-renders when the window opens, so a page left open unlocks without a refresh. `StartInterviewModal` uses it to disable the start button and show "Available from ...". This is a frontend rule only; the backend doesn't enforce it.

**Debrief transcript.** `TranscriptAnalysisTab` shows the saved transcript through `mergeTranscriptFragments()` (`utils/transcript.js`). It joins consecutive same-speaker fragments into readable paragraphs (about 300 characters) and never merges across a section start. It only changes the display: the stored entries and their ids, which notes and evidence links point at, stay as they are.

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

Other hooks: `useAsync` (load data with loading/error state), `useTableControls` (search, sort and pagination for tables) and `useCanStartInterview` (see *Start window* above).

## Components
| Folder | Contents |
| --- | --- |
| `common/` | Sidebar, Avatar, StatusBadge, Pagination, EmptyState, CommandPalette, ScoreBar, StatDelta, toasts (`ToastContext`) |
| `auth/` | `RequireAuth`, `RequireRole`, auth form layout and fields |
| `job-candidate/` | Jobs and candidates tables, table controls, job/candidate modals, `StartInterviewModal` (start confirmation and start window) |
| `candidate/` | Candidate info card, add/edit forms, score panels, document viewers, interview plan card (drag-to-reorder sections, `SectionMenu`, `QuestionCard`, `QuestionCategoryPill`), `BeginInterviewFooter` |
| `candidate/tabs/` | The `CandidatePage` tabs (`InterviewPrepTab`, `InterviewResumeTab`, `TranscriptAnalysisTab`, `CvTab`, `CoverLetterTab`) plus `ProfileTab`, which is used by `ProfilePage` |
| `interview/` | Live-page pieces: transcript panel, question deck, section timers, recording setup, report modal |
| `analytics/` | Interview consistency charts |
| `profile/` | Interviewer feedback and behavioural suggestion panels |
| `admin/` | Invitation code generation (`GenerateCodesModal`), company details form (`CompanyProfileForm`) |
| `landing/` | Public landing page sections, including `GettingStartedSection` |

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
3. If it should appear in navigation, add it to `navItems` in `components/common/Sidebar.jsx`. Each item has a `group` that decides its heading and who sees it: `MAIN` and `GROUP` (everyone), `INSIGHTS` (`hiring_manager`), `ADMIN` (`admin`) and `HELP` (everyone, holds the User Guide). The logo at the top of the sidebar links to `/dashboard`.
4. If users need to know how to use it, add a section to `src/content/userGuide.json`. Its icons are looked up by name in the `ICONS` map in `pages/UserGuidePage.jsx`, so import and register any new `lucide-react` icon there.

## Tests
```bash
npm test               # Vitest unit tests (src/test)
npm run lint           # ESLint
npx playwright test    # e2e (e2e/)
```
- **Unit tests** (`src/test/`): `App.test.jsx`, `api.test.jsx`, `interviewWindow.test.js` (start-window rules) and `transcript.test.js` (fragment merging).
- **E2E tests** (`e2e/`): one spec per feature area (auth, jobs, candidates, CV analysis, interview start and session, reports, profile stats, admin, company profile, security). They stub the backend with `page.route`, so only the frontend is needed, and Playwright starts `npm run dev` itself (or reuses a server already on :5173). Run `npx playwright install` once first.
- Use `npm ci` for a clean install from the lockfile, as CI does. CI also runs `npm audit --audit-level=high --omit=dev`; `package.json` has an `overrides` entry pinning `braces` to fix an advisory.
