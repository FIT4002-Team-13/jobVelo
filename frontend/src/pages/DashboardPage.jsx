import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Sidebar from '../components/common/Sidebar'
import { api } from '../lib/api.js'
import { SortMenu, FilterMenu, makeSorter } from '../components/job-candidate/TableControls'

// Filter options for the dashboard's two panels. Jobs filter by their
// own status enum; the candidates panel has nothing meaningful to filter
// by yet (CandidateOut has no status field), so we pass an empty array
// and FilterMenu shows "No filter options yet." Will fill in once we
// have e.g. an `applications` rollup with statuses per candidate.
const JOB_STATUS_OPTIONS = [
  { value: 'Pending',     label: 'Pending'     },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Completed',   label: 'Completed'   },
]
const CANDIDATE_FILTER_OPTIONS = []

// Solid-fill status pills - kept in sync with JobsPage + JobDetailPage.
// Pending = warning (coral), In Progress = active (primary), Completed = done (mint).
const STATUS_STYLES = {
  Pending:       'bg-coral-500 text-white',
  'In Progress': 'bg-primary-500 text-white',
  Completed:     'bg-mint-500 text-white',
}

// ── Style tokens for summary cards ──────────────────────────────────────────

const CARD_STYLES = [
  { label: 'Today',     key: 'today_interviews',    bg: 'bg-tint-mint',  countColor: 'text-mint-600',  labelColor: 'text-mint-700',  unitColor: 'text-mint-500'  },
  { label: 'Completed', key: 'completed_interviews', bg: 'bg-tint-sky',   countColor: 'text-sky-500',   labelColor: 'text-sky-700',   unitColor: 'text-sky-400'   },
  { label: 'Up-coming', key: 'upcoming_interviews',  bg: 'bg-tint-coral', countColor: 'text-coral-500', labelColor: 'text-coral-700', unitColor: 'text-coral-400' },
]

// ── Sub-components ───────────────────────────────────────────────────────────

// Controlled search input - parent owns the string + filter logic so the
// same component can power either panel.
function SearchBar({ placeholder, value, onChange }) {
  return (
    <div className="flex items-center gap-2 border border-neutral-200 rounded-pill px-3 py-1.5 bg-neutral-0 text-sm text-neutral-400">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="outline-none border-none bg-transparent text-sm text-neutral-500 placeholder:text-neutral-400 w-28"
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

  // Derived lists - search → filter → sort. Computed each render; cheap
  // enough at dashboard sizes that useMemo is overkill.
  const jobSorter = makeSorter(jobSortKey, { nameField: 'title', dateField: 'job_created_at' })
  const jobNeedle = jobSearch.trim().toLowerCase()
  const visibleJobs = jobs
    .filter(j => !jobNeedle || (j.title ?? '').toLowerCase().includes(jobNeedle))
    .filter(j => jobStatusFilters.length === 0 || jobStatusFilters.includes(j.status))
  const sortedJobs = jobSorter ? [...visibleJobs].sort(jobSorter) : visibleJobs

  const candSorter = makeSorter(candSortKey, { nameField: 'cand_full_name', dateField: 'cand_created_at' })
  // CANDIDATE_FILTER_OPTIONS is empty for now, so the filter stage is a
  // no-op until we wire a real candidate-status concept. Search + sort
  // already work.
  const candNeedle = candSearch.trim().toLowerCase()
  const visibleCandidates = candidates.filter(c =>
    !candNeedle
    || (c.cand_full_name ?? '').toLowerCase().includes(candNeedle)
    || (c.cand_email     ?? '').toLowerCase().includes(candNeedle)
  )
  const sortedCandidates = candSorter ? [...visibleCandidates].sort(candSorter) : visibleCandidates

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
    <div className="flex h-screen items-center justify-center bg-neutral-50 font-sans">
      <p className="text-sm text-neutral-400">Loading...</p>
    </div>
  )

  if (error) return (
    <div className="flex h-screen items-center justify-center bg-neutral-50 font-sans">
      <p className="text-sm text-coral-500">{error}</p>
    </div>
  )

  return (
    <div className="flex h-screen bg-neutral-50 font-sans">
      {/* If me hasn't loaded, pass undefined to Sidebar to show skeleton instead of user info */}
      <Sidebar user={me ?? undefined} />

      <main className="flex-1 overflow-y-auto px-10 py-8">

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
                sortedJobs.map((job, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-neutral-0 border border-neutral-200 rounded-xl px-4 py-3 hover:shadow-sm transition-shadow"
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
                  </div>
                ))
              )}
            </div>

            <div className="text-right mt-3">
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
                <FilterMenu values={candFilters} onChange={setCandFilters} options={CANDIDATE_FILTER_OPTIONS} />
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {sortedCandidates.length === 0 ? (
                <EmptyState
                  message="No candidates yet"
                  hint="Candidates appear here once someone is added to a job."
                />
              ) : (
                sortedCandidates.map((c) => (
                  <div
                    key={c.cand_id}
                    className="flex items-center justify-between bg-neutral-0 border border-neutral-200 rounded-xl px-4 py-3 hover:shadow-sm transition-shadow"
                  >
                    <div>
                      <p className="text-sm font-semibold text-neutral-800">{c.cand_full_name}</p>
                      <p className="text-xs text-neutral-400 mt-0.5">{c.cand_email}</p>
                    </div>
                    <Link
                      to={`/candidates/${c.cand_id}`}
                      className="text-xs font-semibold px-4 py-1.5 rounded-lg transition-opacity hover:opacity-80 text-white bg-primary-500"
                    >
                      View
                    </Link>
                  </div>
                ))
              )}
            </div>

            <div className="text-right mt-3">
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
