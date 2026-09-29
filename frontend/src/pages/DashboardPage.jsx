import { Link } from 'react-router-dom'
import { Briefcase, Users, CalendarCheck2, CalendarClock, CalendarDays } from 'lucide-react'
import Sidebar from '../components/common/Sidebar'
import { api } from '../lib/api.js'
import { JOB_STATUS_STYLES, CANDIDATE_STATUS_STYLES, FALLBACK_STATUS_CLASS } from '../utils/status.js'
import { JOB_STATUS_OPTIONS as BASE_JOB_STATUS_OPTIONS, CANDIDATE_FILTER_OPTIONS as BASE_CANDIDATE_FILTER_OPTIONS, withAllOption } from '../utils/constants.js'
import { SortMenu, FilterMenu } from '../components/job-candidate/TableControls'
import EmptyState from '../components/common/EmptyState'
import Pagination from '../components/common/Pagination'
import { page } from '../styles/layout'
import { useAsync } from '../hooks/useAsync.js'
import { useTableControls } from '../hooks/useTableControls.js'
import { useAuth } from '../lib/AuthContext.jsx'

// Filter options for the dashboard's two panels, with an "All" entry
// prepended. Kept in sync with the filter on JobDetailPage so the UX is
// identical across pages.
const JOB_STATUS_OPTIONS = withAllOption(BASE_JOB_STATUS_OPTIONS)
const CANDIDATE_FILTER_OPTIONS = withAllOption(BASE_CANDIDATE_FILTER_OPTIONS)



// ── Summary card configs ────────────────────────────────────────────────────
// Personal (non-admin) cards. Same white-card + tinted-icon anatomy as the
// admin stat cards - the old full-pastel cards blended into the page
// background; keeping the colour to the icon square gives them an edge.
const PERSONAL_CARDS = [
  {
    label: 'Today',
    key: 'today_interviews',
    icon: <CalendarDays size={22} className="text-mint-600" />,
    iconTint: 'bg-mint-100',
    deltaText: 'interviews today',
  },
  {
    label: 'Completed',
    key: 'completed_interviews',
    icon: <CalendarCheck2 size={22} className="text-sky-500" />,
    iconTint: 'bg-sky-100',
    deltaText: 'interviews completed',
  },
  {
    label: 'Up-coming',
    key: 'upcoming_interviews',
    icon: <CalendarClock size={22} className="text-coral-500" />,
    iconTint: 'bg-coral-100',
    deltaText: 'interviews ahead',
  },
]

const PAGE_SIZE = 5

// `userId` comes from AuthContext (already resolved by the time a logged-in
// user can reach this page - see useAuth() below) rather than an api.me()
// call here, so this is a single parallel wave, not two sequential ones.
// Each call is independently best-effort (defaults on failure) so one flaky
// endpoint doesn't blank the whole dashboard.
async function loadDashboardData(userId) {
  // Candidates panel reads from /api/applications?user_id=<id> instead of
  // /api/candidates so it shows the SAME rows as the /candidates page (one
  // per application where the current user is the interviewer, scoped to
  // the company server-side).
  const [summary, jobsData, apps, interviews] = await Promise.all([
    api.getDashboardSummary().catch(() => null),
    api.listJobs().catch(() => []),
    api.listApplications({ user_id: userId }).catch(() => []),
    api.listInterviews().catch(() => []),
  ])

  const jobs = Array.isArray(jobsData) ? jobsData : []
  const allInterviews = Array.isArray(interviews) ? interviews : []

  // Distinct candidates per job with a completed interview, so repeat
  // interviews don't overcount - drives the same display override JobsPage
  // uses, so the pill here never disagrees with the one on the Jobs page.
  const candsByJob = {}
  for (const i of allInterviews) {
    if (i.intv_status !== 'completed' || !i.job_id) continue
    ;(candsByJob[i.job_id] ??= new Set()).add(i.cand_id)
  }
  const completedByJob = Object.fromEntries(
    Object.entries(candsByJob).map(([jobId, cands]) => [jobId, cands.size])
  )

  // Map the application rows into the shape the panel renders
  // (cand_full_name / cand_email / cand_status / cand_created_at). Keep
  // `_cand_id` and `_job_id` around so a click can navigate straight to the
  // candidate-detail page.
  const candidates = Array.isArray(apps)
    ? apps.map((a) => ({
        // Application id is unique even when the same candidate has
        // multiple applications - use it as the React key.
        cand_id:         a.application_id,
        cand_full_name:  a.candidate_name,
        cand_email:      a.email,
        cand_status:     a.status,
        cand_created_at: a.interview_datetime,
        _cand_id:        a.cand_id,
        _job_id:         a.job_id,
        // Real profile-creation date, for the admin summary delta.
        _cand_created_at: a.cand_created_at,
      }))
    : []

  return { summary, jobs, candidates, completedByJob, allInterviews }
}

