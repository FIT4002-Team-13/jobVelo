import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import { api } from '../lib/api.js'

// ── Style tokens for summary cards ──────────────────────────────────────────

const CARD_STYLES = [
  { label: 'Today',     key: 'today_interviews',    bg: 'bg-tint-mint',  countColor: 'text-mint-600',  labelColor: 'text-mint-700',  unitColor: 'text-mint-500'  },
  { label: 'Completed', key: 'completed_interviews', bg: 'bg-tint-sky',   countColor: 'text-sky-500',   labelColor: 'text-sky-700',   unitColor: 'text-sky-400'   },
  { label: 'Up-coming', key: 'upcoming_interviews',  bg: 'bg-tint-coral', countColor: 'text-coral-500', labelColor: 'text-coral-700', unitColor: 'text-coral-400' },
]

// ── Sub-components ───────────────────────────────────────────────────────────

function SearchBar({ placeholder }) {
  return (
    <div className="flex items-center gap-2 border border-neutral-200 rounded-pill px-3 py-1.5 bg-neutral-0 text-sm text-neutral-400">
      <input
        placeholder={placeholder}
        className="outline-none border-none bg-transparent text-sm text-neutral-500 placeholder:text-neutral-400 w-28"
      />
      <svg className="shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
      </svg>
    </div>
  )
}

function FilterBtn({ label }) {
  return (
    <button className="flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700 transition-colors">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
      </svg>
      {label}
    </button>
  )
}

function SortBtn() {
  return (
    <button className="flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700 transition-colors">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 6h18M6 12h12M9 18h6" />
      </svg>
      Sort
    </button>
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
                <SearchBar placeholder="Position Name" />
                <SortBtn />
                <FilterBtn label="Filter" />
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {jobs.length === 0 ? (
                <EmptyState message="No jobs yet" hint="Create one from the Jobs page." />
              ) : (
                jobs.map((job, i) => (
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
                    <span className="bg-primary-500 text-white text-xs font-semibold px-3 py-1 rounded-pill">
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
                <SearchBar placeholder="Candidate Name" />
                <SortBtn />
                <FilterBtn label="Filter" />
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {candidates.length === 0 ? (
                <EmptyState
                  message="No candidates yet"
                  hint="Candidates appear here once someone is added to a job."
                />
              ) : (
                candidates.map((c) => (
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
