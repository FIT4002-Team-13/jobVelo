import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Briefcase, Users, CalendarCheck2, CalendarClock, CalendarDays } from 'lucide-react'
import Sidebar from '../components/common/Sidebar'
import { api, authedFetch } from '../lib/api.js'
import { SortMenu, FilterMenu, makeSorter } from '../components/job-candidate/TableControls'
import { page } from '../styles/layout'

// Filter options for the dashboard's two panels.
//   - Jobs filter by their own status enum (Pending / In Progress / Completed).
//   - Candidates filter by their rolled-up status from /api/candidates' new
//     `cand_status` field (SCHEDULED / EVALUATED). Kept in sync with the
//     filter on JobDetailPage so the UX is identical across pages.
const JOB_STATUS_OPTIONS = [
  { value: '',            label: 'All'         },
  { value: 'Pending',     label: 'Pending'     },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Completed',   label: 'Completed'   },
]
const CANDIDATE_FILTER_OPTIONS = [
  { value: '',              label: 'All'           },
  { value: 'NOT SCHEDULED', label: 'Not Scheduled' },
  { value: 'SCHEDULED',     label: 'Scheduled'     },
  { value: 'IN PROGRESS',   label: 'In Progress'   },
  { value: 'COMPLETED',     label: 'Completed'     },
  { value: 'CANCELLED',     label: 'Cancelled'     },
]

// Solid-fill status pills - kept in sync with JobsPage + JobDetailPage.
// Pending = warning (coral), In Progress = active (primary), Completed = done (mint).
const STATUS_STYLES = {
  Pending:       'bg-coral-500 text-white',
  'In Progress': 'bg-primary-500 text-white',
  Completed:     'bg-mint-500 text-white',
}

// Candidate status pills - mirror the JobDetailPage palette so the same
// status looks identical wherever it shows. Soft tint here (vs solid for
// jobs) because candidates appear in a denser list and solid would shout.
const CANDIDATE_STATUS_STYLES = {
  'NOT SCHEDULED': 'bg-neutral-100 text-neutral-500',
  SCHEDULED:       'bg-primary-100 text-primary-600',
  'IN PROGRESS':   'bg-amber-100 text-amber-700',
  COMPLETED:       'bg-mint-100 text-mint-700',
  CANCELLED:       'bg-coral-100 text-coral-700',
  EVALUATED:       'bg-mint-100 text-mint-700',
  HIRED:           'bg-mint-500 text-white',
  REJECTED:        'bg-coral-100 text-coral-700',
}

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

// Default page size for both panels. Five rows fits the dashboard layout
// without forcing the viewport to scroll - "View All" remains the path
// for someone who actually wants to browse the full list.
const PAGE_SIZE = 5

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

// SortBtn / FilterBtn used to be defined here as non-functional placeholders;
// they've moved to components/TableControls.jsx and are now wired up to local
// state below. Search bar stays local because it's a different shape.

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

// Shown inside the Jobs / Candidates panels when the list is empty.
function EmptyState({ message, hint }) {
  return (
    <div className="bg-neutral-0 border border-dashed border-neutral-200 rounded-xl px-4 py-6 text-center">
      <p className="text-sm font-medium text-neutral-500">{message}</p>
      {hint && <p className="text-xs text-neutral-400 mt-1">{hint}</p>}
    </div>
  )
}