// ── Sub-components ───────────────────────────────────────────────────────────

// Controlled search input - parent owns the string + filter logic so the
// same component can power either panel.
function SearchBar({ placeholder, value, onChange }) {
  return (
    <div className="flex items-center gap-2 border border-neutral-200 rounded-xl px-3 py-1.5 bg-neutral-0 text-sm text-neutral-400">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="outline-none border-none bg-transparent text-sm text-neutral-500 placeholder:text-neutral-400 w-32"
      />
      <svg className="shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
      </svg>
    </div>
  )
}

// Company-wide stat card for the admin summary: tinted icon square on the
// left; uppercase label, big count, and a small "this month" delta stacked
// on the right. Mirrors the reference design's card anatomy while using
// the app's own palette tokens.
function SummaryStatCard({ icon, iconTint, label, value, deltaText, deltaClass }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-neutral-0 px-5 py-5 shadow-sm">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconTint}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
          {label}
        </p>
        <p className="text-3xl font-extrabold leading-tight text-neutral-900 tabular-nums">
          {value}
        </p>
        <p className={`text-xs font-semibold ${deltaClass}`}>{deltaText}</p>
      </div>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  // toLocaleDateString return dd/mm/yyy, replace keeps the slashes as is but ensures it's always in the same format regardless of user locale.
  const today = new Date().toLocaleDateString('en-AU').replace(/\//g, '/')

  const { user } = useAuth()
  const userId = user?.userid ?? null
  const { data, loading, error } = useAsync(
    userId ? () => loadDashboardData(userId) : null,
    [userId]
  )
  const summary         = data?.summary ?? null
  const jobs             = data?.jobs ?? []
  const candidates       = data?.candidates ?? []
  const completedByJob   = data?.completedByJob ?? {}
  const allInterviews    = data?.allInterviews ?? []

  const jobsWithStatus = jobs.map((j) => {
    const filled = j.candidates_filled ?? 0
    const done   = completedByJob[j.id ?? j._id] ?? 0
    const display_status =
      j.status === 'Completed' ? 'Completed'
      : filled > 0 && done >= filled ? 'Completed'
      : done > 0 ? 'In Progress'
      : j.status
    return { ...j, display_status }
  })
  const jobPanel = useTableControls(jobsWithStatus, {
    matchesSearch: (j, needle) => (j.title ?? '').toLowerCase().includes(needle),
    matchesFilter: (j, filters) => filters.length === 0 || filters.includes(j.display_status),
    sortFields: { nameField: 'title', dateField: 'job_created_at' },
    pageSize: PAGE_SIZE,
  })

  // Dashboard is a glance-view of the active pipeline. A candidate with no
  // application (cand_status is null) is just a stored profile - not in the
  // pipeline yet - and showing them here would burn dashboard slots on rows
  // the recruiter can't act on.
  const eligibleCandidates = candidates.filter((c) => c.cand_status)
  const candPanel = useTableControls(eligibleCandidates, {
    matchesSearch: (c, needle) => `${c.cand_full_name ?? ''} ${c.cand_email ?? ''}`.toLowerCase().includes(needle),
    matchesFilter: (c, filters) => filters.length === 0 || filters.includes(c.cand_status),
    sortFields: { nameField: 'cand_full_name', dateField: 'cand_created_at' },
    pageSize: PAGE_SIZE,
  })

  // Company-wide totals for the admin's summary cards - all derived from
  // data the dashboard already fetches, so no extra requests. Deltas count
  // what landed inside the current calendar month.
  const isAdmin = user?.role === 'admin'
  const _now = new Date()
  const _monthStart = new Date(_now.getFullYear(), _now.getMonth(), 1)
  const _nextMonthStart = new Date(_now.getFullYear(), _now.getMonth() + 1, 1)
  const inThisMonth = (iso) => {
    if (!iso) return false
    const d = new Date(iso)
    return !Number.isNaN(d.getTime()) && d >= _monthStart && d < _nextMonthStart
  }
  const uniqueCandidateCount = new Set(
    candidates.map((c) => c._cand_id).filter(Boolean)
  ).size
  const newCandidatesThisMonth = new Set(
    candidates
      .filter((c) => inThisMonth(c._cand_created_at))
      .map((c) => c._cand_id)
      .filter(Boolean)
  ).size
  const jobsThisMonth = jobs.filter((j) => inThisMonth(j.job_created_at)).length
  const completedInterviews = allInterviews.filter((i) => i.intv_status === 'completed')
  const completedThisMonth = completedInterviews.filter((i) =>
    inThisMonth(i.intv_date_time)
  ).length
  const upcomingInterviews = allInterviews.filter(
    (i) =>
      i.intv_status === 'scheduled' &&
      i.intv_date_time &&
      new Date(i.intv_date_time) > _now
  )
  const upcomingThisMonth = upcomingInterviews.filter(
    (i) => new Date(i.intv_date_time) < _nextMonthStart
  ).length

  const growthDelta = (n) => ({
    deltaText: n > 0 ? `+${n} this month` : 'no change this month',
    deltaClass: n > 0 ? 'text-mint-600' : 'text-neutral-400',
  })
  const adminCards = [
    {
      label: 'Total Jobs',
      value: jobs.length,
      icon: <Briefcase size={22} className="text-primary-500" />,
      iconTint: 'bg-primary-100',
      ...growthDelta(jobsThisMonth),
    },
    {
      label: 'Candidates',
      value: uniqueCandidateCount,
      icon: <Users size={22} className="text-mint-600" />,
      iconTint: 'bg-mint-100',
      ...growthDelta(newCandidatesThisMonth),
    },
    {
      label: 'Interviews Completed',
      value: completedInterviews.length,
      icon: <CalendarCheck2 size={22} className="text-sky-500" />,
      iconTint: 'bg-sky-100',
      ...growthDelta(completedThisMonth),
    },
    {
      label: 'Upcoming Interviews',
      value: upcomingInterviews.length,
      icon: <CalendarClock size={22} className="text-coral-500" />,
      iconTint: 'bg-coral-100',
      deltaText: `${upcomingThisMonth} this month`,
      deltaClass: upcomingThisMonth > 0 ? 'text-coral-500' : 'text-neutral-400',
    },
  ]

  // The sidebar (and header, below) render immediately from the already-
  // resolved AuthContext user - only the data-dependent content underneath
  // waits on the dashboard's own fetch, so navigating here never blanks the
  // whole page the way a full-page loading/error return used to.
  if (loading) return (
    <div className={page.shell}>
      <Sidebar user={user ?? undefined} />
      <main className={page.main}>
        <div className={page.loading}>
          <p className="text-sm text-neutral-400">Loading...</p>
        </div>
      </main>
    </div>
  )

  if (error) return (
    <div className={page.shell}>
      <Sidebar user={user ?? undefined} />
      <main className={page.main}>
        <div className={page.loading}>
          <p className="text-sm text-coral-500">{error}</p>
        </div>
      </main>
    </div>
  )

  return (
    <div className={page.shell}>
      <Sidebar user={user ?? undefined} />

      <main className={page.main}>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-4xl font-extrabold tracking-tight text-neutral-800">
            Hello, <em className="italic">{user?.full_name}</em>
          </h1>
          <p className="mt-1 text-sm font-medium text-primary-500">{today}</p>
        </div>

        {/* Summary - role-aware. Admins get the company-wide totals (jobs,
            candidates, completed + upcoming interviews); everyone else
            keeps the personal today/completed/upcoming interview cards. */}
        <section className="mb-7">
          <h2 className="text-base font-bold text-neutral-800">Summary</h2>
          <p className="text-xs text-neutral-400 mb-4">
            {isAdmin
              ? 'Company-wide recruitment overview'
              : 'Overview of your recruitment pipeline'}
          </p>

          {isAdmin ? (
            <div className="grid grid-cols-4 gap-4">
              {adminCards.map((c) => (
                <SummaryStatCard key={c.label} {...c} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {PERSONAL_CARDS.map((card) => (
                <SummaryStatCard
                  key={card.label}
                  icon={card.icon}
                  iconTint={card.iconTint}
                  label={card.label}
                  value={summary?.[card.key] ?? 0}
                  deltaText={card.deltaText}
                  deltaClass="text-neutral-400"
                />
              ))}
            </div>
          )}
        </section>

        <hr className="border-neutral-200 mb-6" />

        {/* Jobs & Candidates */}
        <div className="grid grid-cols-2 gap-10">

          {/* Jobs */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-neutral-800">Jobs</h2>
              <div className="flex items-center gap-3">
                <SearchBar
                  placeholder="Position Name"
                  value={jobPanel.search}
                  onChange={jobPanel.setSearch}
                />
                <SortMenu value={jobPanel.sortKey} onChange={jobPanel.setSortKey} />
                <FilterMenu
                  values={jobPanel.filters}
                  onChange={jobPanel.setFilters}
                  options={JOB_STATUS_OPTIONS}
                  singleSelect
                />
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {jobPanel.sorted.length === 0 ? (
                <EmptyState message="No jobs yet" hint="Create one from the Jobs page." />
              ) : (
                jobPanel.paged.map((job) => (
                  // Whole row is now a Link to the job-detail page - matches
                  // how the JobsPage grid behaves and saves users the trip
                  // through /jobs just to drill into a job they can see here.
                  <Link
                    key={job.id ?? job._id}
                    to={`/jobs/${job.id ?? job._id}`}
                    className="flex items-center justify-between bg-neutral-0 border border-neutral-200 rounded-xl px-4 py-3 hover:shadow-sm hover:border-primary-200 transition-all no-underline"
                  >
                    <div>
                      <p className="text-sm font-semibold text-neutral-800">{job.title}</p>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        Candidates: {job.candidates_filled ?? 0}/{job.candidates_total ?? 0}
                      </p>
                    </div>
                    <span className={`text-xs font-bold px-3 py-1 rounded-pill ${JOB_STATUS_STYLES[job.display_status] ?? FALLBACK_STATUS_CLASS}`}>
                      {job.display_status}
                    </span>
                  </Link>
                ))
              )}
            </div>

            {/* Footer: pagination on the left when there's more than one
                page, View-All on the right. justify-between keeps the
                View-All anchored to the right whether pagination shows or
                not (the empty <div /> placeholder takes care of layout). */}
            <div className="flex items-center justify-between mt-3">
              <Pagination
                page={jobPanel.safePage}
                totalPages={jobPanel.totalPages}
                onPrev={() => jobPanel.setPage((p) => Math.max(0, p - 1))}
                onNext={() => jobPanel.setPage((p) => Math.min(jobPanel.totalPages - 1, p + 1))}
              />
              {jobPanel.totalPages <= 1 && <div />}
              <Link to="/jobs" className="text-sm font-semibold text-primary-500 hover:text-primary-600">
                &gt; View All
              </Link>
            </div>
          </section>

          {/* Candidates */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-neutral-800">Candidates</h2>
              <div className="flex items-center gap-3">
                <SearchBar
                  placeholder="Candidate Name"
                  value={candPanel.search}
                  onChange={candPanel.setSearch}
                />
                <SortMenu value={candPanel.sortKey} onChange={candPanel.setSortKey} />
                {/* Candidate filter is single-select so it stays consistent
                    with the JobDetailPage one (which has 2 options today). */}
                <FilterMenu
                  values={candPanel.filters}
                  onChange={candPanel.setFilters}
                  options={CANDIDATE_FILTER_OPTIONS}
                  singleSelect
                />
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {candPanel.paged.length === 0 ? (
                <EmptyState
                  message="No candidates yet"
                  hint="Candidates appear here once someone is added to a job."
                />
              ) : (
                candPanel.paged.map((c) => (
                  // Whole row is a Link to the candidate-detail page now -
                  // matches how the /candidates table behaves. The Link uses
                  // the underlying cand_id + job_id captured during the
                  // application-mapping (not the application_id we use as the
                  // row key).
                  <Link
                    key={c.cand_id}
                    to={c._cand_id && c._job_id ? `/candidates/${c._cand_id}/${c._job_id}` : '#'}
                    className="flex items-center justify-between bg-neutral-0 border border-neutral-200 rounded-xl px-4 py-3 hover:shadow-sm hover:border-primary-200 transition-all no-underline"
                  >
                    <div>
                      <p className="text-sm font-semibold text-neutral-800">{c.cand_full_name}</p>
                      <p className="text-xs text-neutral-400 mt-0.5">{c.cand_email}</p>
                    </div>
                    <span
                      className={`text-xs font-bold px-3 py-1 rounded-pill ${
                        CANDIDATE_STATUS_STYLES[c.cand_status] ?? FALLBACK_STATUS_CLASS
                      }`}
                    >
                      {c.cand_status ?? 'No application'}
                    </span>
                  </Link>
                ))
              )}
            </div>

            {/* Footer: pagination on the left when there's more than one
                page, View-All on the right. Same layout as the Jobs panel. */}
            <div className="flex items-center justify-between mt-3">
              <Pagination
                page={candPanel.safePage}
                totalPages={candPanel.totalPages}
                onPrev={() => candPanel.setPage((p) => Math.max(0, p - 1))}
                onNext={() => candPanel.setPage((p) => Math.min(candPanel.totalPages - 1, p + 1))}
              />
              {candPanel.totalPages <= 1 && <div />}
              <Link to="/candidates" className="text-sm font-semibold text-primary-500 hover:text-primary-600">
                &gt; View All
              </Link>
            </div>
          </section>

        </div>
      </main>
    </div>
  )
}
