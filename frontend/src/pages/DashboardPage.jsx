import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Sidebar from '../components/common/Sidebar'
import { api } from '../lib/api.js'
import { SortMenu, FilterMenu, makeSorter } from '../components/job-candidate/TableControls'
import { page } from '../styles/layout'

// Filter options for the dashboard's two panels.
//   - Jobs filter by their own status enum (Pending / In Progress / Completed).
//   - Candidates filter by their rolled-up status from /api/candidates' new
//     `cand_status` field (SCHEDULED / EVALUATED). Kept in sync with the
//     filter on JobDetailPage so the UX is identical across pages.
const JOB_STATUS_OPTIONS = [
  { value: 'Pending',     label: 'Pending'     },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Completed',   label: 'Completed'   },
]
const CANDIDATE_FILTER_OPTIONS = [
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'EVALUATED', label: 'Evaluated' },
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
  SCHEDULED: 'bg-neutral-100 text-neutral-500',
  EVALUATED: 'bg-sky-100 text-sky-600',
}

// ── Style tokens for summary cards ──────────────────────────────────────────

const CARD_STYLES = [
  { label: 'Today',     key: 'today_interviews',    bg: 'bg-tint-mint',  countColor: 'text-mint-600',  labelColor: 'text-mint-700',  unitColor: 'text-mint-500'  },
  { label: 'Completed', key: 'completed_interviews', bg: 'bg-tint-sky',   countColor: 'text-sky-500',   labelColor: 'text-sky-700',   unitColor: 'text-sky-400'   },
  { label: 'Up-coming', key: 'upcoming_interviews',  bg: 'bg-tint-coral', countColor: 'text-coral-500', labelColor: 'text-coral-700', unitColor: 'text-coral-400' },
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
  const today = new Date().toLocaleDateString('en-GB').replace(/\//g, '/')

  const [me,         setMe]         = useState(null)
  const [summary,    setSummary]    = useState(null)
  const [jobs,       setJobs]       = useState([])
  const [candidates, setCandidates] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)

  // Search + sort + filter state, one set per panel.
  const [jobSearch,        setJobSearch]        = useState('')
  const [jobSortKey,       setJobSortKey]       = useState('latest')
  const [jobStatusFilters, setJobStatusFilters] = useState([])
  const [candSearch,       setCandSearch]       = useState('')
  const [candSortKey,      setCandSortKey]      = useState('latest')
  const [candFilters,      setCandFilters]      = useState([])

  // Pagination state, one page index per panel. Reset to 0 when a search
  // or filter change shrinks the list out from under the current page
  // (handled below via the `safePage` clamp - cheaper than a useEffect).
  const [jobPage,  setJobPage]  = useState(0)
  const [candPage, setCandPage] = useState(0)

  // Derived lists - search → filter → sort. Computed each render; cheap
  // enough at dashboard sizes that useMemo is overkill.
  const jobSorter = makeSorter(jobSortKey, { nameField: 'title', dateField: 'job_created_at' })
  const jobNeedle = jobSearch.trim().toLowerCase()
  const visibleJobs = jobs
    .filter(j => !jobNeedle || (j.title ?? '').toLowerCase().includes(jobNeedle))
    .filter(j => jobStatusFilters.length === 0 || jobStatusFilters.includes(j.status))
  const sortedJobs = jobSorter ? [...visibleJobs].sort(jobSorter) : visibleJobs

  const candSorter = makeSorter(candSortKey, { nameField: 'cand_full_name', dateField: 'cand_created_at' })
  const candNeedle = candSearch.trim().toLowerCase()
  const visibleCandidates = candidates.filter((c) => {
    if (candNeedle) {
      const haystack = `${c.cand_full_name ?? ''} ${c.cand_email ?? ''}`.toLowerCase()
      if (!haystack.includes(candNeedle)) return false
    }
    // candFilters is empty when no filter is active. With singleSelect on
    // FilterMenu it'll always have 0 or 1 entries.
    if (candFilters.length > 0 && !candFilters.includes(c.cand_status)) return false
    return true
  })
  const sortedCandidates = candSorter ? [...visibleCandidates].sort(candSorter) : visibleCandidates

  // Pagination: clamp the current page against the (possibly) shrunken
  // result set, then slice for display. We clamp at render-time instead
  // of an effect so the controls always reflect the data we're actually
  // showing - no flicker, no stale "Page 3 / 1" intermediate state.
  const jobTotalPages   = Math.max(1, Math.ceil(sortedJobs.length        / PAGE_SIZE))
  const candTotalPages  = Math.max(1, Math.ceil(sortedCandidates.length  / PAGE_SIZE))
  const safeJobPage     = Math.min(jobPage,  jobTotalPages  - 1)
  const safeCandPage    = Math.min(candPage, candTotalPages - 1)
  const pagedJobs       = sortedJobs.slice(safeJobPage  * PAGE_SIZE, (safeJobPage  + 1) * PAGE_SIZE)
  const pagedCandidates = sortedCandidates.slice(safeCandPage * PAGE_SIZE, (safeCandPage + 1) * PAGE_SIZE)

  useEffect(() => {
    async function load() {
      try {
        // api.me() hits /api/auth/me with the stored JWT.
        // /api/candidates (cand.py) returns CandidateOut shape with cand_*
        // prefixed fields - the dashboard renders the new shape directly now,
        // empty list shows an empty-state card.
        const [meData, sumRes, jobsRes, candsRes] = await Promise.all([
          api.me(),
          fetch('/api/dashboard/summary'),
          fetch('/api/jobs'),
          fetch('/api/candidates'),
        ])
        setMe(meData)
        setSummary(await sumRes.json())
        setJobs(await jobsRes.json())
        setCandidates(await candsRes.json())
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

        {/* Summary */}
        <section className="mb-7">
          <h2 className="text-base font-bold text-neutral-800">Summary</h2>
          <p className="text-xs text-neutral-400 mb-4">Overview of your recruitment pipeline</p>

          <div className="grid grid-cols-3 gap-4">
            {CARD_STYLES.map((card) => (
              <div key={card.label} className={`${card.bg} rounded-2xl px-6 py-5`}>
                <p className={`text-sm font-semibold ${card.labelColor}`}>{card.label}</p>
                <p className={`text-5xl font-extrabold mt-2 ${card.countColor}`}>{summary?.[card.key] ?? 0}</p>
                <p className={`text-sm font-medium mt-1 ${card.unitColor}`}>interview</p>
              </div>
            ))}
          </div>
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
                <FilterMenu values={jobStatusFilters} onChange={setJobStatusFilters} options={JOB_STATUS_OPTIONS} />
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
                    <span className={`text-xs font-bold px-3 py-1 rounded-pill ${STATUS_STYLES[job.status] ?? 'bg-neutral-100 text-neutral-500'}`}>
                      {job.status}
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
                <FilterMenu values={candFilters} onChange={setCandFilters} options={CANDIDATE_FILTER_OPTIONS} singleSelect />
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {sortedCandidates.length === 0 ? (
                <EmptyState
                  message="No candidates yet"
                  hint="Candidates appear here once someone is added to a job."
                />
              ) : (
                pagedCandidates.map((c) => (
                  <div
                    key={c.cand_id}
                    className="flex items-center justify-between bg-neutral-0 border border-neutral-200 rounded-xl px-4 py-3 hover:shadow-sm transition-shadow"
                  >
                    <div>
                      <p className="text-sm font-semibold text-neutral-800">{c.cand_full_name}</p>
                      <p className="text-xs text-neutral-400 mt-0.5">{c.cand_email}</p>
                    </div>
                    {/* Status pill replaces the old "View" button - the dashboard
                        is a glance-view, drill-down lives on the job detail page.
                        Falls back to a neutral "No application" pill when the
                        candidate exists as a profile but isn't on any job. */}
                    <span
                      className={`text-xs font-bold px-3 py-1 rounded-pill ${
                        CANDIDATE_STATUS_STYLES[c.cand_status]
                          ?? 'bg-neutral-100 text-neutral-400'
                      }`}
                    >
                      {c.cand_status ?? 'No application'}
                    </span>
                  </div>
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