// Compact Prev/Next + page indicator. Used by both panels so the pagination
// affordance reads identically across the page.
//
// Parent owns the page state; this component only renders + emits clicks.
// Renders nothing when totalPages <= 1 - no point showing controls for a
// single page.
function Pagination({ page, totalPages, onPrev, onNext }) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center gap-2 text-xs text-neutral-500">
      <button
        type="button"
        onClick={onPrev}
        disabled={page === 0}
        aria-label="Previous page"
        className="w-7 h-7 flex items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <span className="tabular-nums font-medium">
        Page <span className="text-neutral-700">{page + 1}</span> / {totalPages}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={page >= totalPages - 1}
        aria-label="Next page"
        className="w-7 h-7 flex items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  // toLocaleDateString return dd/mm/yyy, replace keeps the slashes as is but ensures it's always in the same format regardless of user locale.
  const today = new Date().toLocaleDateString('en-AU').replace(/\//g, '/')

  const [me,         setMe]         = useState(null)
  const [summary,    setSummary]    = useState(null)
  const [jobs,       setJobs]       = useState([])
  const [candidates, setCandidates] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  // Per-job count of DISTINCT candidates with a completed interview -
  // drives the same display override JobsPage uses, so the pill here
  // never disagrees with the one on the Jobs page.
  const [completedByJob, setCompletedByJob] = useState(() => ({}))
  // Full company interviews list - feeds the admin summary cards
  // (completed / upcoming counts) without another fetch.
  const [allInterviews, setAllInterviews] = useState([])

  // Search + sort + filter state, one set per panel.
  const [jobSearch,        setJobSearch]        = useState('')
  const [jobSortKey,       setJobSortKey]       = useState('latest')
  const [jobFilter,        setJobFilter]        = useState('')
  const [candSearch,       setCandSearch]       = useState('')
  const [candSortKey,      setCandSortKey]      = useState('latest')
  const [candFilter,       setCandFilter]       = useState('')

  // Pagination state, one page index per panel. Reset to 0 when a search
  // or filter change shrinks the list out from under the current page
  // (handled below via the `safePage` clamp - cheaper than a useEffect).
  const [jobPage,  setJobPage]  = useState(0)
  const [candPage, setCandPage] = useState(0)

  // Derived lists - search → filter → sort. Computed each render; cheap
  // enough at dashboard sizes that useMemo is overkill.
  const jobSorter = makeSorter(jobSortKey, { nameField: 'title', dateField: 'job_created_at' })
  const jobNeedle = jobSearch.trim().toLowerCase()
  // Stamp each job with the status the row will actually display and
  // filter on that same value, mirroring JobsPage:
  //   all candidates completed -> Completed; some -> In Progress;
  //   an explicitly-Completed job keeps its label.
  const jobsWithStatus = jobs.map(j => {
    const filled = j.candidates_filled ?? 0
    const done = completedByJob[j.id ?? j._id] ?? 0
    const display_status =
      j.status === 'Completed'
        ? 'Completed'
        : filled > 0 && done >= filled
        ? 'Completed'
        : done > 0
        ? 'In Progress'
        : j.status
    return { ...j, display_status }
  })
  const visibleJobs = jobsWithStatus
    .filter(j => !jobNeedle || (j.title ?? '').toLowerCase().includes(jobNeedle))
    .filter(j => !jobFilter || j.display_status === jobFilter)
  const sortedJobs = jobSorter ? [...visibleJobs].sort(jobSorter) : visibleJobs

  const candSorter = makeSorter(candSortKey, { nameField: 'cand_full_name', dateField: 'cand_created_at' })
  const candNeedle = candSearch.trim().toLowerCase()
  const visibleCandidates = candidates.filter((c) => {
    // Dashboard is a glance-view of the active pipeline. A candidate with no
    // application (cand_status is null) is just a stored profile - not in
    // the pipeline yet - and showing them here would burn dashboard slots
    // on rows the recruiter can't act on. Browse / clean-up of profile-only
    // candidates belongs on a dedicated /candidates page later.
    if (!c.cand_status) return false
    if (candNeedle) {
      const haystack = `${c.cand_full_name ?? ''} ${c.cand_email ?? ''}`.toLowerCase()
      if (!haystack.includes(candNeedle)) return false
    }
    // candFilter is '' for "All"; otherwise the selected status.
    if (candFilter && c.cand_status !== candFilter) return false
    return true
  })
  const sortedCandidates = candSorter ? [...visibleCandidates].sort(candSorter) : visibleCandidates

  // Pagination: clamp the current page against the (possibly) shrunken
  // result set, then slice for display. We clamp at render-time instead
  // of an effect so the controls always reflect the data we're actually
  // showing - no flicker, no stale "Page 3 / 1" intermediate state.
  // Company-wide totals for the admin's summary cards - all derived from
  // data the dashboard already fetches, so no extra requests. Deltas count
  // what landed inside the current calendar month.
  const isAdmin = me?.role === 'admin'
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

  const jobTotalPages   = Math.max(1, Math.ceil(sortedJobs.length        / PAGE_SIZE))
  const candTotalPages  = Math.max(1, Math.ceil(sortedCandidates.length  / PAGE_SIZE))
  const safeJobPage     = Math.min(jobPage,  jobTotalPages  - 1)
  const safeCandPage    = Math.min(candPage, candTotalPages - 1)
  const pagedJobs       = sortedJobs.slice(safeJobPage  * PAGE_SIZE, (safeJobPage  + 1) * PAGE_SIZE)
  const pagedCandidates = sortedCandidates.slice(safeCandPage * PAGE_SIZE, (safeCandPage + 1) * PAGE_SIZE)

  useEffect(() => {
    async function load() {
      try {
        // Step 1: who am I? Need userid before /api/applications can scope
        // to "my candidates" - matches the /candidates page filter.
        const meData = await api.me()

        // Step 2: parallel fetch the rest. Candidates panel now reads from
        // /api/applications?user_id=<me> instead of /api/candidates so it
        // shows the SAME rows as the /candidates page (one per application
        // where the current user is the interviewer, scoped to the
        // company server-side).
        const [sumRes, jobsRes, appsRes, intvRes] = await Promise.all([
          authedFetch('/api/dashboard/summary'),
          authedFetch('/api/jobs'),
          authedFetch(`/api/applications?user_id=${encodeURIComponent(meData.userid)}`),
          authedFetch('/api/interviews'),
        ])
        setMe(meData)

        // Guard both HTTP status and payload shape before storing into
        // state: on an expired token these come back as {detail: ...},
        // and storing that into array state white-screens the page at
        // `.filter is not a function`.
        setSummary(sumRes.ok ? await sumRes.json().catch(() => null) : null)
        const jobsData = jobsRes.ok ? await jobsRes.json().catch(() => []) : []
        setJobs(Array.isArray(jobsData) ? jobsData : [])

        // Best-effort: if the interviews fetch fails, rows simply show
        // their stored status without the completed-override. Distinct
        // candidates per job, so repeat interviews don't overcount.
        const intvData = intvRes.ok ? await intvRes.json().catch(() => []) : []
        if (Array.isArray(intvData)) {
          setAllInterviews(intvData)
          const candsByJob = {}
          for (const i of intvData) {
            if (i.intv_status !== 'completed' || !i.job_id) continue
            ;(candsByJob[i.job_id] ??= new Set()).add(i.cand_id)
          }
          setCompletedByJob(
            Object.fromEntries(
              Object.entries(candsByJob).map(([jobId, cands]) => [jobId, cands.size])
            )
          )
        }

        // Map the application rows into the shape the panel renders
        // (cand_full_name / cand_email / cand_status / cand_created_at).
        // Keep `_cand_id` and `_job_id` around so a click can navigate
        // straight to the candidate-detail page.
        const apps = await appsRes.json()
        const rows = Array.isArray(apps)
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
        setCandidates(rows)
      } catch (err) {
        console.error('Dashboard fetch failed:', err)
        setError('Failed to load dashboard data.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return (
    <div className={page.loading}>
      <p className="text-sm text-neutral-400">Loading...</p>
    </div>
  )

  if (error) return (
    <div className={page.loading}>
      <p className="text-sm text-coral-500">{error}</p>
    </div>
  )

  return (
    <div className={page.shell}>
      {/* If me hasn't loaded, pass undefined to Sidebar to show skeleton instead of user info */}
      <Sidebar user={me ?? undefined} />

      <main className={page.main}>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-4xl font-extrabold tracking-tight text-neutral-800">
            Hello, <em className="italic">{me?.full_name}</em>
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
                  value={jobSearch}
                  onChange={setJobSearch}
                />
                <SortMenu value={jobSortKey} onChange={setJobSortKey} />
                <FilterMenu
                  values={[jobFilter]}
                  onChange={(newValues) => setJobFilter(newValues[0] ?? '')}
                  options={JOB_STATUS_OPTIONS}
                  singleSelect
                />
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {sortedJobs.length === 0 ? (
                <EmptyState message="No jobs yet" hint="Create one from the Jobs page." />
              ) : (
                pagedJobs.map((job) => (
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
                    <span className={`text-xs font-bold px-3 py-1 rounded-pill ${STATUS_STYLES[job.display_status] ?? 'bg-neutral-100 text-neutral-500'}`}>
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
                page={safeJobPage}
                totalPages={jobTotalPages}
                onPrev={() => setJobPage((p) => Math.max(0, p - 1))}
                onNext={() => setJobPage((p) => Math.min(jobTotalPages - 1, p + 1))}
              />
              {jobTotalPages <= 1 && <div />}
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
                  value={candSearch}
                  onChange={setCandSearch}
                />
                <SortMenu value={candSortKey} onChange={setCandSortKey} />
                {/* Candidate filter is single-select so it stays consistent
                    with the JobDetailPage one (which has 2 options today). */}
                <FilterMenu
                  values={[candFilter]}
                  onChange={(newValues) => setCandFilter(newValues[0] ?? '')}
                  options={CANDIDATE_FILTER_OPTIONS}
                  singleSelect
                />
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {pagedCandidates.length === 0 ? (
                <EmptyState
                  message="No candidates yet"
                  hint="Candidates appear here once someone is added to a job."
                />
              ) : (
                pagedCandidates.map((c) => (
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
                        CANDIDATE_STATUS_STYLES[c.cand_status]
                          ?? 'bg-neutral-100 text-neutral-400'
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
                page={safeCandPage}
                totalPages={candTotalPages}
                onPrev={() => setCandPage((p) => Math.max(0, p - 1))}
                onNext={() => setCandPage((p) => Math.min(candTotalPages - 1, p + 1))}
              />
              {candTotalPages <= 1 && <div />}
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
